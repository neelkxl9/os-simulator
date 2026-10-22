import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Cpu,
  Layers3,
  ShieldCheck,
  Play,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
  Clock3,
  MemoryStick,
  GitCompareArrows,
} from "lucide-react";
import "./styles.css";

const colors = [
  "#7c8cff",
  "#43d6b5",
  "#ffb86b",
  "#e78bfa",
  "#ff7f9f",
  "#7bd3f7",
  "#c3e879",
];

function scheduleCPU(processes, algorithm, quantum = 2) {
  let ps = processes.map((p, i) => ({
    ...p,
    id: String(p.id || `P${i + 1}`),
    arrival: Math.max(0, +p.arrival || 0),
    burst: Math.max(1, +p.burst || 1),
    priority: +p.priority || 0,
    remaining: Math.max(1, +p.burst || 1),
    firstStart: null,
    completion: null,
    waiting: 0,
    turnaround: 0,
    response: 0,
    color: colors[i % colors.length],
  }));
  const gantt = [];
  let time = 0,
    done = 0,
    guard = 0;
  const add = (p, start, end) => {
    if (end <= start) return;
    const last = gantt[gantt.length - 1];
    if (last && last.id === p.id && last.end === start) last.end = end;
    else gantt.push({ id: p.id, start, end, color: p.color });
  };
  // Round Robin needs a FIFO ready queue; sorting by arrival on every slice
  // incorrectly lets the earliest process monopolize the CPU.
  if (algorithm === "RR") {
    const ordered = [...ps].sort(
      (a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id),
    );
    const queue = [];
    let nextIndex = 0;
    const enqueueArrivals = () => {
      while (nextIndex < ordered.length && ordered[nextIndex].arrival <= time) {
        queue.push(ordered[nextIndex++]);
      }
    };
    const slice = Math.max(1, Math.floor(Number(quantum) || 1));
    while (done < ps.length) {
      enqueueArrivals();
      if (!queue.length) {
        const nextTime = ordered[nextIndex].arrival;
        if (nextTime > time)
          gantt.push({
            id: "Idle",
            start: time,
            end: nextTime,
            color: "#30394e",
            idle: true,
          });
        time = nextTime;
        enqueueArrivals();
      }
      const p = queue.shift();
      if (p.firstStart === null) p.firstStart = time;
      const run = Math.min(slice, p.remaining);
      add(p, time, time + run);
      time += run;
      p.remaining -= run;
      enqueueArrivals(); // arrivals at slice boundary join before requeueing p
      if (p.remaining > 0) queue.push(p);
      else {
        p.completion = time;
        done++;
      }
    }
  } else
    while (done < ps.length && guard++ < 100000) {
      const ready = ps.filter((p) => p.remaining > 0 && p.arrival <= time);
      if (!ready.length) {
        const next = ps
          .filter((p) => p.remaining > 0)
          .reduce((m, p) => Math.min(m, p.arrival), Infinity);
        if (!Number.isFinite(next)) break;
        gantt.push({
          id: "Idle",
          start: time,
          end: next,
          color: "#30394e",
          idle: true,
        });
        time = next;
        continue;
      }
      let p;
      if (algorithm === "SJF")
        p = ready.sort(
          (a, b) =>
            a.burst - b.burst ||
            a.arrival - b.arrival ||
            a.id.localeCompare(b.id),
        )[0];
      else if (algorithm === "Priority")
        p = ready.sort(
          (a, b) => a.priority - b.priority || a.arrival - b.arrival,
        )[0];
      else if (algorithm === "SRTF")
        p = ready.sort(
          (a, b) => a.remaining - b.remaining || a.arrival - b.arrival,
        )[0];
      else
        p = ready.sort(
          (a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id),
        )[0];
      if (p.firstStart === null) p.firstStart = time;
      let run =
        algorithm === "RR" ? Math.min(+quantum || 1, p.remaining) : p.remaining;
      if (algorithm === "SRTF") {
        const nextArrival = ps
          .filter((q) => q.remaining > 0 && q.arrival > time)
          .reduce((m, q) => Math.min(m, q.arrival), Infinity);
        run = Math.min(
          p.remaining,
          Number.isFinite(nextArrival) ? nextArrival - time : p.remaining,
        );
        const end = time + run;
        add(p, time, end);
        p.remaining -= run;
        time = end;
        if (p.remaining === 0) {
          p.completion = time;
          done++;
        }
        continue;
      }
      add(p, time, time + run);
      p.remaining -= run;
      time += run;
      if (p.remaining === 0) {
        p.completion = time;
        done++;
      }
    }
  const rows = ps.map((p) => {
    p.turnaround = p.completion - p.arrival;
    p.waiting = p.turnaround - p.burst;
    p.response = p.firstStart - p.arrival;
    return p;
  });
  return {
    gantt,
    rows,
    avgWT: rows.reduce((s, p) => s + p.waiting, 0) / rows.length,
    avgTAT: rows.reduce((s, p) => s + p.turnaround, 0) / rows.length,
    avgRT: rows.reduce((s, p) => s + p.response, 0) / rows.length,
    makespan: Math.max(0, ...gantt.map((g) => g.end)),
  };
}

