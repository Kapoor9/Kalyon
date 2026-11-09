// Under the hood: one real forecast, made step by step by the real models running in this browser tab.
// Every number on this page is computed live here, from the same trees the Python pipeline trained.
import { forecastAll, replayState, predict, treePath } from "./engine.js?v=202611091824";
import { h, s, $, $$, clear, hhmm, tween } from "./ui.js?v=202611091824";
import { fmtFeature } from "./explain.js?v=202611091824";

const REDUCED = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const fm = (v, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)} min`;
const fmt = n => Math.round(n).toLocaleString("en-IN");
const MODEL_INFO = {
  q50: ["Median model", "The middle guess: half of trains arrive earlier, half later. This is the Kalyon ETA."],
  q10: ["Low model", "An optimistic guess: only 10% of trains arrive earlier than this."],
  q90: ["High model", "A cautious guess: 90% of trains arrive before this."],
  m1: ["Point model", "A single best guess trained to ignore extreme outliers (Huber loss). Used for the scorecard."],
};

let app, root, cur = null, stepIdx = 0, active = false, introPlayed = false;
const CASE = { rep: "festive", run: null, k: 1, s: null };
const mon = { trees: 0, forecasts: 0, last: 0, times: [] };
let monEls = {}, caseEls = {}, navEl, stageEl, overlay = null;

// ---------- Compute one forecast, with everything needed to explain it ----------
function compute(ov = null) {
  const M = app.M;
  const rep = app.replays.find(r => r.id === CASE.rep);
  const run = rep.runs.find(r => r.run === CASE.run) || rep.runs[0];
  const t = app.trains[run.train];
  const k = CASE.k, w0 = rep.t0_day * 1440 + 240;
  const st0 = replayState(rep, run, k, app.startDate);
  let st = st0;
  if (ov) {
    const shift = ov.delay - st0.depDelays[k];
    st = { ...st0,
      depDelays: st0.depDelays.map((d, i) => (i <= k ? d + shift : d)),
      reportTime: st0.reportTime + shift,
      weather: { ...st0.weather, visibility: ov.vis, rain: ov.rain, festival: ov.festival ? 1 : 0 },
      overrides: ov.unseen ? { hist_chg: NaN } : null };
  }
  const t0 = performance.now();
  const fc = forecastAll(M, t, k, st, i => w0 + run.ev[i][1], w0 + run.ev[k][2], true);
  const row = fc.find(f => f.s === CASE.s) || fc[fc.length - 1];
  const sums = Object.fromEntries(Object.keys(M.models).map(m => [m, predict(M.models[m], row.x)]));
  const ms = performance.now() - t0;
  const nTrees = Object.values(M.models).reduce((a, m) => a + m.trees.length, 0);
  mon.trees += fc.length * nTrees + fc.length * M.models.q50.trees.length + nTrees;
  mon.forecasts += fc.length;
  mon.last = ms; mon.times.push(ms); if (mon.times.length > 24) mon.times.shift();
  const dk = st.depDelays[k];
  const report = w0 + run.ev[k][2] + dk;
  const p = t.pairs[`${k}-${row.s}`];
  const floor = report + 0.8 * (p[2] - p[3]);
  const rawMed = row.b1 + sums.q50;
  const act = ov ? null : w0 + run.ev[row.s][1] + run.ev[row.s][3];
  const R = { rep, run, t, k, s: row.s, w0, st, row, fc, x: row.x, sums, b1: row.b1, sched: row.sched, dk, report, floor, rawMed,
    med: row.med, lo: row.lo, hi: row.hi, act, ms, phi: row.shap, from: app.stations[t.stops[k].code], to: app.stations[row.code],
    schedDep: w0 + run.ev[k][2] };
  renderMonitor(true);
  return R;
}

// ---------- Plain-language helpers ----------
const LBL = f => app.M.labels[f];
function meaning(f, v, R) {
  const to = R.to.name;
  const nan = v === null || Number.isNaN(v);
  switch (f) {
    case "cur_delay": return `The train is ${Math.round(v)} min late right now.`;
    case "dchg1": return Math.abs(v) < 0.5 ? "No change since the last stop." : v > 0 ? `It lost ${Math.round(v)} min since the last stop.` : `It made up ${Math.round(-v)} min since the last stop.`;
    case "dchg3": return Math.abs(v) < 0.5 ? "Steady over the last three stops." : v > 0 ? `It lost ${Math.round(v)} min over the last three stops.` : `It made up ${Math.round(-v)} min over the last three stops.`;
    case "resched": return v > 0 ? `It started ${Math.round(v)} min late: rescheduled at its origin.` : "It was not rescheduled at its origin.";
    case "n_rem": return `${v} stop${v === 1 ? "" : "s"} until ${to}.`;
    case "dist_rem": return `${Math.round(v)} km of track until ${to}.`;
    case "sched_rem": return `The timetable allows ${Math.round(v)} min to get there.`;
    case "slack_rem": return `${v.toFixed(1)} min of that is spare time the train can use to catch up.`;
    case "single_frac": return `${Math.round(v * 100)}% of the way is single track, where trains wait for each other.`;
    case "cong_rem": return `Traffic weight of the route ahead (0.5 quiet, 1.2 busiest on this corridor).`;
    case "hour": return `The report came in at ${fmtFeature("hour", v)}.`;
    case "dow": return `It is a ${DOW[v] ?? v}.`;
    case "month": return `Month: ${MONTHS[v - 1] ?? v}.`;
    case "fog_season": return v ? "Fog season (December to February)." : "Not fog season.";
    case "visibility": return v < 1 ? `Visibility ${v.toFixed(2)} km: dense fog.` : `Visibility ${v.toFixed(1)} km: clear enough.`;
    case "rain": return v > 0 ? `${Math.round(v)} mm of rain today.` : "No rain today.";
    case "festival": return v ? "Festival travel period: crowded trains and stations." : "Not a festival period.";
    case "train_type": return `Train type: ${["express", "superfast", "special"][v]}.`;
    case "hist_chg": return nan ? "No past runs to learn from (treated as a new train)." : Math.abs(v) < 0.5 ? "On past runs, today's estimate was usually right here." : `On past runs it usually arrived ${Math.round(Math.abs(v))} min ${v > 0 ? "later" : "earlier"} than today's estimate here.`;
    default: return "";
  }
}
const QNAME = { cur_delay: "the current delay", dchg1: "the delay change since the last stop", dchg3: "the delay change over 3 stops", resched: "the origin rescheduling",
  n_rem: "the stops left", dist_rem: "the distance left", sched_rem: "the scheduled time left", slack_rem: "the spare time left", single_frac: "the single-line share ahead",
  cong_rem: "the congestion ahead", visibility: "the visibility", rain: "the rainfall", hist_chg: "this train's usual error here" };
// A tree split "x[f] ≤ t" as a yes/no question, and whether the answer is yes.
function question(f, t, left) {
  const minsF = ["cur_delay", "dchg1", "dchg3", "resched", "sched_rem", "slack_rem", "hist_chg"];
  if (f === "fog_season") return ["Is it fog season?", !left];
  if (f === "festival") return ["Is it a festival travel period?", !left];
  if (f === "train_type") return [t < 1 ? "Is it an express train?" : "Is it an express or superfast train?", left];
  if (f === "dow") return [`Is it ${DOW[0]} to ${DOW[Math.max(0, Math.floor(t))]}?`, left];
  if (f === "month") return [`Is the month between Jan and ${MONTHS[Math.max(0, Math.floor(t) - 1)]}?`, left];
  if (f === "hour") return [`Was the report before ${fmtFeature("hour", t)}?`, left];
  let thr;
  if (minsF.includes(f)) thr = `${t.toFixed(1)} min`;
  else if (f === "n_rem") thr = `${Math.floor(t)} stop${Math.floor(t) === 1 ? "" : "s"}`;
  else if (f === "dist_rem") thr = `${Math.round(t)} km`;
  else if (f === "single_frac") thr = `${Math.round(t * 100)}%`;
  else if (f === "visibility") thr = `${t.toFixed(2)} km`;
  else if (f === "rain") thr = `${t.toFixed(1)} mm`;
  else thr = t.toFixed(2);
  return [`Is ${QNAME[f] || LBL(f).toLowerCase()} ${f === "n_rem" ? "at most" : "≤"} ${thr}?`, left];
}

