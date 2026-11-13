// Kalyon Optimisation Lab: from "when will it arrive" to "what should we do".
// Every number on this page is computed live in the browser by docs/js/optimise.js:
// Kalyon's LightGBM forecasts -> time model -> conflicts -> AI dispatcher -> exact branch and bound.
import * as O from "./optimise.js?v=202611131338";
import { h, s, $, $$, clear, linear, niceTicks, hhmm, mins, tip, tween, fill, countUp, drawIn, VER } from "./ui.js?v=202611131338";

let app, D, root;
const S = { rep: "festive", t: 300, horizon: 240, weights: null, fog: false, bump: { run: "", min: 0 }, block: { on: false, sec: "LRJ|NBD", start: 30, dur: 60 }, line: "A", layer: "both", station: null };
let R = null; // last result
let running = false, dirty = true, runToken = 0;
const el = {};

const KIND = { superfast: ["Superfast", "var(--cyan)"], express: ["Express", "var(--amber)"], special: ["Special", "#ff7ac8"] };
const FEAT_LABEL = {
  kind: "Type of conflict", w_first: "Priority of the first train", w_second: "Priority of the second train", w_diff: "Difference in priority",
  gap: "Time gap between the two", occ_first: "Time the first needs on the section", occ_second: "Time the second needs on the section",
  late_first: "How late the first train is", late_second: "How late the second train is",
  cost_first_waits: "Cost if the first train waits", cost_second_waits: "Cost if the second train waits", cost_diff: "Which wait costs less",
  down_first: "Stations still ahead (first)", down_second: "Stations still ahead (second)",
  nconf_first: "Other conflicts facing the first", nconf_second: "Other conflicts facing the second", hour: "Time of day", single: "Single line",
};
const PRESETS = [
  { id: "crunch", title: "Festive morning crunch", sub: "Festive day, 09:00, 4-hour plan", set: { rep: "festive", t: 300, horizon: 240, fog: false, bump: { run: "", min: 0 }, block: { on: false } } },
  { id: "fog", title: "Winter fog morning", sub: "Fog day, 07:00, slower running and longer headways", set: { rep: "fog", t: 180, horizon: 240, fog: true, bump: { run: "", min: 0 }, block: { on: false } } },
  { id: "late", title: "A superfast runs late", sub: "Typical day, 07:00, one superfast +40 min", set: { rep: "typical", t: 180, horizon: 240, fog: false, bump: { run: "auto-superfast", min: 40 }, block: { on: false } } },
  { id: "block", title: "Engineering block", sub: "Typical day, 08:00, Laksar–Najibabad closed 60 min", set: { rep: "typical", t: 240, horizon: 240, fog: false, bump: { run: "", min: 0 }, block: { on: true, sec: "LRJ|NBD", start: 30, dur: 60 } } },
  { id: "quiet", title: "Quiet afternoon", sub: "Typical day, 14:00: does it know when to do nothing?", set: { rep: "typical", t: 600, horizon: 180, fog: false, bump: { run: "", min: 0 }, block: { on: false } } },
];

export async function mount(a) {
  app = a;
  root = $("#v-optim");
  try {
    D = await fetch(`data/dispatch.json?v=${VER}`).then(r => r.json());
  } catch (e) {
    root.append(h("p", { class: "small" }, "The optimisation engine's data could not be loaded."));
    return;
  }
  O.setNetwork(app.net.sections);
  S.weights = { ...D.priority };
  build();
  app.on("view", v => { if (v === "optim" && !R && !running) run(); });
  if (app.view === "optim") run();
}

// ------------------------------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------------------------------
function build() {
  const m = D.metrics;
  root.prepend(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Optimisation Lab"),
        h("p", { class: "lede" }, "Prediction tells us when each train will arrive. This lab works out what controllers should do about it: which train waits, where two trains cross on a single line, who goes first, how long to hold, and which platform line to use, so that total delay is as small as possible."))),
    h("div", { class: "help-line", role: "note" },
      h("span", { html: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>' }),
      h("span", {}, h("b", {}, "Simulated results. "), "The corridor, timetable and train running are synthetic, and the line capacities are assumptions. Savings are measured inside Kalyon’s model against standard first-come-first-served dispatching, using the same Kalyon forecasts. They show the method works; they are not a measurement of real operations.")),
    el.presets = h("div", { class: "presets ol-presets", role: "group", "aria-label": "Scenario presets" },
      ...PRESETS.map(p => h("button", { class: "panel preset", "data-id": p.id, "aria-pressed": "false", onclick: () => applyPreset(p) },
        h("b", {}, p.title), h("span", {}, p.sub)))),
    h("div", { class: "ol-grid" },
      scenarioPanel(),
      enginePanel(),
      el.kpis = h("div", { class: "ol-kpis span-12" }),
      graphPanel(),
      h("div", { class: "panel span-7" },
        h("div", { class: "panel-title" }, h("h3", {}, "Recommended decisions"), h("span", { class: "small" }, "What to do, why, and what it saves")),
        el.decisions = h("div", { class: "ol-decisions" })),
      h("div", { class: "panel span-5" },
        h("div", { class: "panel-title" }, h("h3", {}, "Conflicts found in the forecast"), h("span", { class: "small" }, "If nobody intervened")),
        el.conflicts = h("div", { class: "ol-conflicts" })),
      h("div", { class: "panel span-7" },
        h("div", { class: "panel-title" }, h("h3", {}, "Train by train"), h("span", { class: "small" }, "Arrival delay at each train’s last stop in the plan")),
        h("div", { class: "legend", style: "margin-bottom:8px" },
          h("span", { class: "key" }, h("i", { class: "ol-k-before" }), "Standard dispatch (first come, first served)"),
          h("span", { class: "key" }, h("i", { class: "kal" }), "Kalyon’s optimised plan")),
        el.impact = h("div", { class: "ol-impact" })),
      h("div", { class: "panel span-5" },
        h("div", { class: "panel-title" }, h("h3", {}, "Five ways to run the same morning"), h("span", { class: "small" }, "Priority-weighted delay-minutes, lower is better")),
        el.strat = h("div", { class: "ol-strat" })),
      h("div", { class: "panel span-7" },
        h("div", { class: "panel-title" }, h("h3", {}, "Platform lines"),
          el.stSel = h("select", { "aria-label": "Station", onchange: e => { S.station = e.target.value; drawPlatforms(); } })),
        el.plat = h("div", { class: "ol-plat" })),
      h("div", { class: "panel span-5" },
        h("div", { class: "panel-title" }, h("h3", {}, "Scan the whole day"),
          el.scanBtn = h("button", { class: "btn small", onclick: scanDay }, "Scan this day")),
        el.scan = h("div", { class: "ol-scan" }, h("p", { class: "small" }, "Runs the optimiser every 30 minutes across the day to find when intervention matters most. Click a bar to load that moment."))),
      evidencePanel(m),
      howPanel()));
}