function pageReplace(refs, framesCount, algorithm) {
  const frames = [];
  const steps = [];
  let faults = 0,
    hits = 0;
  const lastUsed = new Map();
  refs.forEach((page, i) => {
    let hit = frames.includes(page),
      replaced = null;
    if (hit) {
      hits++;
      lastUsed.set(page, i);
    } else {
      faults++;
      if (frames.length < framesCount) frames.push(page);
      else {
        let victimIndex = 0;
        if (algorithm === "LRU") {
          const victim = frames.reduce((a, b) =>
            lastUsed.get(a) < lastUsed.get(b) ? a : b,
          );
          victimIndex = frames.indexOf(victim);
        }
        if (algorithm === "Optimal") {
          let farthest = -1,
            victim = 0;
          frames.forEach((f, fi) => {
            const next = refs.slice(i + 1).indexOf(f);
            const distance = next === -1 ? Infinity : next;
            if (distance > farthest) {
              farthest = distance;
              victim = fi;
            }
          });
          victimIndex = victim;
        }
        replaced = frames[victimIndex];
        frames[victimIndex] = page;
        if (algorithm === "FIFO") {
          /* rotate the queue so the next oldest frame is first */
        }
      }
      lastUsed.set(page, i);
    }
    steps.push({
      page,
      frames: [...frames],
      hit,
      replaced,
      status: hit ? "HIT" : "FAULT",
    });
    if (algorithm === "FIFO" && !hit && frames.length === framesCount) {
      /* FIFO queue order is maintained separately below in the alternate implementation */
    }
  });
  return {
    steps,
    faults,
    hits,
    hitRate: refs.length ? (hits / refs.length) * 100 : 0,
  };
}
function pageReplaceCorrect(refs, frameCount, algorithm) {
  let frames = [],
    fifoQueue = [],
    lastUsed = new Map(),
    steps = [],
    hits = 0,
    faults = 0;
  refs.forEach((page, i) => {
    const hit = frames.includes(page);
    let replaced = null;
    if (hit) hits++;
    else {
      faults++;
      if (frames.length < frameCount) {
        frames.push(page);
        fifoQueue.push(page);
      } else {
        let victim;
        if (algorithm === "FIFO") victim = fifoQueue.shift();
        else if (algorithm === "LRU")
          victim = frames.reduce((a, b) =>
            lastUsed.get(a) < lastUsed.get(b) ? a : b,
          );
        else
          victim = frames.reduce(
            (best, f) => {
              const n = refs.slice(i + 1).indexOf(f);
              const d = n === -1 ? Infinity : n;
              return d > best.d ? { f, d } : best;
            },
            { f: frames[0], d: -1 },
          ).f;
        replaced = victim;
        const ix = frames.indexOf(victim);
        frames[ix] = page;
        if (algorithm === "FIFO") fifoQueue.push(page);
      }
    }
    lastUsed.set(page, i);
    steps.push({
      page,
      frames: [...frames],
      hit,
      replaced,
      status: hit ? "HIT" : "FAULT",
    });
  });
  return {
    steps,
    faults,
    hits,
    hitRate: refs.length ? (hits / refs.length) * 100 : 0,
  };
}
function banker(available, allocation, max) {
  const need = max.map((row, i) => row.map((v, j) => v - allocation[i][j]));
  const work = [...available],
    finish = allocation.map(() => false),
    sequence = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < finish.length; i++) {
      if (finish[i]) continue;
      if (need[i].every((v, j) => v <= work[j])) {
        work.forEach((_, j) => (work[j] += allocation[i][j]));
        finish[i] = true;
        sequence.push(`P${i}`);
        changed = true;
      }
    }
  }
  return { safe: finish.every(Boolean), sequence, need };
}