// ---------- Build ----------
function build() {
  root = $("#v-hood");
  const nModels = Object.keys(app.M.models).length;
  const nTrees = Object.values(app.M.models).reduce((a, m) => a + m.trees.length, 0);
  const nNodes = Object.values(app.M.models).reduce((a, m) => a + m.trees.reduce((b, t) => b + t.f.length, 0), 0);
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Under the hood"),
        h("p", { class: "lede" }, "Watch one real forecast being made, step by step, by the actual AI models running live in this browser tab. Every number below is calculated as you look at it.")),
      h("button", { class: "btn ghost small", onclick: () => playIntro(true) }, "Replay the intro")),
    h("div", { class: "hd-mon panel", role: "status", "aria-live": "off" },
      h("div", { class: "hd-live" }, h("i", {}), h("div", {}, h("b", {}, "AI engine live"), h("span", {}, "LightGBM running in this tab"))),
      h("div", { class: "hd-stat" }, h("span", {}, "Models loaded"), h("b", {}, `${nModels}`)),
      h("div", { class: "hd-stat" }, h("span", {}, "Decision trees"), h("b", {}, fmt(nTrees))),
      h("div", { class: "hd-stat" }, h("span", {}, "Decision nodes"), h("b", {}, fmt(nNodes))),
      h("div", { class: "hd-stat" }, h("span", {}, "Trees evaluated this visit"), monEls.trees = h("b", { class: "num" }, "0")),
      h("div", { class: "hd-stat" }, h("span", {}, "Forecasts computed"), monEls.fc = h("b", { class: "num" }, "0")),
      h("div", { class: "hd-stat" }, h("span", {}, "Last forecast took"), monEls.last = h("b", { class: "num" }, "–")),
      monEls.spark = s("svg", { class: "hd-spark", viewBox: "0 0 120 32", "aria-hidden": "true" })),
    h("div", { class: "hd-case" },
      h("span", { class: "hd-case-l" }, "The example"),
      caseSel("rep", "Day"), caseSel("run", "Train"), caseSel("k", "Has just left"), caseSel("s", "Forecast for"),
      caseEls.note = h("span", { class: "hd-case-note" })),
    h("div", { class: "hd-main" },
      navEl = h("ol", { class: "hd-nav", "aria-label": "Steps" }),
      stageEl = h("section", { class: "hd-stage panel", "aria-live": "polite" })));
  STEPS.forEach((st, i) => navEl.append(h("li", {}, h("button", { "data-i": i, onclick: () => go(i) },
    h("span", { class: "n" }, String(i + 1)), h("span", { class: "t" }, h("b", {}, st.title), h("small", {}, st.sub))))));
  document.addEventListener("keydown", e => {
    if (!active || overlay?.classList.contains("on") || e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") go(Math.min(stepIdx + 1, STEPS.length - 1));
    if (e.key === "ArrowLeft") go(Math.max(stepIdx - 1, 0));
  });
  // default example: K131 on the festive-rush test day, just left Haridwar, forecast for Dhampur
  const rep = app.replays.find(r => r.id === CASE.rep);
  const run = rep.runs.find(r => r.train === "K131") || rep.runs[0];
  CASE.run = run.run;
  const t = app.trains[run.train];
  const dpr = t.stops.findIndex(x => x.code === "DPR");
  CASE.s = dpr > CASE.k ? dpr : t.stops.length - 1;
  fillCase();
}

function caseSel(key, label) {
  const sel = h("select", { onchange: e => {
    const v = e.target.value;
    if (key === "rep") { CASE.rep = v; const r = app.replays.find(x => x.id === v); CASE.run = r.runs[0].run; CASE.k = 0; CASE.s = null; }
    else if (key === "run") { CASE.run = +v; CASE.k = 0; CASE.s = null; }
    else if (key === "k") { CASE.k = +v; if (CASE.s <= CASE.k) CASE.s = null; }
    else CASE.s = +v;
    fillCase(); refresh(true);
  } });
  caseEls[key] = sel;
  return h("label", { class: "hd-sel" }, h("span", {}, label), sel);
}

function fillCase() {
  const rep = app.replays.find(r => r.id === CASE.rep);
  const opt = (v, txt, on) => h("option", { value: v, selected: on || null }, txt);
  clear(caseEls.rep).append(...app.replays.map(r => opt(r.id, `${r.title} · ${new Date(r.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`, r.id === CASE.rep)));
  const w0 = rep.t0_day * 1440 + 240;
  clear(caseEls.run).append(...rep.runs.map(r => opt(r.run, `${r.train} ${app.trains[r.train].name} · ${hhmm(w0 + r.ev[0][2] + r.ev[0][4])}`, r.run === CASE.run)));
  const run = rep.runs.find(r => r.run === CASE.run);
  const t = app.trains[run.train];
  clear(caseEls.k).append(...t.stops.slice(0, -1).map((st, i) => opt(i, app.stations[st.code].name, i === CASE.k)));
  if (CASE.s === null || CASE.s <= CASE.k) CASE.s = t.stops.length - 1;
  clear(caseEls.s).append(...t.stops.map((st, i) => i > CASE.k ? opt(i, app.stations[st.code].name, i === CASE.s) : null).filter(Boolean));
  caseEls.note.textContent = rep.note;
}

// ---------- Live monitor ----------
let monTween = null;
function renderMonitor(flash) {
  if (!monEls.trees) return;
  const from = +(monEls.trees.dataset.v || 0);
  monEls.trees.dataset.v = mon.trees;
  monTween && monTween();
  monTween = tween(from, mon.trees, 700, v => { monEls.trees.textContent = fmt(v); });
  monEls.fc.textContent = fmt(mon.forecasts);
  monEls.last.textContent = `${mon.last < 10 ? mon.last.toFixed(1) : Math.round(mon.last)} ms`;
  const sp = monEls.spark; clear(sp);
  const mx = Math.max(4, ...mon.times);
  if (mon.times.length > 1) {
    const pts = mon.times.map((v, i) => `${(i / (mon.times.length - 1)) * 118 + 1},${30 - (v / mx) * 26}`).join(" ");
    sp.append(s("polyline", { points: pts, fill: "none", stroke: "var(--green)", "stroke-width": 1.5 }));
  }
  if (flash) { const m = $(".hd-mon", root); m.classList.remove("pulse"); void m.offsetWidth; m.classList.add("pulse"); }
}

// ---------- Steps ----------
const STEPS = [
  { title: "The input", sub: "A running report arrives", render: sInput },
  { title: "The 19 signals", sub: "Turning the report into numbers", render: sSignals },
  { title: "Today's estimate", sub: "The starting point", render: sToday },
  { title: "Inside the model", sub: "Hundreds of decision trees, live", render: sModel },
  { title: "The likely range", sub: "Low, median and high models", render: sRange },
  { title: "The reasons", sub: "Which signal added which minutes", render: sReasons },
  { title: "Where the figures come from", sub: "Every number on the site, traced", render: sSources },
  { title: "Try it yourself", sub: "Change a signal, watch it flow", render: sTry },
];

let stopPlay = null;
function go(i, animate = true) {
  stopPlay && stopPlay(); stopPlay = null;
  stepIdx = i;
  $$("button", navEl).forEach((b, j) => { b.setAttribute("aria-current", j === i ? "step" : "false"); b.classList.toggle("done", j < i); });
  navEl.style.setProperty("--p", `${(i / (STEPS.length - 1)) * 100}%`);
  const st = STEPS[i];
  clear(stageEl).append(
    h("div", { class: "hd-shead" },
      h("span", { class: "kicker" }, `Step ${i + 1} of ${STEPS.length}`),
      h("h3", {}, st.title), h("p", { class: "small" }, st.sub)));
  const body = h("div", { class: "hd-body" });
  stageEl.append(body);
  st.render(body, cur);
  stageEl.append(h("div", { class: "hd-foot" },
    h("button", { class: "btn ghost small", disabled: i === 0 || null, onclick: () => go(i - 1) }, "← Previous"),
    h("span", { class: "small" }, "Tip: use the ← → keys"),
    i < STEPS.length - 1
      ? h("button", { class: "btn primary small", onclick: () => go(i + 1) }, `Next: ${STEPS[i + 1].title} `, h("span", { class: "arr" }, "→"))
      : h("button", { class: "btn primary small", onclick: () => app.route("method") }, "See how it is built ", h("span", { class: "arr" }, "→"))));
  const g = window.gsap;
  if (animate && g && !REDUCED()) {
    g.fromTo([...stageEl.querySelectorAll(".hd-shead > *"), ...body.children], { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: "power3.out", clearProps: "transform,opacity" });
  }
  const navBtn = $$("button", navEl)[i];
  if (navBtn && navEl.scrollWidth > navEl.clientWidth) navBtn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}