function scenarioPanel() {
  const reps = app.replays;
  const p = h("div", { class: "panel span-4 ol-scn" },
    h("div", { class: "panel-title" }, h("h3", {}, "Scenario")),
    h("div", { class: "ctl" }, h("label", {}, "Day"),
      el.repSeg = h("div", { class: "seg", role: "group", "aria-label": "Day" },
        ...reps.map(r => h("button", { "data-id": r.id, "aria-pressed": String(r.id === S.rep), onclick: () => { S.rep = r.id; sync(); changed(); } }, r.title.replace("Winter ", ""))))),
    sliderCtl("t", "Plan from", 0, 1380, 15, v => `${hhmm(w0() + v)}`, "The moment the controller asks for a plan."),
    h("div", { class: "ctl" }, h("label", {}, "Look ahead"),
      el.hzSeg = h("div", { class: "seg", role: "group", "aria-label": "Planning horizon" },
        ...[[120, "2 h"], [180, "3 h"], [240, "4 h"]].map(([v, l]) => h("button", { "data-v": v, "aria-pressed": String(v === S.horizon), onclick: () => { S.horizon = v; sync(); changed(); } }, l)))),
    h("details", { class: "ol-more" }, h("summary", {}, "Train priorities"),
      ...["superfast", "express", "special"].map(k => sliderCtl(`w_${k}`, `${KIND[k][0]} priority`, 0.2, 3, 0.1, v => `× ${(+v).toFixed(1)}`))),
    h("div", { class: "ol-sub" }, "Disruptions"),
    h("label", { class: "toggle" }, h("span", {}, "Dense fog", h("small", {}, "Forecasts re-run with 300 m visibility; headways ×1.5")),
      el.fog = h("input", { type: "checkbox", class: "switch", onchange: e => { S.fog = e.target.checked; changed(); } })),
    h("div", { class: "ctl" }, h("label", {}, "Make a train late"),
      el.bumpSel = h("select", { "aria-label": "Train to delay", onchange: e => { S.bump.run = e.target.value; changed(); } })),
    sliderCtl("bump", "Extra delay", 0, 120, 5, v => (+v ? `+${v} min` : "none")),
    h("label", { class: "toggle" }, h("span", {}, "Engineering block", h("small", {}, "A section closed in both directions")),
      el.blkOn = h("input", { type: "checkbox", class: "switch", onchange: e => { S.block.on = e.target.checked; sync(); changed(); } })),
    el.blkBox = h("div", { class: "ol-blk" },
      h("div", { class: "ctl" }, h("label", {}, "Section"), el.blkSec = h("select", { "aria-label": "Section to block", onchange: e => { S.block.sec = e.target.value; changed(); } },
        ...app.net.sections.slice().sort((a, b) => b.single - a.single).map(sc => h("option", { value: `${sc.a}|${sc.b}` }, `${app.stations[sc.a].name} – ${app.stations[sc.b].name}${sc.single ? " (single line)" : ""}`)))),
      sliderCtl("bstart", "Starts in", 0, 180, 5, v => `${v} min`),
      sliderCtl("bdur", "Lasts", 15, 180, 5, v => `${v} min`)),
    el.runBtn = h("button", { class: "btn primary ol-run", onclick: () => run() }, "Run optimisation ", h("span", { class: "arr" }, "→")));
  return p;
}

const ctl = {};
function sliderCtl(key, label, min, max, step, fmt, hint) {
  const out = h("output");
  const input = h("input", { type: "range", min, max, step, "aria-label": label, oninput: e => { setVal(key, +e.target.value); out.textContent = fmt(+e.target.value); changed(); } });
  ctl[key] = { input, out, fmt };
  return h("div", { class: "ctl" }, h("label", {}, label, out), input, hint ? h("div", { class: "hint" }, hint) : null);
}
function getVal(key) {
  if (key === "t") return S.t;
  if (key.startsWith("w_")) return S.weights[key.slice(2)];
  if (key === "bump") return S.bump.min;
  if (key === "bstart") return S.block.start;
  if (key === "bdur") return S.block.dur;
}
function setVal(key, v) {
  if (key === "t") S.t = v;
  else if (key.startsWith("w_")) S.weights[key.slice(2)] = v;
  else if (key === "bump") S.bump.min = v;
  else if (key === "bstart") S.block.start = v;
  else if (key === "bdur") S.block.dur = v;
}
function sync() {
  for (const [k, c] of Object.entries(ctl)) { c.input.value = getVal(k); c.out.textContent = c.fmt(getVal(k)); fill(c.input); }
  $$("button", el.repSeg).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === S.rep)));
  $$("button", el.hzSeg).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === S.horizon)));
  el.fog.checked = S.fog;
  el.blkOn.checked = S.block.on;
  el.blkSec.value = S.block.sec;
  el.blkBox.hidden = !S.block.on;
  fillBumpTrains();
}
function changed() {
  dirty = true;
  el.runBtn.classList.add("pulse");
  $$(".preset", el.presets).forEach(b => b.setAttribute("aria-pressed", "false"));
}
function applyPreset(p) {
  const st = p.set;
  Object.assign(S, { rep: st.rep, t: st.t, horizon: st.horizon, fog: st.fog });
  S.bump = { ...st.bump };
  S.block = { ...S.block, ...st.block };
  S.weights = { ...D.priority };
  sync();
  run().then(() => $$(".preset", el.presets).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === p.id))));
}
const rep = () => app.replays.find(r => r.id === S.rep);
const w0 = () => rep().t0_day * 1440 + 240;

function fillBumpTrains() {
  const r = rep();
  const T = w0() + S.t;
  clear(el.bumpSel).append(h("option", { value: "" }, "No extra delay"));
  for (const run of r.runs) {
    const n = run.ev.length;
    const start = w0() + run.ev[0][2] + run.ev[0][4], end = w0() + run.ev[n - 1][1] + run.ev[n - 1][3];
    if (start <= T + S.horizon && end > T) {
      const t = app.trains[run.train];
      el.bumpSel.append(h("option", { value: String(run.run) }, `${t.number} ${t.name}`));
    }
  }
  if (S.bump.run === "auto-superfast") {
    const o = [...el.bumpSel.options].find(op => op.value && app.trains[op.textContent.split(" ")[0]].kind === "superfast");
    S.bump.run = o ? o.value : "";
  }
  el.bumpSel.value = S.bump.run;
}

function enginePanel() {
  const stages = [
    ["Forecast", "Kalyon’s LightGBM models forecast every train on the corridor"],
    ["Time model", "Each train becomes a chain of arrival and departure events"],
    ["Conflicts", "Find where forecasts put two trains on one single line, too close, or too many at a station"],
    ["AI dispatcher", "A model trained on proven-optimal decisions suggests who should go first"],
    ["Exact search", "Branch and bound checks every alternative it cannot rule out, and proves the best plan"],
    ["Explain", "Each decision is tested by reversing it and re-optimising"],
  ];
  return h("div", { class: "panel span-8 ol-engine" },
    h("div", { class: "panel-title" }, h("h3", {}, "Optimisation engine"), el.status = h("span", { class: "ol-status" }, "Ready")),
    el.stages = h("ol", { class: "ol-stages" }, ...stages.map(([t, d], i) => h("li", { "data-i": i }, h("b", {}, `${i + 1}  ${t}`), h("span", {}, d)))),
    h("div", { class: "ol-live" },
      h("div", { class: "ol-counters" },
        counter("nodes", "Plans examined"), counter("pruned", "Ruled out by the bound"), counter("best", "Best plan so far"), counter("ms", "Search time")),
      el.conv = h("div", { class: "ol-conv" })),
    el.verdict = h("p", { class: "small ol-verdict" }, ""));
}
function counter(k, label) { return h("div", { class: "ol-counter" }, el[`c_${k}`] = h("b", { class: "num" }, "–"), h("span", {}, label)); }