function App() {
  const [tab, setTab] = useState("cpu");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [algorithm, setAlgorithm] = useState("FCFS");
  const [quantum, setQuantum] = useState(2);
  const [processes, setProcesses] = useState([
    { id: "P1", arrival: 0, burst: 5, priority: 2 },
    { id: "P2", arrival: 1, burst: 3, priority: 1 },
    { id: "P3", arrival: 2, burst: 8, priority: 3 },
    { id: "P4", arrival: 3, burst: 6, priority: 2 },
  ]);
  const [refsText, setRefsText] = useState(
    "7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2",
  );
  const [frameCount, setFrameCount] = useState(3);
  const [pageAlgorithm, setPageAlgorithm] = useState("LRU");
  const [availableText, setAvailableText] = useState("3, 3, 2");
  const [allocText, setAllocText] = useState(
    "0, 1, 0\n2, 0, 0\n3, 0, 2\n2, 1, 1\n0, 0, 2",
  );
  const [maxText, setMaxText] = useState(
    "7, 5, 3\n3, 2, 2\n9, 0, 2\n2, 2, 2\n4, 3, 3",
  );
  const [ran, setRan] = useState(true);
  const cpu = useMemo(
    () => scheduleCPU(processes, algorithm, quantum),
    [processes, algorithm, quantum],
  );

  const refTokens = refsText.trim() ? refsText.trim().split(/[\s,]+/) : [];

  const refsValid =
    refTokens.length > 0 && refTokens.every((token) => /^\d+$/.test(token));

  const pages = useMemo(
    () =>
      pageReplaceCorrect(
        refsValid ? refTokens.map(Number) : [],
        Math.max(1, +frameCount),
        pageAlgorithm,
      ),
    [refsText, frameCount, pageAlgorithm, refsValid],
  );

  const bank = useMemo(() => {
    try {
      const parse = (s) =>
        s
          .trim()
          .split(/\n/)
          .map((r) =>
            r
              .split(/[\s,]+/)
              .filter(Boolean)
              .map(Number),
          );
      const av = availableText
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      const al = parse(allocText),
        mx = parse(maxText);
      if (
        !av.length ||
        !al.length ||
        al.length !== mx.length ||
        al.some((r, i) => r.length !== av.length || mx[i].length !== av.length)
      )
        return null;
      return banker(av, al, mx);
    } catch {
      return null;
    }
  }, [availableText, allocText, maxText]);
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [tab, algorithm, processes, refsText, frameCount, pageAlgorithm]);

  useEffect(() => {
    if (!playing) return;

    const totalSteps = tab === "cpu" ? cpu.gantt.length : pages.steps.length;

    if (step >= totalSteps) {
      setPlaying(false);
      return;
    }

    const timer = setInterval(() => {
      setStep((previous) => {
        const next = Math.min(previous + 1, totalSteps);
        if (next >= totalSteps) setPlaying(false);
        return next;
      });
    }, 700);

    return () => clearInterval(timer);
  }, [playing, step, tab, cpu.gantt.length, pages.steps.length]);
  const updateP = (i, key, value) => {
    if (value === "" || !Number.isFinite(Number(value))) return;

    const number = Number(value);

    // Arrival time and priority must be non-negative.
    if ((key === "arrival" || key === "priority") && number < 0) return;

    // Burst time must be at least 1.
    if (key === "burst" && number < 1) return;

    setProcesses((prev) =>
      prev.map((p, j) => (j === i ? { ...p, [key]: number } : p)),
    );
  };
  const addProcess = () =>
    setProcesses((p) =>
      [
        ...p,
        { id: `P${p.length + 1}`, arrival: 0, burst: 4, priority: 1 },
      ].slice(0, 8),
    );
  const reset = () => {
    setProcesses([
      { id: "P1", arrival: 0, burst: 5, priority: 2 },
      { id: "P2", arrival: 1, burst: 3, priority: 1 },
      { id: "P3", arrival: 2, burst: 8, priority: 3 },
      { id: "P4", arrival: 3, burst: 6, priority: 2 },
    ]);
    setAlgorithm("FCFS");
    setQuantum(2);
  };
  const AnimationControls = ({ total }) => (
    <div className="animation-controls">
      <span className="animation-progress">
        Step {step} / {total}
      </span>

      <div className="animation-buttons">
        <button className="ghost-button" onClick={() => setPlaying(false)}>
          Pause
        </button>

        <button
          className="primary-button"
          disabled={step >= total}
          onClick={() => setPlaying(true)}
        >
          <Play size={15} /> Play
        </button>

        <button
          className="ghost-button"
          disabled={step >= total}
          onClick={() => {
            setPlaying(false);
            setStep((previous) => Math.min(previous + 1, total));
          }}
        >
          Next step <ArrowRight size={15} />
        </button>

        <button
          className="ghost-button"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
        >
          <RotateCcw size={15} /> Restart
        </button>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Cpu size={22} />
          </div>
          <div>
            <b>OS LAB</b>
            <span>ALGORITHM STUDIO</span>
          </div>
        </div>
        <div className="side-label">SIMULATORS</div>
        <button
          className={`nav-item ${tab === "cpu" ? "active" : ""}`}
          onClick={() => setTab("cpu")}
        >
          <Activity size={18} /> CPU Scheduling{" "}
          <span className="nav-count">05</span>
        </button>
        <button
          className={`nav-item ${tab === "memory" ? "active" : ""}`}
          onClick={() => setTab("memory")}
        >
          <MemoryStick size={18} /> Page Replacement{" "}
          <span className="nav-count">03</span>
        </button>
        <button
          className={`nav-item ${tab === "deadlock" ? "active" : ""}`}
          onClick={() => setTab("deadlock")}
        >
          <ShieldCheck size={18} /> Deadlock Safety{" "}
          <span className="nav-count">01</span>
        </button>
        <div className="sidebar-bottom">
          <div className="status-dot" />
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            OS LAB <span>/</span>{" "}
            <b>
              {tab === "cpu"
                ? "CPU SCHEDULING"
                : tab === "memory"
                  ? "MEMORY MANAGEMENT"
                  : "DEADLOCK AVOIDANCE"}
            </b>
          </div>
          <div className="live-pill">
            <span /> ENGINE READY
          </div>
        </header>
        <section className="page-heading">
          <div>
            <div className="eyebrow">OPERATING SYSTEMS · INTERACTIVE LAB</div>
            <h1>
              {tab === "cpu"
                ? "CPU Scheduling"
                : tab === "memory"
                  ? "Page Replacement"
                  : "Banker’s Algorithm"}
            </h1>
            <p>
              {tab === "cpu"
                ? "Visualize how the CPU allocates time to competing processes."
                : tab === "memory"
                  ? "Explore how virtual memory handles page requests and frame replacement."
                  : "Check whether resource allocation leaves the system in a safe state."}
            </p>
          </div>
          <div className="heading-mark">
            {tab === "cpu" ? (
              <Cpu size={30} />
            ) : tab === "memory" ? (
              <Layers3 size={30} />
            ) : (
              <ShieldCheck size={30} />
            )}
          </div>
        </section>
        {tab === "cpu" && (
          <>
            <section className="control-card">
              <div className="section-title">
                <div>
                  <span className="step">01</span>
                  <h2>Configure simulation</h2>
                </div>
                <button className="ghost-button" onClick={reset}>
                  <RotateCcw size={15} /> Reset defaults
                </button>
              </div>
              <div className="control-row">
                <label>
                  Scheduling algorithm
                  <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                  >
                    {["FCFS", "SJF", "SRTF", "Priority", "RR"].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                {algorithm === "RR" && (
                  <label>
                    Time quantum
                    <input
                      type="number"
                      min="1"
                      value={quantum}
                      onChange={(e) => setQuantum(+e.target.value)}
                    />
                  </label>
                )}
                <div className="algo-note">
                  <Zap size={16} />
                  <span>
                    {
                      {
                        FCFS: "First Come, First Served",
                        SJF: "Shortest Job First (non-preemptive)",
                        SRTF: "Shortest Remaining Time First",
                        Priority: "Lower number = higher priority",
                        RR: "Round Robin time slicing",
                      }[algorithm]
                    }
                  </span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PROCESS</th>
                      <th>ARRIVAL TIME</th>
                      <th>BURST TIME</th>
                      <th>PRIORITY</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((p, i) => (
                      <tr key={p.id}>
                        <td>
                          <span
                            className="process-dot"
                            style={{ background: colors[i % colors.length] }}
                          />
                          {p.id}
                        </td>
                        <td>
                          <input
                            aria-label={`${p.id} arrival time`}
                            type="number"
                            min="0"
                            value={p.arrival}
                            onChange={(e) =>
                              updateP(i, "arrival", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${p.id} burst time`}
                            type="number"
                            min="1"
                            value={p.burst}
                            onChange={(e) =>
                              updateP(i, "burst", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${p.id} priority`}
                            type="number"
                            min="0"
                            value={p.priority}
                            onChange={(e) =>
                              updateP(i, "priority", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="remove"
                            disabled={processes.length <= 1}
                            onClick={() =>
                              setProcesses((ps) => ps.filter((_, j) => i !== j))
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>{processes.length} processes configured</span>
                <button
                  className="text-button"
                  disabled={processes.length >= 8}
                  onClick={addProcess}
                >
                  + Add process
                </button>
              </div>
            </section>
            <section className="results-section">
              <div className="section-title">
                <div>
                  <span className="step">02</span>
                  <h2>Simulation results</h2>
                </div>
                <span className="computed">
                  <CheckCircle2 size={15} /> Computed instantly
                </span>
              </div>
              <div className="metric-grid">
                <Metric
                  label="Avg. waiting time"
                  value={`${cpu.avgWT.toFixed(2)} ms`}
                  icon={<Clock3 size={17} />}
                  tone="blue"
                />
                <Metric
                  label="Avg. turnaround"
                  value={`${cpu.avgTAT.toFixed(2)} ms`}
                  icon={<Activity size={17} />}
                  tone="mint"
                />
                <Metric
                  label="Avg. response"
                  value={`${cpu.avgRT.toFixed(2)} ms`}
                  icon={<Zap size={17} />}
                  tone="orange"
                />
                <Metric
                  label="Total elapsed time"
                  value={`${cpu.makespan} ms`}
                  icon={<Cpu size={17} />}
                  tone="purple"
                />
              </div>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>CPU execution timeline</h3>
                    <p>Each block represents a process occupying the CPU.</p>
                  </div>
                  <span className="mini-tag">GANTT CHART</span>
                </div>
                <div className="gantt-scroll">
                  <div
                    className="gantt"
                    style={{ minWidth: Math.max(500, cpu.makespan * 55) }}
                  >
                    {cpu.gantt.slice(0, step).map((g, i) => (
                      <div
                        key={i}
                        className={`gantt-block ${g.idle ? "idle" : ""}`}
                        style={{
                          left: `${(g.start / Math.max(cpu.makespan, 1)) * 100}%`,
                          width: `${((g.end - g.start) / Math.max(cpu.makespan, 1)) * 100}%`,
                          background: g.color,
                        }}
                      >
                        <b>{g.id}</b>
                        <span>{g.end - g.start} ms</span>
                      </div>
                    ))}
                  </div>
                  <div className="timeline-ticks">
                    {Array.from(
                      { length: Math.min(cpu.makespan + 1, 40) },
                      (_, i) => i,
                    )
                      .filter(
                        (i) =>
                          i === 0 ||
                          i === cpu.makespan ||
                          i % Math.max(1, Math.ceil(cpu.makespan / 12)) === 0,
                      )
                      .map((t) => (
                        <span
                          key={t}
                          style={{
                            left: `${(t / Math.max(cpu.makespan, 1)) * 100}%`,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="legend">
                  {processes.map((p, i) => (
                    <span key={p.id}>
                      <i style={{ background: colors[i % colors.length] }} />
                      {p.id}
                    </span>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Process performance</h3>
                    <p>
                      Calculated from arrival, execution and completion times.
                    </p>
                  </div>
                </div>
                <AnimationControls total={cpu.gantt.length} />
                <div className="table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>PROCESS</th>
                        <th>COMPLETION</th>
                        <th>TURNAROUND</th>
                        <th>WAITING</th>
                        <th>RESPONSE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cpu.rows.map((p, i) => (
                        <tr key={p.id}>
                          <td>
                            <span
                              className="process-dot"
                              style={{ background: colors[i % colors.length] }}
                            />
                            {p.id}
                          </td>
                          <td>{p.completion}</td>
                          <td>{p.turnaround}</td>
                          <td>{p.waiting}</td>
                          <td>{p.response}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
        {tab === "memory" && (
          <>
            <section className="control-card">
              <div className="section-title">
                <div>
                  <span className="step">01</span>
                  <h2>Configure memory</h2>
                </div>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setRefsText("7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2");
                    setFrameCount(3);
                    setPageAlgorithm("LRU");
                  }}
                >
                  <RotateCcw size={15} /> Reset defaults
                </button>
              </div>
              <div className="control-row">
                <label className="wide-label">
                  Page reference string
                  <input
                    value={refsText}
                    onChange={(e) => setRefsText(e.target.value)}
                    placeholder="e.g. 7, 0, 1, 2, 0, 3"
                    aria-invalid={!refsValid}
                  />
                  <small>
                    {refsValid
                      ? "Enter page numbers separated by commas or spaces."
                      : "Enter one or more non-negative whole numbers, separated by commas or spaces."}
                  </small>
                </label>

                <label>
                  Number of frames
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={frameCount}
                    onChange={(e) =>
                      setFrameCount(
                        Math.max(1, Math.min(8, +e.target.value || 1)),
                      )
                    }
                  />
                </label>
                <label>
                  Algorithm
                  <select
                    value={pageAlgorithm}
                    onChange={(e) => setPageAlgorithm(e.target.value)}
                  >
                    {["FIFO", "LRU", "Optimal"].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="results-section">
              <div className="section-title">
                <div>
                  <span className="step">02</span>
                  <h2>Memory simulation</h2>
                </div>
                <span className="computed">
                  <CheckCircle2 size={15} /> Computed instantly
                </span>
              </div>
              <div className="metric-grid three">
                <Metric
                  label="Page faults"
                  value={pages.faults}
                  icon={<XCircle size={17} />}
                  tone="orange"
                />
                <Metric
                  label="Page hits"
                  value={pages.hits}
                  icon={<CheckCircle2 size={17} />}
                  tone="mint"
                />
                <Metric
                  label="Hit ratio"
                  value={`${pages.hitRate.toFixed(1)}%`}
                  icon={<Activity size={17} />}
                  tone="blue"
                />
              </div>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Frame-by-frame trace</h3>
                    <p>
                      See which pages remain in physical memory after each
                      request.
                    </p>
                  </div>
                  <span className="mini-tag">
                    {pages.steps.length} REFERENCES
                  </span>
                </div>
                <AnimationControls total={pages.steps.length} />
                <div className="table-wrap">
                  <table className="memory-table">
                    <thead>
                      <tr>
                        <th>PAGE</th>
                        {Array.from({ length: frameCount }, (_, i) => (
                          <th key={i}>FRAME {i + 1}</th>
                        ))}
                        <th>RESULT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.steps.slice(0, step).map((s, i) => (
                        <tr key={i}>
                          <td>
                            <b>{s.page}</b>
                          </td>

                          {Array.from({ length: frameCount }, (_, j) => (
                            <td key={j}>
                              <span
                                className={`frame-cell ${
                                  s.frames[j] === undefined
                                    ? "empty"
                                    : s.frames[j] === s.page
                                      ? "current"
                                      : ""
                                }`}
                              >
                                {s.frames[j] === undefined ? "—" : s.frames[j]}
                              </span>
                            </td>
                          ))}

                          <td>
                            <span
                              className={`status ${s.hit ? "hit" : "fault"}`}
                            >
                              {s.status}
                            </span>
                            {s.replaced !== null && (
                              <small className="replaced">
                                {" "}
                                replaced {s.replaced}
                              </small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="memory-footnote">
                  {pageAlgorithm === "FIFO"
                    ? "FIFO replaces the page that has been in memory the longest."
                    : pageAlgorithm === "LRU"
                      ? "LRU replaces the page that has not been used for the longest time."
                      : "Optimal replaces the page whose next use is farthest in the future."}
                </div>
              </div>
            </section>
          </>
        )}
        {tab === "deadlock" && (
          <>
            <section className="control-card">
              <div className="section-title">
                <div>
                  <span className="step">01</span>
                  <h2>Resource allocation</h2>
                </div>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setAvailableText("3, 3, 2");
                    setAllocText("0, 1, 0\n2, 0, 0\n3, 0, 2\n2, 1, 1\n0, 0, 2");
                    setMaxText("7, 5, 3\n3, 2, 2\n9, 0, 2\n2, 2, 2\n4, 3, 3");
                  }}
                >
                  <RotateCcw size={15} /> Reset example
                </button>
              </div>
              <label className="wide-label">
                Available resources
                <input
                  value={availableText}
                  onChange={(e) => setAvailableText(e.target.value)}
                  placeholder="3, 3, 2"
                />
                <small>
                  Available instances for each resource type, comma-separated.
                </small>
              </label>
              <div className="matrix-grid">
                <label>
                  Allocation matrix
                  <textarea
                    rows="5"
                    value={allocText}
                    onChange={(e) => setAllocText(e.target.value)}
                  />
                  <small>Currently allocated resources per process.</small>
                </label>
                <label>
                  Maximum demand matrix
                  <textarea
                    rows="5"
                    value={maxText}
                    onChange={(e) => setMaxText(e.target.value)}
                  />
                  <small>Maximum resources each process may need.</small>
                </label>
              </div>
              <div className="memory-footnote">
                Use the same number of resource columns in Available, Allocation
                and Maximum. Each row represents P0, P1, P2, and so on.
              </div>
            </section>
            <section className="results-section">
              <div className="section-title">
                <div>
                  <span className="step">02</span>
                  <h2>Safety analysis</h2>
                </div>
                <span className="computed">
                  <CheckCircle2 size={15} /> Recalculated live
                </span>
              </div>
              {!bank ? (
                <div className="panel error-panel">
                  Input dimensions do not match. Check that Allocation and
                  Maximum have the same number of process rows and resource
                  columns as Available.
                </div>
              ) : (
                <>
                  <div
                    className={`safety-banner ${bank.safe ? "safe" : "unsafe"}`}
                  >
                    {bank.safe ? (
                      <CheckCircle2 size={24} />
                    ) : (
                      <XCircle size={24} />
                    )}
                    <div>
                      <h3>
                        {bank.safe
                          ? "System is in a SAFE state"
                          : "System is in an UNSAFE state"}
                      </h3>
                      <p>
                        {bank.safe
                          ? "A sequence exists in which every process can finish without deadlock."
                          : "No complete safe sequence can be found with the current available resources."}
                      </p>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <h3>Need matrix</h3>
                        <p>Need = Maximum − Allocation</p>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>PROCESS</th>
                            {availableText
                              .split(/[\s,]+/)
                              .filter(Boolean)
                              .map((_, i) => (
                                <th key={i}>R{i}</th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bank.need.map((row, i) => (
                            <tr key={i}>
                              <td>P{i}</td>
                              {row.map((v, j) => (
                                <td key={j}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <h3>Safe sequence</h3>
                        <p>Processes in the order they can complete.</p>
                      </div>
                    </div>
                    {bank.safe ? (
                      <div className="sequence">
                        {bank.sequence.map((p, i) => (
                          <React.Fragment key={p}>
                            <span className="sequence-node">{p}</span>
                            {i < bank.sequence.length - 1 && (
                              <ArrowRight size={16} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    ) : (
                      <p className="unsafe-copy">
                        No safe sequence for all processes was found. Try
                        increasing available resources or reducing maximum
                        demands.
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        )}
        <footer></footer>
      </main>
    </div>
  );
}
function Metric({ label, value, icon, tone }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