function refresh(flash) {
  cur = compute();
  go(stepIdx, false);
  if (flash) { stageEl.classList.remove("hd-flash"); void stageEl.offsetWidth; stageEl.classList.add("hd-flash"); }
}

const guide = (title, ...kids) => h("div", { class: "hd-guide" }, h("b", {}, title), h("div", {}, ...kids));
const say = txt => h("p", { class: "hd-say" }, h("b", {}, "Say it in one line: "), txt);
const maths = (...kids) => h("details", { class: "hd-math" }, h("summary", {}, "Show the maths"), h("div", {}, ...kids));
const eq = html => h("div", { class: "hd-eq", html });

// Step 1: the running report
function sInput(el, R) {
  const t = R.t, n = t.stops.length;
  const W = 760, H = 92, x = i => 30 + (i / (n - 1)) * (W - 60);
  const svg = s("svg", { class: "hd-route", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Route of ${t.name}` });
  svg.append(s("line", { x1: x(0), x2: x(n - 1), y1: 40, y2: 40, stroke: "var(--line-2)", "stroke-width": 3 }),
    s("line", { x1: x(R.k), x2: x(R.s), y1: 40, y2: 40, stroke: "var(--amber)", "stroke-width": 3, class: "hd-route-on" }));
  t.stops.forEach((st, i) => {
    const on = i === R.k || i === R.s;
    svg.append(s("circle", { cx: x(i), cy: 40, r: on ? 7 : 4.5, fill: i < R.k ? "var(--faint)" : i === R.s ? "var(--amber)" : "var(--panel-3)", stroke: i <= R.s && i >= R.k ? "var(--amber)" : "var(--line-2)", "stroke-width": 2 }),
      s("text", { x: x(i), y: i % 2 ? 76 : 20, "text-anchor": "middle", fill: on ? "var(--text)" : "var(--muted)", "font-size": 11.5, "font-weight": on ? 700 : 500, text: app.stations[st.code].name.length > 12 ? st.code : app.stations[st.code].name }));
  });
  svg.append(s("circle", { cx: x(R.k), cy: 40, r: 12, fill: "none", stroke: "var(--green)", "stroke-width": 2, class: "hd-ping" }));
  const w = R.st.weather;
  const lines = [
    "{",
    `  "train": "${t.number}",`,
    `  "event": "departed",`,
    `  "station": "${R.from.name} (${R.from.code})",`,
    `  "scheduled_departure": "${hhmm(R.schedDep)}",`,
    `  "actual_departure": "${hhmm(R.report)}",`,
    `  "delay_min": ${R.dk.toFixed(1)},`,
    `  "rescheduled_at_origin_min": ${Math.round(R.st.resched || 0)},`,
    `  "date": "${R.st.date.toISOString().slice(0, 10)}",`,
    `  "weather": { "visibility_km": ${w.visibility.toFixed(2)}, "rain_mm": ${Math.round(w.rain)}, "festival": ${w.festival ? "true" : "false"} }`,
    "}",
  ];
  const pre = h("pre", { class: "hd-packet", "aria-label": "The running report" });
  el.append(
    guide("In plain words", `Every time a train leaves a station, the railway system records a short message like the one below. Kalyon wakes up and asks one question: `, h("b", {}, `when will ${t.number} ${t.name} reach ${R.to.name}?`)),
    h("div", { class: "hd-two" },
      h("div", {}, h("p", { class: "hd-cap" }, "The message (a “running report”)"), pre),
      h("div", { class: "hd-facts" },
        h("p", { class: "hd-cap" }, "Where the train is"), svg,
        h("dl", {},
          h("dt", {}, "Train"), h("dd", {}, `${t.number} ${t.name}`),
          h("dt", {}, "Just left"), h("dd", {}, `${R.from.name} at ${hhmm(R.report)}, ${Math.round(R.dk)} min late`),
          h("dt", {}, "Question"), h("dd", {}, `Arrival time at ${R.to.name}`),
          h("dt", {}, "Where this report comes from"), h("dd", {}, `A replay of ${R.rep.title.toLowerCase()} (${R.rep.date}). ${R.rep.note} In a real pilot it would come from the railway's own systems (NTES/RTIS).`)))),
    say("Every departure sends a short report; Kalyon turns each report into fresh arrival times for every station ahead."));
  let i = 0;
  const type = () => { if (i >= lines.length || !pre.isConnected) return; pre.append(h("span", { class: "ln" }, lines[i++]), "\n"); setTimeout(type, REDUCED() ? 0 : 70); };
  type();
}

// Step 2: the 19 signals
const GROUPS = [["Delay so far", ["cur_delay", "dchg1", "dchg3", "resched"]], ["Distance and time left", ["n_rem", "dist_rem", "sched_rem", "slack_rem"]],
  ["The track ahead", ["single_frac", "cong_rem"]], ["Calendar", ["hour", "dow", "month", "fog_season"]], ["Weather and crowds", ["visibility", "rain", "festival"]],
  ["The train itself", ["train_type", "hist_chg"]]];
function sSignals(el, R) {
  const F = app.M.features;
  const vec = h("div", { class: "hd-vec num" });
  const cells = F.map((f, i) => { const v = R.x[i]; const c = h("span", { "data-f": f }, v === null || Number.isNaN(v) ? "NaN" : (+v.toFixed(2)).toString()); return c; });
  vec.append("x = [ ", ...cells.flatMap((c, i) => (i ? [", ", c] : [c])), " ]");
  const hi = f => { $$("[data-f]", el).forEach(e => e.classList.toggle("on", e.dataset.f === f)); };
  el.append(
    guide("In plain words", "A computer model cannot read a sentence. So the report, the timetable and the day's conditions are turned into 19 numbers, called signals or features. These 19 numbers are all the model ever sees."),
    h("div", { class: "hd-groups" }, ...GROUPS.map(([g, fs]) => h("div", { class: "hd-group" }, h("p", { class: "hd-cap" }, g),
      ...fs.map(f => { const i = F.indexOf(f); return h("div", { class: "hd-sig", "data-f": f, tabindex: 0, onmouseenter: () => hi(f), onfocus: () => hi(f) },
        h("span", { class: "l" }, LBL(f)), h("b", { class: "num" }, fmtFeature(f, R.x[i])), h("span", { class: "m" }, meaning(f, R.x[i], R))); })))),
    h("p", { class: "hd-cap" }, "The same 19 signals, exactly as the model receives them (hover a signal above to find it)"), vec,
    maths(h("p", {}, "The signals are built by kalyon/features.py in Python and mirrored line for line in js/engine.js (buildFeatures), so the browser and Python feed the model identical numbers. A test (tests/parity.mjs) checks this."),
      eq("<i>x</i> = (<i>x</i><sub>1</sub>, <i>x</i><sub>2</sub>, …, <i>x</i><sub>19</sub>)  ∈ ℝ<sup>19</sup>")),
    say("The model never sees the train or the map, only these 19 numbers that describe the situation."));
}

// Step 3: today's estimate
function sToday(el, R) {
  const box = (cap, val, cls = "") => h("div", { class: `hd-term ${cls}` }, h("span", {}, cap), h("b", { class: "num" }, val));
  el.append(
    guide("In plain words", "Railway apps today calculate the arrival time with one addition: the timetable time plus however late the train is now. They assume the delay will stay exactly the same all the way. Kalyon starts from this same number and then asks: how wrong is it likely to be this time?"),
    h("div", { class: "hd-equation" },
      box(`Timetable arrival at ${R.to.name}`, hhmm(R.sched)), h("span", { class: "op" }, "+"),
      box("Current delay", `${Math.round(R.dk)} min`), h("span", { class: "op" }, "="),
      box("Today's estimate", hhmm(R.b1), "today")),
    h("div", { class: "hd-callout" },
      h("p", {}, h("b", {}, "Kalyon's job: "), `predict the correction to ${hhmm(R.b1)}. If the train will lose more time ahead, the correction is positive; if it will catch up, negative.`),
      h("p", { class: "small" }, `It learned this from ${fmt(app.metrics.counts.train_rows)} past forecasts in the training months (${app.metrics.periods.train}), each paired with what actually happened.`)),
    maths(eq("Today's estimate:  <i>ETA</i><sub>today</sub> = <i>T</i><sub>sched</sub>(<i>s</i>) + <i>d</i><sub>k</sub>"),
      eq("What the model learns (the residual):  <i>r</i> = <i>actual</i> − <i>ETA</i><sub>today</sub>"),
      eq("Kalyon's ETA:  <i>ETA</i> = <i>ETA</i><sub>today</sub> + <i>r̂</i>(<i>x</i>)")),
    say("We don't throw away today's method; we learn how wrong it usually is and correct it."));
}

// Step 4: inside the model (the live tree walk)
const layouts = new Map();
function layoutTree(tree) {
  if (layouts.has(tree)) return layouts.get(tree);
  const pos = {}; let leaf = 0, depth = 0;
  const rec = (i, d) => {
    depth = Math.max(depth, d);
    if (tree.f[i] === -1) { pos[i] = { x: leaf++, d }; return pos[i].x; }
    const a = rec(tree.l[i], d + 1), b = rec(tree.r[i], d + 1);
    pos[i] = { x: (a + b) / 2, d }; return pos[i].x;
  };
  rec(0, 0);
  const L = { pos, leaves: leaf, depth };
  layouts.set(tree, L);
  return L;
}
let hdModel = "q50", speed = 40;
function sModel(el, R) {
  const M = app.M;
  const model = M.models[hdModel], trees = model.trees, F = M.features;
  const paths = trees.map(t => treePath(t, R.x));
  mon.trees += trees.length; renderMonitor(false);
  const cum = []; paths.reduce((a, p, i) => (cum[i] = a + p.value), 0);
  const total = cum[cum.length - 1];
  const nQ = paths.reduce((a, p) => a + p.path.length, 0);
  let ti = 0;
  const treeBox = h("div", { class: "hd-tree" });
  const qList = h("ol", { class: "hd-qs" });
  const head = h("div", { class: "hd-thead" });
  const sumEl = h("b", { class: "num hd-sum" }, fm(0, 2));
  const log = h("pre", { class: "hd-log num", "aria-label": "Inference log" });
  const slider = h("input", { type: "range", min: 1, max: trees.length, value: 1, "aria-label": "Tree number", oninput: e => { pause(); show(+e.target.value - 1, true); } });
  const chart = s("svg", { class: "hd-cum", viewBox: "0 0 600 150", preserveAspectRatio: "none", role: "img", "aria-label": "Running total of tree outputs" });
  const playBtn = h("button", { class: "btn primary small", onclick: () => (playing ? pause() : play()) }, "▶ Run all trees");
  const lo = Math.min(0, ...cum), hi = Math.max(0, ...cum), X = i => (i / Math.max(1, trees.length - 1)) * 596 + 2, Y = v => 140 - ((v - lo) / Math.max(1e-6, hi - lo)) * 128;
  const ghost = s("polyline", { points: cum.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: "var(--line-2)", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" });
  const live = s("polyline", { fill: "none", stroke: "var(--amber)", "stroke-width": 2.5, "vector-effect": "non-scaling-stroke" });
  const dot = s("circle", { r: 4, fill: "var(--amber)" });
  chart.append(s("line", { x1: 0, x2: 600, y1: Y(0), y2: Y(0), stroke: "var(--rule)", "vector-effect": "non-scaling-stroke" }), ghost, live);
  const dotWrap = h("div", { class: "hd-cumwrap" }, chart, dot.ownerSVGElement ? null : null);
  chart.append(dot);

  function drawTree(i, animate) {
    const tree = trees[i], L = layoutTree(tree), P = paths[i];
    const W = 640, H = 230, sx = x => 12 + ((x + 0.5) / L.leaves) * (W - 24), sy = d => 14 + d * ((H - 30) / Math.max(L.depth, 1));
    const on = new Set(P.path.map(p => p.i)); on.add(P.leaf);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Tree ${i + 1}: the highlighted path is the route this forecast took` });
    const edges = s("g", {}), onEdges = s("g", { class: "hd-onpath" }), nodes = s("g", {});
    for (const k of Object.keys(L.pos)) {
      const n = +k, p = L.pos[n];
      if (tree.f[n] !== -1) for (const c of [tree.l[n], tree.r[n]]) {
        const q = L.pos[c], isOn = on.has(n) && on.has(c);
        (isOn ? onEdges : edges).append(s("line", { x1: sx(p.x), y1: sy(p.d), x2: sx(q.x), y2: sy(q.d), pathLength: 1, class: isOn ? "e on" : "e" }));
      }
      const leaf = tree.f[n] === -1;
      nodes.append(s("circle", { cx: sx(p.x), cy: sy(p.d), r: on.has(n) ? (n === P.leaf ? 6.5 : 4.5) : leaf ? 2 : 2.8, class: on.has(n) ? (n === P.leaf ? "n leaf on" : "n on") : "n" }));
    }
    const lp = L.pos[P.leaf];
    nodes.append(s("text", { x: Math.min(W - 40, Math.max(40, sx(lp.x))), y: Math.min(H - 2, sy(lp.d) + 18), "text-anchor": "middle", class: "lv", text: fm(P.value, 2) }));
    svg.append(edges, onEdges, nodes);
    if (animate && !REDUCED()) {
      [...onEdges.children].sort((a, b) => +a.getAttribute("y1") - +b.getAttribute("y1")).forEach((e, j) => { e.style.animationDelay = `${j * 90}ms`; e.classList.add("draw"); });
    }
    clear(treeBox).append(svg);
  }
  function show(i, animate = false) {
    ti = i;
    const P = paths[i];
    drawTree(i, animate);
    clear(head).append(h("b", {}, `Tree ${i + 1} of ${trees.length}`), h("span", {}, ` · asked ${P.path.length} questions · adds `), h("b", { class: P.value >= 0 ? "up" : "down" }, fm(P.value, 3)));
    clear(qList).append(...P.path.map((p, j) => {
      const [q, yes] = question(F[p.f], p.t, p.left);
      return h("li", { style: animate && !REDUCED() ? `animation-delay:${j * 90}ms` : null, class: animate ? "pop" : "" },
        h("span", { class: "q" }, q), h("span", { class: `a ${yes ? "y" : "n"}` }, p.missing ? "No data → default" : yes ? "Yes" : "No"),
        h("span", { class: "v" }, `(${fmtFeature(F[p.f], R.x[p.f])})`));
    }), h("li", { class: `leaf${animate ? " pop" : ""}`, style: animate && !REDUCED() ? `animation-delay:${P.path.length * 90}ms` : null }, h("span", { class: "q" }, "Reaches a leaf. This tree's answer:"), h("b", { class: "num" }, fm(P.value, 3))));
    live.setAttribute("points", cum.slice(0, i + 1).map((v, j) => `${X(j)},${Y(v)}`).join(" "));
    dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(cum[i]));
    sumEl.textContent = fm(cum[i], 2);
    slider.value = i + 1;
    slider.style.setProperty("--p", `${(i / Math.max(1, trees.length - 1)) * 100}%`);
  }
  function logLine(i) {
    const P = paths[i];
    log.append(h("span", { class: i === trees.length - 1 ? "fin" : "" }, `tree ${String(i + 1).padStart(3, "0")}  q=${P.path.length}  leaf ${P.value >= 0 ? "+" : "−"}${Math.abs(P.value).toFixed(3)}  Σ ${cum[i] >= 0 ? "+" : "−"}${Math.abs(cum[i]).toFixed(3)}`), "\n");
    while (log.childNodes.length > 120) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  let playing = false, timer = null;
  function play() {
    if (ti >= trees.length - 1) { ti = -1; clear(log); }
    playing = true; playBtn.textContent = "❚❚ Pause";
    const stepFn = () => {
      if (!playing || !el.isConnected) return;
      const i = ti + 1;
      show(i, speed >= 200); logLine(i);
      if (i >= trees.length - 1) { pause(); finish(); return; }
      timer = setTimeout(stepFn, speed);
    };
    stepFn();
  }
  function pause() { playing = false; clearTimeout(timer); playBtn.textContent = ti >= trees.length - 1 ? "↻ Run again" : "▶ Continue"; }
  function finish() {
    log.append(h("span", { class: "fin" }, `done: ${trees.length} trees, ${nQ} questions, correction ${total >= 0 ? "+" : "−"}${Math.abs(total).toFixed(3)} min`), "\n");
    log.scrollTop = log.scrollHeight;
    finale.classList.add("on");
  }
  stopPlay = () => { playing = false; clearTimeout(timer); };
  const finale = h("div", { class: "hd-finale" }, h("span", {}, `All ${trees.length} trees added together:`), h("b", { class: "num" }, fm(total, 2)), h("span", {}, `This is the ${hdModel === "q50" ? "correction Kalyon adds to today's estimate" : "answer of the " + MODEL_INFO[hdModel][0].toLowerCase()}.`));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Which model" }, ...["q50", "q10", "q90", "m1"].map(m => h("button", { "aria-pressed": String(m === hdModel), onclick: () => { hdModel = m; go(stepIdx, false); } }, MODEL_INFO[m][0])));
  const spd = h("div", { class: "seg", role: "group", "aria-label": "Speed" }, ...[[260, "Slow"], [40, "Normal"], [8, "Fast"]].map(([v, l]) => h("button", { "aria-pressed": String(v === speed), onclick: e => { speed = v; $$("button", e.target.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === e.target))); } }, l)));
  el.append(
    guide("In plain words", `The model is a “forest” of ${trees.length} small decision trees. Each tree asks a few yes/no questions about the 19 signals (“Is visibility below 1 km?”), follows the answers down to an end point called a leaf, and adds a few minutes, or takes some away. The trees were built one after another, each one learning to fix the mistakes of the ones before it (this is called gradient boosting). Press Run to watch every tree being evaluated for this forecast, live.`),
    h("div", { class: "hd-ctrls" }, seg, h("span", { class: "small" }, MODEL_INFO[hdModel][1])),
    h("div", { class: "hd-ctrls" }, playBtn, h("button", { class: "btn ghost small", onclick: () => { pause(); for (let i = ti + 1; i < trees.length; i++) logLine(i); show(trees.length - 1); finish(); } }, "Skip to the end"), spd,
      h("label", { class: "hd-scrub" }, h("span", { class: "small" }, "Pick a tree"), slider)),
    h("div", { class: "hd-model" },
      h("div", { class: "hd-treecol" }, head, treeBox, h("p", { class: "small" }, "Every dot is a question or a leaf. The glowing path is the route this forecast took through this tree.")),
      h("div", { class: "hd-qcol" }, h("p", { class: "hd-cap" }, "The questions this tree asked"), qList)),
    h("div", { class: "hd-model" },
      h("div", {}, h("p", { class: "hd-cap" }, "Running total: tree answers added one by one"), h("div", { class: "hd-sumrow" }, h("span", { class: "small" }, "Total so far"), sumEl), dotWrap),
      h("div", {}, h("p", { class: "hd-cap" }, "Inference log (what the engine is doing, line by line)"), log)),
    finale,
    h("p", { class: "small" }, `For this one forecast the ${MODEL_INFO[hdModel][0].toLowerCase()} answered ${fmt(nQ)} yes/no questions across ${trees.length} trees. Across all four models Kalyon uses ${fmt(Object.values(M.models).reduce((a, m) => a + m.trees.length, 0))} trees for every station ahead.`),
    maths(eq("<i>r̂</i>(<i>x</i>) = Σ<sub><i>t</i>=1…<i>T</i></sub> <i>f</i><sub><i>t</i></sub>(<i>x</i>),   each <i>f</i><sub><i>t</i></sub> a decision tree with up to 31 leaves"),
      eq("Gradient boosting: <i>F</i><sub><i>m</i></sub>(<i>x</i>) = <i>F</i><sub><i>m</i>−1</sub>(<i>x</i>) + η·<i>f</i><sub><i>m</i></sub>(<i>x</i>),   η = 0.05 (learning rate)"),
      eq("Median, low and high models: quantile (pinball) loss  <i>L</i><sub>τ</sub>(<i>r</i>, <i>q</i>) = max(τ(<i>r</i> − <i>q</i>), (τ − 1)(<i>r</i> − <i>q</i>)),  τ ∈ {0.1, 0.5, 0.9}"),
      eq("Point model: Huber loss  <i>L</i><sub>δ</sub>(<i>e</i>) = ½<i>e</i>² if |<i>e</i>| ≤ δ, else δ(|<i>e</i>| − ½δ),  δ = 20 min"),
      h("p", { class: "small" }, "Trained with LightGBM in kalyon/train.py; training stopped early when accuracy on the validation months (Jul–Aug 2026) stopped improving. The trees were exported to data/model.json and are evaluated here by js/engine.js.")),
    say(`Hundreds of small yes/no trees each add a few minutes; together they give the correction, ${fm(total, 1)} for this train.`));
  show(0);
  if (!REDUCED()) setTimeout(() => { if (el.isConnected && !playing && ti === 0) play(); }, 700);
}

// Step 5: the likely range
function sRange(el, R) {
  const c = app.M.interval_scale, q = R.sums;
  const loRaw = R.b1 + q.q50 - c * (q.q50 - q.q10), hiRaw = R.b1 + q.q50 + c * (q.q90 - q.q50);
  const card = (m, val) => h("div", { class: `hd-mcard ${m}` }, h("span", {}, MODEL_INFO[m][0]), h("b", { class: "num" }, fm(val, 1)), h("small", {}, `${app.M.models[m].trees.length} trees → ${hhmm(R.b1 + val)}`));
  const pts = [R.sched, R.b1, R.lo, R.hi, R.med, R.act].filter(v => v !== null);
  const a = Math.min(...pts) - 12, b = Math.max(...pts) + 12, W = 760, X = v => 20 + ((v - a) / (b - a)) * (W - 40);
  const tl = s("svg", { class: "hd-timeline", viewBox: `0 0 ${W} 150`, role: "img", "aria-label": "Times on a line" });
  tl.append(s("line", { x1: 20, x2: W - 20, y1: 80, y2: 80, stroke: "var(--line-2)" }),
    s("rect", { x: X(R.lo), y: 66, width: Math.max(2, X(R.hi) - X(R.lo)), height: 28, fill: "var(--band)", stroke: "rgba(255,194,26,.6)", class: "hd-grow" }));
  const mark = (v, label, color, y, shape = "line") => {
    if (shape === "dot") tl.append(s("circle", { cx: X(v), cy: 80, r: 7, fill: color, stroke: "var(--panel)", "stroke-width": 2 }));
    else tl.append(s("line", { x1: X(v), x2: X(v), y1: 60, y2: 100, stroke: color, "stroke-width": 2.5, "stroke-dasharray": shape === "dash" ? "4 3" : null }));
    tl.append(s("text", { x: X(v), y, "text-anchor": "middle", fill: color, "font-size": 12, "font-weight": 700, text: `${label} ${hhmm(v)}` }));
  };
  mark(R.sched, "Timetable", "var(--sched)", 132, "dash");
  mark(R.b1, "Today", "var(--today)", 40, "dash");
  mark(R.med, "Kalyon", "var(--amber)", 20, "dot");
  if (R.act !== null) mark(R.act, "Actual", "var(--green)", 118);
  const inside = R.act !== null && R.act >= R.lo && R.act <= R.hi;
  const floored = R.med > R.rawMed + 0.05;
  el.append(
    guide("In plain words", "One number is never certain. So Kalyon runs two more forests: a low model (an optimistic guess) and a high model (a cautious guess), next to the median. The gap between them, slightly widened, is the likely range. It was tuned so that about 8 in 10 real arrivals land inside it."),
    h("div", { class: "hd-mcards" }, card("q10", q.q10), card("q50", q.q50), card("q90", q.q90)),
    h("div", { class: "hd-calc" },
      h("p", {}, h("b", {}, "Earliest likely: "), h("span", { class: "num" }, `${hhmm(R.b1)} + ${q.q50.toFixed(1)} − ${c} × (${q.q50.toFixed(1)} − ${q.q10.toFixed(1)}) = ${hhmm(loRaw)}`)),
      h("p", {}, h("b", {}, "Kalyon ETA: "), h("span", { class: "num" }, `${hhmm(R.b1)} + ${q.q50.toFixed(1)} = ${hhmm(R.rawMed)}${floored ? `, raised to ${hhmm(R.med)} by a safety rule` : ""}`)),
      h("p", {}, h("b", {}, "Latest likely: "), h("span", { class: "num" }, `${hhmm(R.b1)} + ${q.q50.toFixed(1)} + ${c} × (${q.q90.toFixed(1)} − ${q.q50.toFixed(1)}) = ${hhmm(hiRaw)}`))),
    h("p", { class: "hd-cap" }, "On the clock"), tl,
    R.act !== null
      ? h("div", { class: `hd-verdict ${inside ? "ok" : "miss"}` },
        h("b", {}, inside ? "✓ The real arrival fell inside the range." : "✗ This time the real arrival fell outside the range."),
        h("span", {}, ` Actual ${hhmm(R.act)}. Kalyon was off by ${Math.round(Math.abs(R.med - R.act))} min; today's estimate by ${Math.round(Math.abs(R.b1 - R.act))} min.`),
        h("span", { class: "small" }, ` Across ${fmt(app.metrics.counts.test_rows)} test forecasts the range held ${(app.metrics.test.interval.coverage * 100).toFixed(1)}% of arrivals.`))
      : null,
    h("div", { class: "hd-callout" }, h("p", {}, h("b", {}, "Two safety rules. "), "A train cannot arrive faster than physics allows, so no ETA is earlier than the report time plus 80% of the scheduled running time minus the spare time. And a later station can never be forecast earlier than an earlier one. ",
      floored ? h("b", {}, "Here a safety rule moved the ETA.") : "Neither rule was needed here.")),
    maths(eq("<i>lo</i> = <i>ETA</i><sub>today</sub> + <i>q̂</i><sub>50</sub> − <i>c</i>(<i>q̂</i><sub>50</sub> − <i>q̂</i><sub>10</sub>),   <i>hi</i> = <i>ETA</i><sub>today</sub> + <i>q̂</i><sub>50</sub> + <i>c</i>(<i>q̂</i><sub>90</sub> − <i>q̂</i><sub>50</sub>)"),
      eq(`<i>c</i> = ${c}, chosen on the validation months so that coverage ≈ 80%:   coverage = (1/<i>n</i>) Σ 1[<i>lo</i><sub><i>i</i></sub> ≤ <i>y</i><sub><i>i</i></sub> ≤ <i>hi</i><sub><i>i</i></sub>]`)),
    say("Kalyon gives a window, not just a time, and that window is honest: about 80% of real arrivals fall inside it."));
}

// Step 6: the reasons (TreeSHAP waterfall)
function sReasons(el, R) {
  const F = app.M.features, nF = F.length, phi = R.phi;
  const base = phi[nF];
  const items = F.map((f, i) => ({ f, v: phi[i], x: R.x[i] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = items.slice(0, 9), rest = items.slice(9).reduce((a, b) => a + b.v, 0);
  const rows = [{ label: "Typical correction for any train", v: base, base: true }, ...top.map(it => ({ label: LBL(it.f), sub: fmtFeature(it.f, it.x), v: it.v })), { label: `The other ${items.length - 9} signals together`, v: rest }];
  const total = phi.reduce((a, b) => a + b, 0);
  let run = 0; const steps = rows.map(r => { const a = run; run += r.v; return { ...r, a, b: run }; });
  const lo = Math.min(0, ...steps.map(r => Math.min(r.a, r.b))), hi = Math.max(0, ...steps.map(r => Math.max(r.a, r.b)));
  const W = 760, rh = 30, L = 280, Rr = 90, H = (rows.length + 1) * rh + 18, X = v => L + ((v - lo) / Math.max(1e-6, hi - lo)) * (W - L - Rr);
  const svg = s("svg", { class: "hd-wf", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "How each signal moved the correction" });
  svg.append(s("line", { x1: X(0), x2: X(0), y1: 4, y2: H - 6, stroke: "var(--rule)" }));
  steps.forEach((r, i) => {
    const y = 8 + i * rh, x0 = X(Math.min(r.a, r.b)), w = Math.max(1.5, Math.abs(X(r.b) - X(r.a)));
    const col = r.base ? "var(--muted)" : r.v >= 0 ? "var(--stop)" : "var(--go)";
    svg.append(s("text", { x: 8, y: y + 18, fill: "var(--text)", "font-size": 13, "font-weight": 600, text: r.label }));
    if (r.sub) svg.append(s("text", { x: L - 10, y: y + 18, "text-anchor": "end", fill: "var(--faint)", "font-size": 11.5, text: r.sub }));
    svg.append(s("rect", { x: x0, y: y + 6, width: w, height: rh - 12, fill: col, class: "hd-bar", style: `animation-delay:${i * 110}ms;transform-origin:${r.v >= 0 ? x0 : x0 + w}px 0` }),
      s("text", { x: W - 6, y: y + 18, "text-anchor": "end", fill: col, "font-size": 12.5, "font-family": "JetBrains Mono", text: fm(r.v, 1) }));
    if (i < steps.length - 1) svg.append(s("line", { x1: X(r.b), x2: X(r.b), y1: y + rh - 6, y2: y + rh + 6, stroke: "var(--faint)", "stroke-dasharray": "2 2" }));
  });
  const yT = 8 + rows.length * rh;
  svg.append(s("text", { x: 8, y: yT + 18, fill: "var(--amber)", "font-size": 13.5, "font-weight": 800, text: "Total correction" }),
    s("rect", { x: X(Math.min(0, total)), y: yT + 6, width: Math.max(1.5, Math.abs(X(total) - X(0))), height: rh - 12, fill: "var(--amber)", class: "hd-bar", style: `animation-delay:${rows.length * 110}ms` }),
    s("text", { x: W - 6, y: yT + 18, "text-anchor": "end", fill: "var(--amber)", "font-size": 13, "font-weight": 700, "font-family": "JetBrains Mono", text: fm(total, 1) }));
  const diff = Math.abs(total - R.sums.q50);
  el.append(
    guide("In plain words", "A forecast you cannot explain is hard to trust. This chart splits the correction into a bill: the typical correction any train gets, then how many minutes each signal added (red) or removed (green) for this particular train. The method is SHAP, based on the Shapley value from game theory, which shares out credit fairly among players; Lloyd Shapley won the 2012 Nobel prize in economics for this idea."),
    svg,
    h("div", { class: `hd-verdict ${diff < 0.01 ? "ok" : "miss"}` },
      h("b", {}, diff < 0.01 ? "✓ The bill adds up exactly." : "Check"),
      h("span", { class: "num" }, ` typical ${fm(base, 2)} + signals ${fm(total - base, 2)} = ${fm(total, 2)}; the median model's own output: ${fm(R.sums.q50, 2)} (difference ${diff.toFixed(4)} min)`)),
    maths(eq("Shapley value of signal <i>i</i>:  φ<sub><i>i</i></sub> = Σ<sub><i>S</i> ⊆ <i>F</i>∖{<i>i</i>}</sub> |<i>S</i>|! (|<i>F</i>| − |<i>S</i>| − 1)! ⁄ |<i>F</i>|! · [ <i>v</i>(<i>S</i> ∪ {<i>i</i>}) − <i>v</i>(<i>S</i>) ]"),
      eq("Adds up exactly:  <i>r̂</i>(<i>x</i>) = φ<sub>0</sub> + Σ<sub><i>i</i>=1…19</sub> φ<sub><i>i</i></sub>"),
      h("p", { class: "small" }, "Computed with the exact TreeSHAP algorithm (Lundberg, Erion and Lee, 2018), implemented in js/engine.js and checked against the Python shap library by tests/parity.mjs.")),
    say("Every forecast comes with its reasons in minutes, and the reasons always add up to the forecast."));
}

// Step 7: where every figure comes from
const SRC = {
  live: ["Computed live in your browser", "From the trained trees (data/model.json), every time you look"],
  file: ["Pre-computed in Python", "kalyon/train.py on the test months, saved to data/metrics.json"],
  syn: ["Synthetic replay data", "kalyon/simulate.py, saved to data/replays.json"],
  real: ["Real observations", "RunningStatus.in and the NTES board, viewed 8–9 Nov 2026"],
};
const FIG = [
  ["Briefing", [["The 15002 delay chart and the 17 h 46 min rescheduling", "real"], ["The example forecast in the 3D opening scene", "live"], ["The three result numbers", "file"]]],
  ["Control room", [["Trains moving on the map and their delays", "syn"], ["Every forecast in the feed and the selected-train panel", "live"]]],
  ["Journey", [["Kalyon and today's estimates at every report", "live"], ["Actual arrivals, shown for checking", "syn"]]],
  ["Station board", [["Kalyon ETA, range and platform-ready time", "live"], ["Which trains are due", "syn"]]],
  ["What-if", [["Every forecast, re-computed as you move a slider", "live"]]],
  ["Model lab", [["Accuracy tables, error by horizon, range honesty, hypotheses H1–H4, top signals", "file"]]],
  ["Method and data", [["Real observations and the data-quality examples", "real"], ["The pipeline description and code", "file"]]],
  ["Under the hood", [["Everything on this page", "live"]]],
];
function sSources(el) {
  const detail = h("div", { class: "hd-srcdetail" });
  const pick = key => {
    $$(".hd-flow [data-k]", el).forEach(e => e.classList.toggle("dim", key && e.dataset.k !== key));
    clear(detail).append(key ? h("p", {}, h("b", {}, SRC[key][0]), `: ${SRC[key][1]}.`) : h("p", { class: "small" }, "Hover or tap a colour to highlight it."));
  };
  el.append(
    guide("In plain words", "Some numbers on this site are worked out live by the model in your browser; some were worked out once in Python and saved; some describe the synthetic replay; and a few are real observations. This map shows which is which, so nothing is a mystery."),
    h("div", { class: "hd-pipe" },
      h("div", {}, h("b", {}, "1. Python, on our computer"), h("span", {}, "simulate.py makes a year of synthetic runs (5,646 journeys). features.py builds the 19 signals. train.py trains the 4 models and grades them on unseen months.")),
      h("i", { "aria-hidden": "true" }, "→"),
      h("div", {}, h("b", {}, "2. Saved files"), h("span", {}, "model.json (all the trees), replays.json (the replay days), trains.json and network.json (timetables, track), metrics.json (test results).")),
      h("i", { "aria-hidden": "true" }, "→"),
      h("div", {}, h("b", {}, "3. Your browser"), h("span", {}, "engine.js loads the trees and runs them for every forecast you see. No server is needed, which is why the site works on GitHub Pages."))),
    h("div", { class: "hd-legend" }, ...Object.entries(SRC).map(([k, [l]]) => h("button", { class: `hd-k ${k}`, "data-k": k, onmouseenter: () => pick(k), onfocus: () => pick(k), onmouseleave: () => pick(null), onclick: () => pick(k) }, h("i", {}), l))),
    detail,
    h("div", { class: "hd-flow" }, ...FIG.map(([tab, items]) => h("div", { class: "hd-frow" }, h("b", {}, tab),
      h("div", {}, ...items.map(([what, k]) => h("span", { class: `hd-chip ${k}`, "data-k": k }, h("i", {}), what)))))),
    h("p", { class: "small" }, "The Python service (api/main.py, FastAPI) can serve the same forecasts to other apps; it is in the code but not hosted online. The website runs the identical trees itself."),
    say("Forecasts are calculated live by the model; scores were calculated once on unseen test months; the replay is synthetic; the problem statistics are real."));
  pick(null);
}

// Step 8: try it yourself
function sTry(el, R0) {
  const base = { delay: R0.dk, vis: R0.st.weather.visibility, rain: R0.st.weather.rain, festival: !!R0.st.weather.festival, unseen: false };
  const S = { ...base };
  let prev = null;
  const ctl = {};
  const slider = (key, label, min, max, step, f) => {
    const out = h("output", {});
    const inp = h("input", { type: "range", min, max, step, value: S[key], oninput: e => { S[key] = +e.target.value; out.textContent = f(S[key]); inp.style.setProperty("--p", `${((S[key] - min) / (max - min)) * 100}%`); run(); } });
    inp.style.setProperty("--p", `${((S[key] - min) / (max - min)) * 100}%`);
    out.textContent = f(S[key]);
    ctl[key] = { inp, out, f, min, max };
    return h("div", { class: "ctl" }, h("label", {}, label, out), inp);
  };
  const toggle = (key, label) => { const c = h("input", { type: "checkbox", class: "switch", checked: S[key] || null, onchange: e => { S[key] = e.target.checked; run(); } }); ctl[key] = { inp: c }; return h("label", { class: "toggle" }, label, c); };
  const nodes = {};
  const node = (key, title) => (nodes[key] = h("div", { class: "hd-pn" }, h("span", { class: "t" }, title), h("b", { class: "num" }), h("span", { class: "s small" })));
  const pipe = h("div", { class: "hd-pipeline" }, node("sig", "1 · Signals changed"), node("today", "2 · Today's estimate"), node("trees", "3 · Trees evaluated"), node("corr", "4 · Correction"), node("range", "5 · Likely range"), node("eta", "6 · Kalyon ETA"));
  const why = h("div", { class: "hd-why" });
  const setNum = (elB, from, to, f) => { if (from === null || REDUCED()) { elB.textContent = f(to); return; } tween(from, to, 450, v => { elB.textContent = f(v); }); };
  function run() {
    const R = compute(S);
    const F = app.M.features;
    const changed = F.filter((f, i) => { const a = R.x[i], b = R0.x[i]; return !(a === b || (Number.isNaN(a) && Number.isNaN(b))); });
    nodes.sig.querySelector("b").textContent = changed.length ? `${changed.length} of 19` : "none";
    nodes.sig.querySelector(".s").textContent = changed.length ? changed.map(LBL).join(", ") : "Same as the real report";
    setNum(nodes.today.querySelector("b"), prev && prev.b1, R.b1, hhmm);
    nodes.today.querySelector(".s").textContent = `${hhmm(R.sched)} + ${Math.round(R.dk)} min`;
    const nT = Object.values(app.M.models).reduce((a, m) => a + m.trees.length, 0);
    setNum(nodes.trees.querySelector("b"), 0, nT, v => fmt(v));
    nodes.trees.querySelector(".s").textContent = `in ${R.ms.toFixed(1)} ms, for every station ahead`;
    setNum(nodes.corr.querySelector("b"), prev && prev.sums.q50, R.sums.q50, v => fm(v, 1));
    nodes.corr.querySelector(".s").textContent = "sum of the median model's trees";
    nodes.range.querySelector("b").textContent = `${hhmm(R.lo)}–${hhmm(R.hi)}`;
    nodes.range.querySelector(".s").textContent = `${Math.round(R.hi - R.lo)} min wide`;
    setNum(nodes.eta.querySelector("b"), prev && prev.med, R.med, hhmm);
    nodes.eta.querySelector(".s").textContent = `at ${R.to.name} (today's estimate ${hhmm(R.b1)})`;
    pipe.classList.remove("go"); void pipe.offsetWidth; pipe.classList.add("go");
    const nF = F.length, items = F.map((f, i) => ({ f, v: R.phi[i], x: R.x[i] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
    clear(why).append(h("p", { class: "hd-cap" }, "Top reasons right now"), ...items.map(it => h("div", { class: "hd-wr" }, h("span", {}, LBL(it.f), h("small", {}, ` ${fmtFeature(it.f, it.x)}`)), h("b", { class: `num ${it.v >= 0 ? "up" : "down"}` }, fm(it.v, 1)))));
    prev = R;
  }
  el.append(
    guide("In plain words", "Move any control. The whole chain runs again instantly: the signals change, all the trees are evaluated again, and a new correction, range and ETA come out. Watch the pulse travel down the pipeline and the engine counters at the top of the page tick up: that is the AI working."),
    h("div", { class: "hd-try" },
      h("div", { class: "hd-tryctl" },
        slider("delay", "Current delay", 0, 600, 1, v => `${Math.round(v)} min`),
        slider("vis", "Visibility", 0.05, 10, 0.05, v => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} km${v < 1 ? " (fog)" : ""}`),
        slider("rain", "Rainfall", 0, 80, 1, v => `${Math.round(v)} mm`),
        toggle("festival", "Festival travel period"),
        toggle("unseen", "Pretend it is a new train with no history"),
        h("button", { class: "btn ghost small", onclick: () => { Object.assign(S, base); for (const [k, c] of Object.entries(ctl)) { if (c.out) { c.inp.value = S[k]; c.out.textContent = c.f(S[k]); c.inp.style.setProperty("--p", `${((S[k] - c.min) / (c.max - c.min)) * 100}%`); } else c.inp.checked = S[k]; } run(); } }, "Reset to the real report")),
      h("div", {}, pipe, why)),
    say("Change the situation and the AI re-thinks the forecast in a few milliseconds, with new reasons."));
  run();
}

// ---------- Opening animation: code, maths and statistics ----------
const CODE = [
  "import lightgbm as lgb", "from kalyon.features import FEATURES, build_rows", "",
  "BASE_PARAMS = dict(learning_rate=0.05, num_leaves=31,", "                   min_data_in_leaf=60, feature_fraction=0.9)", "",
  "y = df['actual'] - df['eta_today']        # the residual", "X = df[FEATURES].astype(float)            # 19 signals", "",
  "m1  = fit({'objective': 'huber', 'alpha': 20.0}, X, y)", "q10 = fit({'objective': 'quantile', 'alpha': 0.1}, X, y)",
  "q50 = fit({'objective': 'quantile', 'alpha': 0.5}, X, y)", "q90 = fit({'objective': 'quantile', 'alpha': 0.9}, X, y)", "",
  "# calibrate the 10–90 band to 80% coverage", "c = scale_for_coverage(val, target=0.80)    # → 1.05", "",
  "// js/engine.js — the same trees, in your browser", "export function predict(model, x) {", "  let s = 0;",
  "  for (const t of model.trees) s += predictTree(t, x);", "  return s;", "}", "",
  "const med = b1 + predict(M.models.q50, x);", "const lo  = med - c * (q50 - q10);", "const hi  = med + c * (q90 - q50);",
  "const phi = shap(M.models.q50, x, 19);      // the reasons",
];
const FORMULAS = [
  ["<i>ETA</i> = <i>T</i><sub>sched</sub> + <i>d</i><sub>k</sub> + Σ<sub><i>t</i></sub> <i>f</i><sub><i>t</i></sub>(<i>x</i>)", "Today's estimate plus the sum of the trees"],
  ["<i>F</i><sub><i>m</i></sub>(<i>x</i>) = <i>F</i><sub><i>m</i>−1</sub>(<i>x</i>) + η <i>f</i><sub><i>m</i></sub>(<i>x</i>)", "Gradient boosting: each tree fixes the last"],
  ["<i>L</i><sub>τ</sub> = max(τ<i>u</i>, (τ−1)<i>u</i>),  τ ∈ {0.1, 0.5, 0.9}", "Quantile loss: low, median and high models"],
  ["φ<sub><i>i</i></sub> = Σ<sub><i>S</i></sub> |<i>S</i>|!(|<i>F</i>|−|<i>S</i>|−1)!⁄|<i>F</i>|! [<i>v</i>(<i>S</i>∪{<i>i</i>}) − <i>v</i>(<i>S</i>)]", "Shapley values: the reasons"],
  ["<i>MAE</i> = (1/<i>n</i>) Σ |<i>ŷ</i> − <i>y</i>|", "Average error, the main score"],
  ["coverage = (1/<i>n</i>) Σ 1[<i>lo</i> ≤ <i>y</i> ≤ <i>hi</i>] ≈ 0.80", "An honest likely range"],
];
function buildOverlay() {
  const M = app.M;
  const nTrees = Object.values(M.models).reduce((a, m) => a + m.trees.length, 0);
  const nNodes = Object.values(M.models).reduce((a, m) => a + m.trees.reduce((b, t) => b + t.f.length, 0), 0);
  const stats = [["AI models", 4], ["Decision trees", nTrees], ["Decision nodes", nNodes], ["Signals per forecast", 19], ["Training examples", app.metrics.counts.train_rows], ["Test forecasts", app.metrics.counts.test_rows]];
  overlay = h("div", { class: "hd-intro", "aria-hidden": "true" },
    h("div", { class: "hd-i-code" }, h("pre", {})),
    h("div", { class: "hd-i-mid" },
      h("div", { class: "hd-i-title" }, h("span", { class: "hi" }, "इंजन कक्ष"), h("b", {}, "Opening the engine room"), h("small", {}, "Loading the real models into this tab")),
      s("svg", { class: "hd-i-tree", viewBox: "0 0 420 170" }),
      h("div", { class: "hd-i-forms" })),
    h("div", { class: "hd-i-stats" }, ...stats.map(([l, v]) => h("div", {}, h("span", {}, l), h("b", { class: "num", "data-v": v }, "0")))),
    h("div", { class: "hd-i-bar" }, h("span", { class: "hd-i-stage" }, ""), h("div", {}, h("i", {})), h("button", { class: "hd-i-skip", onclick: () => endIntro() }, "Skip")));
  root.append(overlay);
  // a real tree from the median model, drawn as it loads
  const tree = M.models.q50.trees[0], L = layoutTree(tree), svg = $(".hd-i-tree", overlay);
  const sx = x => 10 + ((x + 0.5) / L.leaves) * 400, sy = d => 10 + d * (150 / Math.max(L.depth, 1));
  let j = 0;
  for (const k of Object.keys(L.pos)) {
    const n = +k, p = L.pos[n];
    if (tree.f[n] !== -1) for (const c of [tree.l[n], tree.r[n]]) {
      const q = L.pos[c];
      svg.append(s("line", { x1: sx(p.x), y1: sy(p.d), x2: sx(q.x), y2: sy(q.d), pathLength: 1, style: `animation-delay:${400 + j++ * 28}ms` }));
    }
    svg.append(s("circle", { cx: sx(p.x), cy: sy(p.d), r: tree.f[n] === -1 ? 2.2 : 3, style: `animation-delay:${400 + j * 28}ms` }));
  }
}
let introTimers = [], introResolve = null;
function playIntro(force = false) {
  if ((introPlayed && !force) || REDUCED() || !app) return Promise.resolve();
  introPlayed = true;
  if (!overlay) buildOverlay();
  endIntroTimers();
  const pre = $(".hd-i-code pre", overlay), forms = $(".hd-i-forms", overlay), stage = $(".hd-i-stage", overlay), bar = $(".hd-i-bar div i", overlay);
  clear(pre); clear(forms); bar.style.width = "0%";
  $$(".hd-i-tree line, .hd-i-tree circle", overlay).forEach(e => { e.style.animation = "none"; void e.getBoundingClientRect(); e.style.animation = ""; });
  overlay.classList.add("on");
  const T = (ms, fn) => introTimers.push(setTimeout(fn, ms));
  CODE.forEach((ln, i) => T(i * 95, () => { pre.append(h("span", { class: ln.startsWith("#") || ln.startsWith("//") ? "c" : "" }, ln || " "), "\n"); pre.scrollTop = pre.scrollHeight; }));
  FORMULAS.forEach(([f, cap], i) => T(250 + i * 560, () => forms.append(h("div", { class: "hd-i-f" }, h("div", { html: f }), h("small", {}, cap)))));
  $$(".hd-i-stats b", overlay).forEach((b, i) => T(200 + i * 260, () => tween(0, +b.dataset.v, 1100, v => { b.textContent = fmt(v); })));
  const stages = ["Loading 4 models", "Reading every decision tree", "Building the 19-signal features", "Preparing the TreeSHAP explainer", "Calibrating the likely range (× 1.05)", "Warm-up forecast"];
  stages.forEach((st, i) => T(i * 640, () => { stage.textContent = st; bar.style.width = `${((i + 1) / stages.length) * 100}%`; }));
  T(stages.length * 640, () => {
    const t0 = performance.now(); cur = compute(); const ms = performance.now() - t0;
    stage.textContent = `Engine ready · warm-up forecast computed in ${ms.toFixed(1)} ms`;
  });
  T(stages.length * 640 + 900, () => endIntro());
  return new Promise(r => { introResolve = r; });
}
function endIntroTimers() { introTimers.forEach(clearTimeout); introTimers = []; }
function endIntro() {
  endIntroTimers();
  if (!overlay || !overlay.classList.contains("on")) return;
  const g = window.gsap;
  const done = () => { overlay.classList.remove("on", "out"); introResolve && introResolve(); introResolve = null; };
  overlay.classList.add("out");
  if (g) g.delayedCall(0.55, done); else done();
  go(stepIdx);
}

// ---------- Lifecycle ----------
function enter() {
  active = true;
  const bar = $(".hud-top");
  root.style.setProperty("--hd-top", `${bar ? bar.offsetHeight : 0}px`);
  if (!cur) cur = compute();
  if (!introPlayed && !REDUCED()) { go(stepIdx, false); playIntro(); }
  else go(stepIdx);
}

export function mount(a) {
  app = a;
  build();
  app.on("view", v => {
    if (v === "hood") {
      if (!$("#loader").classList.contains("done")) return;
      enter();
    } else if (active) {
      active = false;
      stopPlay && stopPlay();
      endIntroTimers();
      if (overlay) overlay.classList.remove("on", "out");
    }
  });
}