function graphPanel() {
  return h("div", { class: "panel span-12" },
    h("div", { class: "panel-title" },
      h("div", {}, h("h3", {}, "Time–distance graph"), h("p", { class: "small" }, "Each line is a train: time runs left to right, distance top to bottom. A flat stretch is a train standing at a station. Red rings mark conflicts in the raw forecast.")),
      h("div", { class: "ol-gtools" },
        el.lineSeg = h("div", { class: "seg", role: "group", "aria-label": "Which line" },
          ...[["A", "Lucknow line"], ["B", "Delhi line"]].map(([v, l]) => h("button", { "data-v": v, "aria-pressed": String(v === S.line), onclick: e => { S.line = v; segSel(e); drawGraph(false); } }, l))),
        el.layerSeg = h("div", { class: "seg", role: "group", "aria-label": "Which plan" },
          ...[["both", "Compare"], ["opt", "Optimised"], ["fcfs", "Standard"]].map(([v, l]) => h("button", { "data-v": v, "aria-pressed": String(v === S.layer), onclick: e => { S.layer = v; segSel(e); drawGraph(false); } }, l))))),
    h("div", { class: "legend", style: "margin-bottom:6px" },
      h("span", { class: "key" }, h("i", { class: "ol-k-before" }), "Standard dispatch"),
      h("span", { class: "key" }, h("i", { class: "kal" }), "Optimised (colour = train type)"),
      h("span", { class: "key" }, h("i", { class: "ol-k-hold" }), "Hold"),
      h("span", { class: "key" }, h("i", { class: "ol-k-conf" }), "Conflict in the raw forecast"),
      h("span", { class: "key" }, h("i", { class: "ol-k-single" }), "Single line")),
    el.graph = h("div", { class: "ol-graph" }));
}
function segSel(e) { $$("button", e.currentTarget.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); }

function evidencePanel(m) {
  const pct = v => `${(v * 100).toFixed(0)}%`;
  const imp = m.importance.slice(0, 6);
  const maxG = imp[0].gain;
  return h("div", { class: "panel span-12 ol-evidence" },
    h("div", { class: "panel-title" }, h("h3", {}, "Is the AI dispatcher any good?"), h("span", { class: "small" }, `Tested on ${m.snapshots.test} snapshots from ${m.periods.test}, days it never saw`)),
    h("div", { class: "ol-ev-grid" },
      h("div", {},
        h("p", { class: "small" }, `It learned from ${m.decisions.train.toLocaleString("en-IN")} conflicts that were solved to proven optimality (HiGHS) on ${m.snapshots.train} snapshots of the training period. How often does each rule pick the same order as the proven optimum?`),
        bars([["First come, first served", m.agreement_with_optimum.fcfs, "var(--today)"], ["Higher priority first", m.agreement_with_optimum.priority, "var(--muted)"], ["Kalyon AI dispatcher", m.agreement_with_optimum.ai, "var(--amber)"]], pct)),
      h("div", {},
        h("p", { class: "small" }, "Delay saved against first-come-first-served dispatching, summed over every test snapshot:"),
        bars([["Higher priority first", m.reduction_vs_fcfs.priority, "var(--muted)"], ["AI dispatcher alone (instant)", m.reduction_vs_fcfs.ai, "var(--amber)"], ["AI-guided exact search (optimum)", m.reduction_vs_fcfs.opt, "var(--green)"]], pct),
        h("p", { class: "small", style: "margin-top:8px" }, `On its own the AI dispatcher reached the proven optimum in ${pct(m.share_reaching_optimum.ai)} of test snapshots (first-come-first-served: ${pct(m.share_reaching_optimum.fcfs)}), and was on average ${(m.mean_gap_to_optimum.ai * 100).toFixed(1)}% away from it.`)),
      h("div", {},
        h("p", { class: "small" }, "What it looks at most (LightGBM gain):"),
        h("div", { class: "ol-imp" }, ...imp.map(r => h("div", { class: "ol-imp-row" }, h("span", {}, FEAT_LABEL[r.feature] || r.feature), h("i", { style: `width:${(r.gain / maxG) * 100}%` })))))));
}
function bars(rows, fmt) {
  return h("div", { class: "ol-bars" }, ...rows.map(([l, v, c]) => h("div", { class: "ol-bar" },
    h("span", {}, l), h("div", {}, h("i", { style: `width:${Math.max(0, v) * 100}%;background:${c}` })), h("b", { class: "num" }, fmt(v)))));
}

function howPanel() {
  const items = [
    ["Prediction feeds the plan", "Kalyon’s median ETA for every station ahead of every train gives the expected running times. When you add fog or a late train, the LightGBM models re-forecast first. Plans use the most likely time, so switching the likely range (80%, 90% or 95%) at the top does not change them; it changes how wide the window around each time is on the other pages."],
    ["Rules of the track", "Two trains cannot meet on a single line, so one waits at a station with a loop. Trains in the same direction keep a gap and can only overtake at stations. A station holds only so many trains. No train leaves a halt early."],
    ["The objective", "Make the sum of arrival delays at every station as small as possible, weighted by priority (superfast ×1.5, express ×1, special ×0.7 by default; change them under Scenario)."],
    ["How the best plan is found", "Every conflict has two answers: this train first, or that one. The search tries the AI dispatcher’s answer first, keeps the best complete plan found, and abandons any branch whose delay already exceeds it. When nothing is left to try, the plan is proven optimal."],
    ["Why not reinforcement learning?", "Because an exact solver exists for this problem size. The AI learns from proven-optimal answers (imitation learning) instead of trial and error, and every plan it helps to find can be checked against the optimum. HiGHS, an open-source MILP solver, confirms the browser’s answers in tests/opt_parity.mjs."],
    ["What it does not model", "Exact signal positions and block sections, crew and rake links, platform lengths, freight traffic, and speed changes to make up time. Trains that start after the planning window are not included."],
  ];
  return h("div", { class: "panel span-12" },
    h("div", { class: "panel-title" }, h("h3", {}, "How the engine works")),
    h("div", { class: "ol-how" }, ...items.map(([t, d]) => h("div", {}, h("b", {}, t), h("p", { class: "small" }, d)))));
}

// ------------------------------------------------------------------------------------------
// Running the engine
// ------------------------------------------------------------------------------------------
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const wait = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));

function scenarioInput() {
  const r = rep();
  const params = S.fog ? { head_single: D.params.head_single * 1.5, head_double: D.params.head_double * 1.5, cross: D.params.cross + 2 } : {};
  const bumps = {};
  if (S.bump.run && S.bump.min) bumps[S.bump.run] = S.bump.min;
  const snap = O.snapshotFromReplay(app, r, S.t, D, { horizon: S.horizon, weights: S.weights, bumps, fog: S.fog });
  const blocks = [];
  if (S.block.on) {
    const [a, b] = S.block.sec.split("|");
    blocks.push({ a, b, t1: snap.now + S.block.start, t2: snap.now + S.block.start + S.block.dur });
  }
  return { snap, params, blocks };
}

function stage(i) {
  $$("li", el.stages).forEach(li => { const k = +li.dataset.i; li.className = k < i ? "done" : k === i ? "on" : ""; });
}

async function run() {
  if (!D) return;
  const token = ++runToken;
  running = true; dirty = false;
  el.runBtn.classList.remove("pulse");
  el.runBtn.disabled = true;
  el.status.textContent = "Running";
  el.status.className = "ol-status run";
  sync();
  stage(0);
  const { snap, params, blocks } = scenarioInput();
  await wait(220);
  if (token !== runToken) return;
  stage(1);
  const inst = O.buildInstance(snap.trains, snap.now, D, { params, blocks });
  await wait(220);
  stage(2);
  const raw = O.conflicts(inst, inst.base);
  await wait(220);
  stage(3);
  const fcfs = O.greedy(inst, "fcfs", D), pri = O.greedy(inst, "priority", D), ai = O.greedy(inst, "ai", D);
  await wait(220);
  stage(4);
  const gen = O.branchAndBound(inst, D, { nodeLimit: 150000, yieldEvery: 40 });
  let res, last = null;
  const t0 = performance.now();
  for (;;) {
    const fStart = performance.now();
    let r;
    do { r = gen.next(); } while (!r.done && performance.now() - fStart < 14);
    if (r.done) { res = r.value; break; }
    last = r.value;
    showCounters(last, false);
    drawConv(last.trace, fcfs, pri, ai, null);
    await frame();
    if (token !== runToken) return;
  }
  showCounters({ nodes: res.nodes, pruned: res.pruned, best: res.obj, ms: res.ms }, true);
  stage(5);
  R = { snap, inst, raw, fcfs, pri, ai, res, params, blocks };
  R.decisions = groupDecisions(describeDecisions(R));
  drawConv(res.trace, fcfs, pri, ai, res);
  el.verdict.textContent = verdictText(R);
  drawKpis();
  drawGraph(true);
  drawConflicts();
  drawImpact();
  drawStrategies();
  fillStations();
  drawPlatforms();
  renderDecisions();
  await explainDecisions(token);
  if (token !== runToken) return;
  stage(6);
  el.status.textContent = res.optimal ? "Proven optimal" : "Best plan found";
  el.status.className = `ol-status ${res.optimal ? "ok" : "warn"}`;
  el.runBtn.disabled = false;
  running = false;
  void t0;
}

function showCounters(p, final) {
  const set = (k, v) => { el[`c_${k}`].textContent = v; };
  set("nodes", p.nodes.toLocaleString("en-IN"));
  set("pruned", (p.pruned ?? 0).toLocaleString("en-IN"));
  set("best", Number.isFinite(p.best) ? Math.round(p.best).toLocaleString("en-IN") : "–");
  set("ms", `${Math.round(p.ms)} ms`);
  if (final) $$(".ol-counter b", root).forEach(b => b.classList.add("flash"));
}

function verdictText(R) {
  const { res, fcfs, raw } = R;
  if (!raw.length) return "The forecast shows no conflicts in this window: every train can run as forecast, so the engine recommends no intervention.";
  const save = fcfs.obj - res.obj;
  const how = res.optimal ? `Proven optimal: every alternative was either examined or ruled out by the bound (${res.nodes.toLocaleString("en-IN")} plan${res.nodes === 1 ? "" : "s"} examined).` : `Search stopped at its limit; this is the best plan found.`;
  if (save < 0.5) return `${how} Here first-come-first-served is already the best order, so the engine recommends standard dispatching.`;
  return `${how} It saves ${Math.round(save).toLocaleString("en-IN")} priority-weighted delay-minutes against first-come-first-served.`;
}

// ------------------------------------------------------------------------------------------
// Decisions and their explanations
// ------------------------------------------------------------------------------------------
const tname = (inst, ti) => inst.trains[ti].number;
const stName = c => app.stations[c]?.name || c;

function describeDecisions(R) {
  const { inst, res } = R;
  const t = res.t;
  const holdMap = new Map(O.holds(inst, t).map(x => [x.e, x]));
  const out = [];
  for (const d of res.decisions || []) {
    if (d.pair !== undefined) {
      const p = inst.pairs[d.pair];
      const U = inst.usages, u = U[p.u];
      if (p.kind === "block") {
        const b = inst.blocks[p.block];
        const tr = tname(inst, u.train);
        const hold = holdMap.get(u.d);
        out.push(d.alt === 0
          ? { d, icon: "go", title: `${tr} clears ${stName(b.a)}–${stName(b.b)} before the block`, sub: `It must be off the section by ${hhmm(inst.E.base[b.s] ?? t[b.s])}.`, trains: [u.train], wait: 0, at: t[u.d] }
          : { d, icon: "hold", title: `Hold ${tr} at ${stName(u.a)} until the block ends`, sub: `The section reopens at ${hhmm(t[b.e])}.`, trains: [u.train], wait: hold ? hold.wait : 0, waitAt: u.a, at: t[u.d] });
        continue;
      }
      const v = U[p.v];
      const [goer, waiter] = d.alt === 0 ? [u, v] : [v, u];
      const hold = holdMap.get(waiter.d);
      const gN = tname(inst, goer.train), wN = tname(inst, waiter.train);
      const secTxt = `${stName(p.kind === "opp" ? goer.a : goer.a)}–${stName(goer.b)}`;
      let title, sub;
      if (p.kind === "opp") {
        title = hold && hold.wait > 0.5 ? `Hold ${wN} at ${stName(waiter.a)} for ${Math.round(hold.wait)} min` : `${wN} waits at ${stName(waiter.a)} for ${gN}`;
        sub = `${gN} crosses it on the single line ${secTxt}.`;
      } else {
        const overtake = d.alt === 1;
        title = overtake ? `${gN} overtakes ${wN} at ${stName(waiter.a)}` : `${gN} goes ahead of ${wN} on ${secTxt}`;
        sub = hold && hold.wait > 0.5 ? `${wN} is held ${Math.round(hold.wait)} min at ${stName(waiter.a)} to keep a safe gap.` : `${wN} follows at a safe gap.`;
      }
      out.push({ d, icon: p.kind === "opp" ? "cross" : "order", title, sub, trains: [goer.train, waiter.train], goer: goer.train, waiter: waiter.train,
        wait: hold ? hold.wait : 0, at: t[goer.d], fcfs: d.alt === 0, kind: p.kind });
    } else {
      const V = inst.visits, vi = V[d.i], vj = V[d.j];
      out.push({ d, icon: "plat", title: `${tname(inst, vj.train)} waits for a free line at ${stName(d.station)}`, sub: `${tname(inst, vi.train)} must leave first: all ${inst.cap[d.station]} lines are in use.`, trains: [vj.train, vi.train], at: t[vj.s] });
    }
  }
  return out;
}

// Several conflicts can be settled by one hold (a train waiting at a loop for two others): show them as one.
function groupDecisions(list) {
  const out = [], byKey = new Map();
  for (const x of list) {
    const key = x.waiter !== undefined && x.wait > 0.5 ? `${x.waiter}|${x.title}` : null;
    if (key && byKey.has(key)) {
      const g = byKey.get(key);
      g.items.push(x);
      g.trains = [...new Set([...g.trains, ...x.trains])];
      if (x.fcfs === false) g.fcfs = false;
      continue;
    }
    const g = { ...x, items: [x] };
    if (key) byKey.set(key, g);
    out.push(g);
  }
  for (const g of out) {
    if (g.items.length > 1) {
      const goers = [...new Set(g.items.map(i => tname(R.inst, i.goer)))];
      const kinds = new Set(g.items.map(i => i.kind));
      g.sub = `${goers.join(" and ")} ${kinds.has("opp") ? "cross it on the single line" : "go ahead"} while it waits.`;
    }
  }
  return out;
}

function trainLine(inst, ti) {
  const tr = inst.trains[ti];
  const k = KIND[tr.kind];
  const terms = inst.obj.filter(([a]) => inst.E.train[a] === ti);
  const lateNow = terms.length ? Math.round(R.inst.base[terms[0][0]] - terms[0][1]) : 0;
  return `${tr.number} ${app.trains[tr.number].name} (${k[0].toLowerCase()}, priority ×${tr.w.toFixed(1)}, forecast ${lateNow > 0 ? `${lateNow} min late` : "on time"} at its next stop)`;
}

function renderDecisions() {
  const box = clear(el.decisions);
  if (!R.decisions.length) {
    box.append(h("div", { class: "ol-empty" }, h("b", {}, "No intervention needed."), h("p", { class: "small" }, R.raw.length ? "Every conflict resolves itself under the timetable." : "The forecast has no conflicts in this window.")));
    return;
  }
  R.decisions.forEach((x, i) => {
    x.el = h("article", { class: `ol-dec ${x.fcfs === false ? "diff" : ""}`, style: `--i:${i}` },
      h("div", { class: "ol-dec-ico", html: ICONS[x.icon] }),
      h("div", {},
        h("div", { class: "ol-dec-top" }, h("span", { class: "num" }, hhmm(x.at)), x.fcfs === false ? h("span", { class: "ol-tag" }, "Differs from standard") : null),
        h("b", {}, x.title),
        h("p", { class: "small" }, x.sub),
        x.why = h("p", { class: "ol-why" }, x.d.pair !== undefined ? "Checking what reversing this decision would cost…" : "Why: the station has no free line until the other train leaves."),
        h("details", {}, h("summary", {}, "Trains involved"), h("ul", { class: "small" }, ...[...new Set(x.trains)].map(ti => h("li", {}, trainLine(R.inst, ti)))))));
    box.append(x.el);
  });
}

async function explainDecisions(token) {
  const { inst, res } = R;
  for (const g of R.decisions) {
    if (g.d.pair === undefined) continue;
    const parts = [];
    for (const x of g.items) {
      const flip = inst.alts[x.d.pair][1 - x.d.alt];
      const gen = O.branchAndBound(inst, D, { nodeLimit: 6000, forced: flip, yieldEvery: 200 });
      let r;
      for (;;) {
        const f0 = performance.now();
        do { r = gen.next(); } while (!r.done && performance.now() - f0 < 12);
        if (r.done) break;
        await frame();
        if (token !== runToken) return;
      }
      const v = r.value;
      const regret = v.infeasible || !Number.isFinite(v.obj) ? Infinity : v.obj - res.obj;
      const goer = x.goer !== undefined ? tname(inst, x.goer) : null, waiter = x.waiter !== undefined ? tname(inst, x.waiter) : null;
      if (!Number.isFinite(regret)) parts.push(goer ? `${goer} is already committed to the section, so ${waiter} has no choice.` : "The alternative would break the block.");
      else if (regret < 0.5) parts.push(goer ? `letting ${waiter} go before ${goer} would cost about the same.` : "the alternative costs about the same.");
      else parts.push(`letting ${waiter ?? "the train"} go before ${goer ?? "the block"} would cost ${Math.round(regret).toLocaleString("en-IN")}${v.optimal ? "" : "+"} more priority-weighted delay-minutes, even after re-optimising everything else.`);
    }
    g.why.textContent = `Why: ${parts.join(" And ")}`;
    g.why.classList.add("ready");
  }
}

const ICONS = {
  cross: '<svg viewBox="0 0 24 24"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>',
  order: '<svg viewBox="0 0 24 24"><path d="M4 8h12M12 4l4 4-4 4M4 16h8"/></svg>',
  hold: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plat: '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
};

// ------------------------------------------------------------------------------------------
// Charts
// ------------------------------------------------------------------------------------------
function drawKpis() {
  const { inst, raw, fcfs, res } = R;
  const before = fcfs.obj, after = res.obj;
  const red = before > 0 ? (before - after) / before : 0;
  const mB = O.totalMinutes(inst, fcfs.t), mA = O.totalMinutes(inst, res.t);
  const changedTrains = O.trainImpact(inst, fcfs.t, res.t).filter(x => Math.abs(x.before - x.after) > 0.5).length;
  const k = (v, label, cls = "", fmt = x => Math.round(x).toLocaleString("en-IN")) => {
    const b = h("b", { class: "num" }, "0");
    countUp(b, v, fmt, 900);
    return h("div", { class: `kpi ${cls}` }, b, h("span", {}, label));
  };
  clear(el.kpis).append(
    k(inst.trains.length, "trains in the plan"),
    k(raw.length, "conflicts in the raw forecast", raw.length ? "warn" : ""),
    k(R.decisions.length, "decisions recommended"),
    k(before, "weighted delay-min, standard dispatch"),
    k(after, "weighted delay-min, optimised", "good"),
    k(red * 100, "less delay", red > 0.005 ? "good" : "", x => `${x.toFixed(1)}%`),
    k(mB - mA, `delay-minutes saved at stations (${Math.round(mB)} → ${Math.round(mA)})`, "", x => Math.round(x).toLocaleString("en-IN")),
    k(changedTrains, "trains whose delay changes"));
}

function drawConv(trace, fcfs, pri, ai, res) {
  const W = 420, H = 150, L = 44, Rr = 10, T = 12, B = 24;
  const pts = trace.length ? trace : [{ nodes: 0, best: fcfs.obj }];
  const maxN = Math.max(10, res ? res.nodes : pts[pts.length - 1].nodes * 1.2);
  const vals = [fcfs.obj, pri ? pri.obj : fcfs.obj, ai ? ai.obj : fcfs.obj, ...pts.map(p => p.best)].filter(Number.isFinite);
  const y0 = Math.min(...vals) * 0.97, y1 = Math.max(...vals) * 1.02 + 1;
  const x = linear(0, maxN, L, W - Rr), y = linear(y0, y1, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Best plan so far against plans examined" });
  niceTicks(y0, y1, 3).forEach(v => svg.append(s("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), stroke: "var(--rule)" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 10, fill: "var(--faint)", text: Math.round(v).toLocaleString("en-IN") })));
  const ref = (v, label, col) => { if (!Number.isFinite(v)) return; svg.append(s("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), stroke: col, "stroke-dasharray": "4 4", "stroke-width": 1.2 }), s("text", { x: W - Rr - 2, y: y(v) - 3, "text-anchor": "end", "font-size": 10, fill: col, text: label })); };
  ref(fcfs.obj, "first come, first served", "var(--today)");
  if (ai) ref(ai.obj, "AI dispatcher alone", "var(--cyan)");
  let d = `M${x(0)},${y(pts[0].best)}`;
  for (const p of pts.slice(1)) d += `H${x(p.nodes)}V${y(p.best)}`;
  d += `H${x(res ? res.nodes : pts[pts.length - 1].nodes)}`;
  svg.append(s("path", { d, fill: "none", stroke: "var(--amber)", "stroke-width": 2.5 }));
  if (res) svg.append(s("circle", { cx: x(res.nodes), cy: y(res.obj), r: 4.5, fill: res.optimal ? "var(--green)" : "var(--amber)" }));
  svg.append(s("text", { x: L, y: H - 6, "font-size": 10, fill: "var(--faint)", text: "plans examined →" }));
  clear(el.conv).append(svg);
}

// Cumulative km along each line, for the time–distance graph.
function lineKm(code) {
  const line = S.line === "A" ? ["DDN", "HW", "LRJ", "NBD", "NGM", "DPR", "MB", "RMU", "BE", "SPN", "HRI", "LKO"] : ["DDN", "HW", "LRJ", "RK", "MOZ", "MTC", "GZB", "NDLS"];
  const km = {};
  let acc = 0;
  line.forEach((c, i) => { if (i) acc += app.net.sections.find(sc => (sc.a === line[i - 1] && sc.b === c) || (sc.b === line[i - 1] && sc.a === c)).km; km[c] = acc; });
  return { line, km, total: acc };
}

function drawGraph(animate) {
  if (!R) return;
  const { inst, fcfs, res, raw } = R;
  const { line, km, total } = lineKm();
  const W = 1180, H = 470, L = 118, Rr = 16, T = 26, B = 30;
  const t0 = inst.now - 30, t1 = inst.now + S.horizon + 30;
  const x = linear(t0, t1, L, W - Rr), y = linear(0, total, T, H - B);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "ol-svg", role: "img", "aria-label": "Time-distance graph of the optimised plan" });
  const defs = s("defs", {}, s("clipPath", { id: "olclip" }, s("rect", { x: L, y: 0, width: W - L - Rr, height: H })),
    s("pattern", { id: "olhatch", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, s("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "rgba(255,194,26,.10)", "stroke-width": 4 })));
  svg.append(defs);
  // single-line bands
  for (let i = 0; i < line.length - 1; i++) {
    const sc = app.net.sections.find(q => (q.a === line[i] && q.b === line[i + 1]) || (q.b === line[i] && q.a === line[i + 1]));
    if (sc.single) svg.append(s("rect", { x: L, width: W - L - Rr, y: y(km[line[i]]), height: y(km[line[i + 1]]) - y(km[line[i]]), fill: "url(#olhatch)" }));
  }
  line.forEach(c => svg.append(
    s("line", { x1: L, x2: W - Rr, y1: y(km[c]), y2: y(km[c]), stroke: "var(--rule)" }),
    s("text", { x: L - 10, y: y(km[c]) + 4, "text-anchor": "end", "font-size": 12, fill: "var(--muted)", "font-weight": 600, text: stName(c) })));
  for (let tt = Math.ceil(t0 / 30) * 30; tt <= t1; tt += 30) svg.append(
    s("line", { x1: x(tt), x2: x(tt), y1: T, y2: H - B, stroke: tt % 60 === 0 ? "rgba(214,232,220,.09)" : "rgba(214,232,220,.04)" }),
    tt % 60 === 0 ? s("text", { x: x(tt), y: H - 10, "text-anchor": "middle", "font-size": 11, fill: "var(--faint)", "font-family": "JetBrains Mono", text: hhmm(tt) }) : null);
  svg.append(s("line", { x1: x(inst.now), x2: x(inst.now), y1: T - 10, y2: H - B, stroke: "var(--cyan)", "stroke-width": 1.5, "stroke-dasharray": "3 3" }),
    s("text", { x: x(inst.now) + 4, y: T - 12, "font-size": 11, fill: "var(--cyan)", "font-family": "JetBrains Mono", text: `now ${hhmm(inst.now)}` }));
  const g = s("g", { "clip-path": "url(#olclip)" });
  svg.append(g);
  // engineering blocks
  for (const b of inst.blocks) {
    if (km[b.a] === undefined || km[b.b] === undefined) continue;
    const ya = y(Math.min(km[b.a], km[b.b])), yb = y(Math.max(km[b.a], km[b.b]));
    g.append(s("rect", { x: x(inst.E.rel[b.s]), width: x(inst.E.rel[b.e]) - x(inst.E.rel[b.s]), y: ya, height: yb - ya, fill: "rgba(255,77,61,.16)", stroke: "var(--red)", "stroke-dasharray": "4 3" }),
      s("text", { x: x(inst.E.rel[b.s]) + 4, y: ya + 14, "font-size": 11, fill: "var(--red)", text: "block" }));
  }
  const path = (t, ti) => {
    const pts = [];
    for (let i = 0; i < inst.nE; i++) if (inst.E.train[i] === ti && km[inst.E.code[i]] !== undefined) pts.push([t[i], km[inst.E.code[i]], i]);
    pts.sort((a, b) => a[2] - b[2]);
    // Keep only the continuous stretch on this line.
    return pts;
  };
  const holdSet = new Map(O.holds(inst, res.t).map(hh => [hh.e, hh]));
  const paths = [];
  inst.trains.forEach((tr, ti) => {
    const col = KIND[tr.kind][1];
    if (S.layer !== "opt") {
      const p = path(fcfs.t, ti);
      if (p.length > 1) g.append(s("path", { d: `M${p.map(q => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join("L")}`, fill: "none", stroke: "var(--today)", "stroke-width": 1.4, "stroke-dasharray": "5 4", opacity: S.layer === "both" ? 0.55 : 0.9 }));
    }
    if (S.layer !== "fcfs") {
      const p = path(res.t, ti);
      if (p.length > 1) {
        const pe = s("path", { d: `M${p.map(q => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join("L")}`, fill: "none", stroke: col, "stroke-width": 2.6, "stroke-linejoin": "round", class: "ol-tpath",
          onmousemove: e => tip(`<b>${tr.number}</b> ${app.trains[tr.number].name}<br>${KIND[tr.kind][0]} · priority ×${tr.w.toFixed(1)}`, e), onmouseleave: () => tip(null) });
        g.append(pe);
        paths.push(pe);
        const last = p[p.length - 1];
        g.append(s("text", { x: x(p[0][0]) + 4, y: y(p[0][1]) + (p[1][1] >= p[0][1] ? -5 : 13), "font-size": 11, fill: col, "font-weight": 700, text: tr.number }));
        void last;
        for (const q of p) {
          const hh = holdSet.get(q[2]);
          if (!hh) continue;
          const xs = x(q[0] - hh.wait), xe = x(q[0]), yy = y(q[1]);
          g.append(s("line", { x1: xs, x2: xe, y1: yy, y2: yy, stroke: "var(--amber-2)", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 }),
            s("text", { x: (xs + xe) / 2, y: yy - 8, "text-anchor": "middle", "font-size": 10.5, fill: "var(--amber-2)", "font-family": "JetBrains Mono", text: `+${Math.round(hh.wait)}` }));
        }
      }
    }
  });
  // conflicts in the raw forecast
  for (const c of raw) {
    let code1, code2, time = c.start;
    if (c.kind === "pair") {
      const p = inst.pairs[c.pair], u = inst.usages[p.u];
      code1 = u.a; code2 = u.b;
    } else { code1 = code2 = c.code; }
    if (km[code1] === undefined || km[code2] === undefined) continue;
    const yy = y((km[code1] + km[code2]) / 2);
    g.append(s("circle", { cx: x(time), cy: yy, r: 9, fill: "none", stroke: "var(--red)", "stroke-width": 2, class: "ol-ring",
      onmousemove: e => tip(conflictHtml(c), e), onmouseleave: () => tip(null) }));
  }
  clear(el.graph).append(svg);
  if (animate) paths.forEach((p, i) => drawIn(p, 900, i * 60));
}

function conflictInfo(c) {
  const { inst } = R;
  if (c.kind === "station") return { type: "Station full", where: stName(c.code), trains: [...new Set(c.set.map(vi => inst.visits[vi].train))].map(ti => tname(inst, ti)), text: `More trains than the ${inst.cap[c.code]} lines at ${stName(c.code)}` };
  const p = inst.pairs[c.pair], u = inst.usages[p.u];
  if (p.kind === "block") return { type: "Engineering block", where: `${stName(u.a)}–${stName(u.b)}`, trains: [tname(inst, u.train)], text: `${tname(inst, u.train)} is forecast on a closed section` };
  const v = inst.usages[p.v];
  if (p.kind === "opp") return { type: "Head-on on single line", where: `${stName(u.a)}–${stName(u.b)}`, trains: [tname(inst, u.train), tname(inst, v.train)], text: `${tname(inst, u.train)} and ${tname(inst, v.train)} would be on the single line in opposite directions` };
  return { type: "Too close", where: `${stName(u.a)}–${stName(u.b)}`, trains: [tname(inst, u.train), tname(inst, v.train)], text: `${tname(inst, v.train)} would catch up with ${tname(inst, u.train)} inside the section` };
}
function conflictHtml(c) { const i = conflictInfo(c); return `<b>${i.type}</b> · ${i.where}<br>${hhmm(c.start)}: ${i.text}`; }

function drawConflicts() {
  const box = clear(el.conflicts);
  if (!R.raw.length) { box.append(h("div", { class: "ol-empty" }, h("b", {}, "No conflicts."), h("p", { class: "small" }, "Kalyon’s forecasts leave every train a clear path in this window."))); return; }
  const decided = new Map((R.res.decisions || []).filter(d => d.pair !== undefined).map(d => [d.pair, d]));
  for (const c of R.raw) {
    const i = conflictInfo(c);
    let res = "Resolved by an earlier decision";
    if (c.kind === "pair" && decided.has(c.pair)) {
      const d = decided.get(c.pair), p = R.inst.pairs[c.pair];
      if (p.kind === "block") res = d.alt === 0 ? "Train clears before the block" : "Train waits for the block";
      else {
        const u = R.inst.usages[p.u], v = R.inst.usages[p.v];
        res = `${tname(R.inst, (d.alt === 0 ? u : v).train)} goes first${d.alt === 1 ? " (not the first to arrive)" : ""}`;
      }
    } else if (c.kind === "station") res = "A train waits outside for a free line";
    box.append(h("div", { class: "ol-conf" },
      h("div", { class: "ol-conf-top" }, h("span", { class: "ol-badge" }, i.type), h("span", { class: "num" }, hhmm(c.start))),
      h("b", {}, i.where), h("p", { class: "small" }, i.text), h("p", { class: "ol-res" }, "→ ", res)));
  }
}

function drawImpact() {
  const rows = O.trainImpact(R.inst, R.fcfs.t, R.res.t).filter(r => r.stops > 0).sort((a, b) => (b.lastBefore - b.lastAfter) - (a.lastBefore - a.lastAfter));
  const box = clear(el.impact);
  const max = Math.max(10, ...rows.map(r => Math.max(r.lastBefore, r.lastAfter)));
  for (const r of rows) {
    const diff = r.lastAfter - r.lastBefore;
    const bw = v => `${(Math.max(0, v) / max) * 100}%`;
    box.append(h("div", { class: "ol-imp-tr" },
      h("div", { class: "ol-imp-name" }, h("i", { style: `background:${KIND[r.kind][1]}` }), h("b", {}, r.number), h("span", {}, `to ${stName(r.lastCode)}`)),
      h("div", { class: "ol-imp-bars" },
        h("div", { class: "b0", style: `width:${bw(r.lastBefore)}` }), h("div", { class: "b1", style: `width:${bw(r.lastAfter)}` })),
      h("div", { class: `ol-imp-v num ${diff < -0.5 ? "good" : diff > 0.5 ? "bad" : ""}` }, `${Math.round(Math.max(0, r.lastBefore))} → ${Math.round(Math.max(0, r.lastAfter))} min`)));
  }
  box.append(h("p", { class: "small", style: "margin-top:8px" }, "Some trains may lose a few minutes so that higher-priority or later-running trains gain more: the engine minimises the total, not every train’s delay."));
}

function drawStrategies() {
  const { inst, fcfs, pri, ai, res, raw } = R;
  const rows = [
    ["Kalyon forecast, conflicts ignored", O.objective(inst, inst.base), "var(--faint)", `Not possible: ${raw.length} conflict${raw.length === 1 ? "" : "s"}`],
    ["First come, first served", fcfs.obj, "var(--today)", "Standard practice"],
    ["Higher priority first", pri ? pri.obj : NaN, "var(--muted)", "Simple rule"],
    ["AI dispatcher alone", ai ? ai.obj : NaN, "var(--cyan)", "Instant"],
    ["Kalyon optimum", res.obj, "var(--amber)", res.optimal ? "Proven optimal" : "Best found"],
  ];
  const max = Math.max(...rows.map(r => r[1]).filter(Number.isFinite), 1);
  const box = clear(el.strat);
  rows.forEach(([l, v, c, note], i) => {
    const bar = h("i", { style: `background:${c}${i === 0 ? ";opacity:.45" : ""}` });
    box.append(h("div", { class: `ol-st ${i === 4 ? "best" : ""}` }, h("div", { class: "ol-st-l" }, h("b", {}, l), h("span", {}, note)),
      h("div", { class: "ol-st-bar" }, bar), h("b", { class: "num" }, Number.isFinite(v) ? Math.round(v).toLocaleString("en-IN") : "–")));
    requestAnimationFrame(() => { bar.style.width = `${(Number.isFinite(v) ? v / max : 0) * 100}%`; });
  });
}

function fillStations() {
  const counts = new Map();
  for (const [code, lst] of R.inst.byStation) counts.set(code, lst.length);
  const list = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  clear(el.stSel);
  for (const [code, n] of list) el.stSel.append(h("option", { value: code }, `${stName(code)} (${n} trains, ${R.inst.cap[code]} lines)`));
  if (!list.find(([c]) => c === S.station)) S.station = list.length ? list[0][0] : null;
  el.stSel.value = S.station || "";
}

function drawPlatforms() {
  const box = clear(el.plat);
  if (!R || !S.station) { box.append(h("p", { class: "small" }, "No station has more than one train in this window.")); return; }
  const pl = O.platforms(R.inst, R.res.t, S.station);
  const W = 700, rowH = 30, T = 8, L = 70, B = 26;
  const H = T + pl.L * rowH + B;
  const items = pl.items;
  const t0 = Math.min(R.inst.now, ...items.map(i => i.lo)) - 5, t1 = Math.max(R.inst.now + 60, ...items.map(i => i.hi)) + 10;
  const x = linear(t0, t1, L, W - 10);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Line allocation at ${stName(S.station)}` });
  for (let l = 0; l < pl.L; l++) svg.append(s("rect", { x: L, y: T + l * rowH + 3, width: W - L - 10, height: rowH - 6, fill: "rgba(255,255,255,.025)" }),
    s("text", { x: L - 8, y: T + l * rowH + rowH / 2 + 4, "text-anchor": "end", "font-size": 11.5, fill: "var(--muted)", "font-weight": 600, text: `Line ${l + 1}` }));
  niceTicks(t0, t1, 6).forEach(v => svg.append(s("text", { x: x(v), y: H - 8, "text-anchor": "middle", "font-size": 10.5, fill: "var(--faint)", "font-family": "JetBrains Mono", text: hhmm(v) })));
  svg.append(s("line", { x1: x(R.inst.now), x2: x(R.inst.now), y1: T, y2: H - B, stroke: "var(--cyan)", "stroke-dasharray": "3 3" }));
  for (const it of items) {
    const tr = R.inst.trains[it.train];
    const xx = x(it.lo), ww = Math.max(4, x(Math.max(it.hi, it.lo + 1.5)) - xx);
    const yy = T + it.line * rowH + 5;
    svg.append(s("rect", { x: xx, y: yy, width: ww, height: rowH - 10, fill: KIND[tr.kind][1], opacity: 0.85, rx: 2,
      onmousemove: e => tip(`<b>${tr.number}</b> on line ${it.line + 1}<br>${hhmm(it.lo)} – ${hhmm(it.hi)}${it.line !== it.pref ? "<br>Moved from its usual line" : ""}`, e), onmouseleave: () => tip(null) }),
      ww > 34 ? s("text", { x: xx + 4, y: yy + rowH / 2 - 1, "font-size": 10.5, fill: "var(--board-ink)", "font-weight": 700, text: tr.number }) : null);
  }
  box.append(svg, h("p", { class: "small" }, `Lines are given out once the times are fixed: each train gets its usual line (line 1 leaving Dehradun, line 2 towards it) when it is free. ${pl.moved ? `${pl.moved} train${pl.moved === 1 ? " is" : "s are"} moved to another line.` : "Every train keeps its usual line."} Line counts are assumed for this demonstrator.`));
}

// ------------------------------------------------------------------------------------------
// Day scan
// ------------------------------------------------------------------------------------------
async function scanDay() {
  el.scanBtn.disabled = true;
  const r = rep();
  const rows = [];
  const box = clear(el.scan);
  const prog = h("p", { class: "small" }, "Scanning…");
  box.append(prog);
  const saved = S.t;
  for (let t = 0; t <= 1380; t += 30) {
    S.t = t;
    const { snap, params, blocks } = scenarioInput();
    const inst = O.buildInstance(snap.trains, snap.now, D, { params, blocks: [] });
    void blocks;
    const f = O.greedy(inst, "fcfs", D);
    const b = O.runToEnd(O.branchAndBound(inst, D, { nodeLimit: 20000 }));
    rows.push({ t, conf: O.conflicts(inst, inst.base).length, save: f.obj - b.obj, fcfs: f.obj });
    prog.textContent = `Scanning ${hhmm(w0() + t)}…`;
    await frame();
  }
  S.t = saved;
  void r;
  drawScan(rows);
  el.scanBtn.disabled = false;
}
function drawScan(rows) {
  const box = clear(el.scan);
  const W = 460, H = 200, L = 40, Rr = 8, T = 10, B = 26;
  const max = Math.max(10, ...rows.map(r => r.save));
  const x = linear(0, rows.length, L, W - Rr), y = linear(0, max, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Delay saved by optimising at each time of day" });
  niceTicks(0, max, 3).forEach(v => svg.append(s("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), stroke: "var(--rule)" }), s("text", { x: L - 5, y: y(v) + 4, "text-anchor": "end", "font-size": 10, fill: "var(--faint)", text: Math.round(v) })));
  const bw = (W - L - Rr) / rows.length;
  rows.forEach((r, i) => {
    const sel = r.t === S.t;
    const rect = s("rect", { x: x(i) + 1, width: bw - 2, y: y(0), height: 0, fill: sel ? "var(--amber-2)" : r.save > 0.5 ? "var(--amber)" : "rgba(255,255,255,.12)", style: "cursor:pointer",
      onclick: () => { S.t = r.t; sync(); run(); drawScan(rows); },
      onmousemove: e => tip(`<b>${hhmm(w0() + r.t)}</b><br>${r.conf} conflict${r.conf === 1 ? "" : "s"} in the forecast<br>Optimising saves ${Math.round(r.save)} weighted delay-min`, e), onmouseleave: () => tip(null) });
    svg.append(rect);
    tween(0, 1, 600, p => { rect.setAttribute("y", y(r.save * p)); rect.setAttribute("height", y(0) - y(r.save * p)); });
    if (i % 4 === 0) svg.append(s("text", { x: x(i) + bw / 2, y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--faint)", "font-family": "JetBrains Mono", text: hhmm(w0() + r.t) }));
  });
  const best = rows.reduce((a, b) => (b.save > a.save ? b : a), rows[0]);
  const total = rows.reduce((a, b) => a + b.save, 0);
  box.append(svg, h("p", { class: "small" }, `Biggest saving at ${hhmm(w0() + best.t)} (${Math.round(best.save)} weighted delay-min). Plans overlap in time, so the bars are not added up into a daily total${total ? "" : ""}.`));
}
