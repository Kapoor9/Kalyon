// Kalyon app shell: data loading, replay clock, shared state, routing and the overview.
import { forecastAll, replayState } from "./engine.js";
import { h, s, $, $$, clear, linear, countUp, drawIn, tip, hhmm, dayLabel } from "./ui.js";
import * as control from "./control.js";
import * as journey from "./journey.js";
import * as board from "./board.js";
import * as whatif from "./whatif.js";
import * as lab from "./lab.js";
import * as method from "./method.js";

const app = {
  listeners: {},
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
  emit(ev, p) { (this.listeners[ev] || []).forEach(fn => fn(p)); },
  t: 180, playing: false, speed: 5, // replay minutes per real second
  cache: new Map(),
};
window.kalyon = app; // handy for exploring in the browser console

async function load() {
  const get = f => fetch(`data/${f}`).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
  const [net, tr, M, metrics, rep] = await Promise.all(["network.json", "trains.json", "model.json", "metrics.json", "replays.json"].map(get));
  app.net = net;
  app.stations = Object.fromEntries(net.stations.map(st => [st.code, st]));
  app.trains = Object.fromEntries(tr.trains.map(t => [t.number, t]));
  app.M = M;
  app.metrics = metrics;
  app.replays = rep.replays;
  app.startDate = rep.start_date;
  app.replay = app.replays[0];
}

// ---------- Replay helpers ----------
app.w0 = () => app.replay.t0_day * 1440 + 240; // replay minute 0 = 04:00 on the replay day
app.abs = t => app.w0() + t;
app.arr = (run, i) => (run.ev[i][1] === null ? null : run.ev[i][1] + run.ev[i][3]);
app.dep = (run, i) => (run.ev[i][2] === null ? null : run.ev[i][2] + run.ev[i][4]);
app.lastDeparted = (run, t) => {
  let k = -1;
  for (let i = 0; i < run.ev.length - 1; i++) if (app.dep(run, i) <= t) k = i;
  return k;
};
app.status = (run, t) => {
  const n = run.ev.length;
  const k = app.lastDeparted(run, t);
  const train = app.trains[run.train];
  if (k === -1) return { state: "waiting", k, delay: run.ev[0][4], at: 0, train };
  const endT = app.arr(run, n - 1);
  if (t >= endT) return { state: "done", k: n - 1, delay: run.ev[n - 1][3], at: n - 1, train, since: t - endT };
  const nextArr = app.arr(run, k + 1);
  if (t < nextArr) {
    const p = (t - app.dep(run, k)) / Math.max(nextArr - app.dep(run, k), 1);
    return { state: "running", k, delay: run.ev[k][4], from: k, to: k + 1, p, train };
  }
  return { state: "dwell", k, delay: run.ev[k + 1][3], at: k + 1, train };
};
app.forecast = (run, k, withShap = false) => {
  const key = `${app.replay.id}:${run.run}:${k}:${withShap}`;
  if (app.cache.has(key)) return app.cache.get(key);
  const train = app.trains[run.train];
  const st = replayState(app.replay, run, k, app.startDate);
  const w0 = app.w0();
  const out = forecastAll(app.M, train, k, st, i => w0 + run.ev[i][1], w0 + run.ev[k][2], withShap);
  app.cache.set(key, out);
  return out;
};
app.setReplay = id => {
  app.replay = app.replays.find(r => r.id === id) || app.replays[0];
  app.t = 180;
  app.selectedRun = null;
  app.emit("replay", app.replay);
  app.emit("tick", { t: app.t, jumped: true });
};
app.seek = t => { app.t = Math.max(0, Math.min(1440, t)); app.emit("tick", { t: app.t, jumped: true }); };
app.selectRun = (runId, go = false) => {
  app.selectedRun = runId;
  app.emit("select", runId);
  if (go) route("journey");
};

// The clock: advances replay time and announces every running report (a departure) it passes.
let last = null;
function loop(now) {
  if (last !== null && app.playing) {
    const dt = Math.min((now - last) / 1000, 0.25);
    const t0 = app.t;
    app.t = Math.min(1440, app.t + dt * app.speed);
    for (const run of app.replay.runs) {
      for (let i = 0; i < run.ev.length - 1; i++) {
        const d = app.dep(run, i);
        if (d > t0 && d <= app.t) app.emit("report", { run, k: i, t: d });
      }
    }
    if (app.t >= 1440) { app.playing = false; app.emit("play", false); }
    app.emit("tick", { t: app.t });
  }
  last = now;
  requestAnimationFrame(loop);
}
app.play = on => { app.playing = on; if (on && app.t >= 1440) app.t = 0; app.emit("play", on); };

// ---------- Routing ----------
const VIEWS = ["overview", "control", "journey", "board", "whatif", "lab", "method"];
function route(name) {
  if (!VIEWS.includes(name)) name = "overview";
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `v-${name}`));
  $$(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  app.view = name;
  app.emit("view", name);
  window.scrollTo({ top: 0 });
}
app.route = route;

// ---------- Overview ----------
function overview() {
  const root = $("#v-overview");
  const m = app.metrics;
  const b1 = m.test.b1.mae, m1 = m.test.m1.mae;
  const cut = Math.round((1 - m1 / b1) * 100);
  const hrs = m.by_hours.find(r => r.bin === "2-4 h");
  root.append(
    h("section", { class: "hero" },
      h("div", {},
        h("div", { class: "hi-line" }, "काल + नियोजन"),
        h("h1", {}, "Late trains don’t stay equally late."),
        h("p", { class: "lede" },
          "Today’s expected arrival time is the timetable plus the train’s current delay, as if the delay will never change. ",
          "Kalyon re-forecasts every station ahead each time a train reports, gives a likely range instead of a single time, and says why."),
        h("div", { class: "cta" },
          h("button", { class: "btn primary", onclick: () => { route("control"); app.play(true); } }, "Start the control-room replay"),
          h("button", { class: "btn", onclick: () => route("whatif") }, "Try a what-if scenario"))),
      h("figure", { class: "panel hero-chart", style: "margin:0" },
        h("div", { class: "panel-title" },
          h("h3", {}, "Train 15002 leaving Dehradun, 2026"),
          h("span", { class: "small" }, "Average delay at each station")),
        h("div", { id: "hero-svg" }),
        h("figcaption", { class: "small", style: "margin-top:8px" },
          "Observed data: RunningStatus.in train history, 32 runs in 2026, viewed 9 Nov 2026. Shaded gap = how wrong a constant-delay ETA issued at Dehradun would be on average."))),
    h("section", { class: "result-row", "aria-label": "Results on unseen test days" },
      h("div", { class: "result" }, h("div", { class: "big" }, h("span", { id: "r-cut" }, "0"), "%"),
        h("p", {}, `smaller average ETA error than the constant-delay estimate: ${m1.toFixed(1)} min against ${b1.toFixed(1)} min on test days the models never saw.`)),
      h("div", { class: "result" }, h("div", { class: "big" }, h("span", { id: "r-cov" }, "0"), "%"),
        h("p", {}, "of actual arrivals fell inside Kalyon’s likely range, which is designed to hold 80% of them. An honest range is one you can plan around.")),
      h("div", { class: "result" }, h("div", { class: "big" }, h("span", { id: "r-hrs" }, "0"), " min"),
        h("p", {}, `average error when the station is 2–4 hours away, against ${hrs.b1.toFixed(1)} min today. The further ahead, the bigger the gain.`))),
    h("p", { class: "small", style: "margin:-30px 0 40px" },
      "Results are from calibrated synthetic data for the Dehradun corridor (test period Sep–Oct 2026). They prove the method works end to end; real-world accuracy needs real running data."),
    h("h2", {}, "What happens when a train reports"),
    h("div", { class: "steps" },
      step("A train departs a station", "The running report gives its current delay, for example 47 minutes late leaving Haridwar."),
      step("Kalyon reads the situation", "19 signals: the delay trend, distance and recovery time left, single-line stretches, congestion, fog, rain, festival rush, this train’s history."),
      step("Python-trained models forecast", "Four LightGBM models learn how wrong the constant-delay estimate will be at each station ahead, and how uncertain."),
      step("Everyone gets ETA, range and reason", "Passengers see the likely time, platform staff the earliest, crew and cleaning the latest, and everyone sees the top three reasons.")),
    h("section", { class: "who" },
      h("div", {},
        h("h2", {}, "Team"),
        h("p", { class: "small", style: "margin-top:6px" }, "Indian Institute of Management Sirmaur. Smart India Hackathon problem: dynamic forecast of expected time of arrival for coaching trains."),
        h("ul", {}, ...[
          ["Aakarsh Kapoor", "BMS25001"], ["Bonisha Makwana", "BMS25032"], ["Anittya Rahul Lele", "BMS25015"],
          ["Ashish Ranjan", "BMS25024"], ["Hritankar Das", "BMS25058"], ["Jaie Surya K", "BMS25060"],
          ["Gottemukkula Praneeth", "BMS25048"], ["Adya Jain", "BMS25009"]].map(([n, r]) => h("li", {}, n, h("span", {}, r))))),
      h("div", { class: "panel" },
        h("h3", {}, "Kalyon"),
        h("p", { class: "hi", style: "font-size:1.3rem;color:var(--board);margin:4px 0" }, "काल + नियोजन"),
        h("p", { class: "small" }, "Time + planning. Also: Knowledge-Augmented Logistics Yield Optimization Network."),
        h("p", { class: "small", style: "margin-top:12px" }, "For the approval of Dr. Pradipta Patra, Associate Professor, Decision Sciences. Course faculty: Dr. Vibhu Gautam, Professor of Practice, Computer Science."))));
  heroChart();
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    countUp($("#r-cut"), cut);
    countUp($("#r-cov"), m.test.interval.coverage * 100);
    countUp($("#r-hrs"), hrs.m1, v => v.toFixed(1));
    io.disconnect();
  }), { threshold: 0.4 });
  io.observe($(".result-row"));
}

function step(title, body) { return h("div", { class: "step" }, h("h3", {}, title), h("p", {}, body)); }

function heroChart() {
  const codes = ["DDN", "HW", "LRJ", "NBD", "MB", "RMU"];
  const km = [0, 52, 79, 123, 226, 253];
  const obs = [52, 73, 83, 91, 73, 82];
  const W = 640, H = 346, L = 46, R = 20, T = 36, B = 70;
  const x = linear(0, 253, L, W - R), y = linear(30, 100, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Average delay of train 15002 rises from 52 to 91 minutes and falls back to 73; a constant-delay estimate stays at 52." });
  [40, 60, 80, 100].forEach(v => svg.append(
    s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }),
    s("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: `${v}` })));
  svg.append(s("text", { x: L - 8, y: 12, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: "min late" }));
  const pts = km.map((k, i) => [x(k), y(obs[i])]);
  const gap = s("path", { d: `M${pts.map(p => p.join(",")).join("L")}L${x(253)},${y(52)}L${x(0)},${y(52)}Z`, fill: "rgba(239,90,68,0.16)", opacity: 0 });
  const flat = s("path", { d: `M${x(0)},${y(52)}L${x(253)},${y(52)}`, stroke: "var(--today)", "stroke-width": 2.5, "stroke-dasharray": "7 6", fill: "none" });
  const line = s("path", { d: `M${pts.map(p => p.join(",")).join("L")}`, stroke: "var(--kalyon)", "stroke-width": 3.5, fill: "none", "stroke-linejoin": "round" });
  svg.append(gap, flat, line);
  codes.forEach((c, i) => {
    const st = app.stations[c];
    const g = s("g", { class: "pt", style: `opacity:0;transition:opacity .4s ${300 + i * 180}ms` });
    g.append(
      s("circle", { cx: pts[i][0], cy: pts[i][1], r: 5.5, fill: "var(--panel)", stroke: "var(--kalyon)", "stroke-width": 2.5 }),
      s("text", { x: pts[i][0], y: pts[i][1] - 12, "text-anchor": "middle", fill: "var(--chalk)", "font-size": 13, "font-weight": 800, text: `${obs[i]}` }),
      s("text", { x: pts[i][0], y: H - B + 22, "text-anchor": "middle", fill: "var(--chalk)", "font-size": 12, "font-weight": 700, text: st.name }),
      s("text", { x: pts[i][0], y: H - B + 38, "text-anchor": "middle", fill: "var(--faint)", "font-size": 11, "font-family": "Mukta", text: st.name_hi }));
    svg.append(g);
  });
  const note = s("g", { style: "opacity:0;transition:opacity .6s 1.6s" },
    s("line", { x1: x(123), x2: x(123), y1: y(52), y2: y(91) + 18, stroke: "var(--stop)", "stroke-width": 1.5 }),
    s("text", { x: x(123) + 8, y: y(70), fill: "var(--stop)", "font-size": 13, "font-weight": 800, text: "39 min off" }),
    s("text", { x: x(0) + 4, y: y(52) + 18, fill: "var(--today)", "font-size": 12, "font-weight": 600, text: "Constant-delay ETA: stays 52 min late" }));
  svg.append(note);
  $("#hero-svg").append(svg);
  requestAnimationFrame(() => {
    drawIn(line, 1500, 200);
    $$(".pt", svg).forEach(g => { g.style.opacity = 1; });
    gap.style.transition = "opacity .8s 1.3s"; gap.setAttribute("opacity", 1);
    note.style.opacity = 1;
  });
  svg.addEventListener("mousemove", e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[best][0] - px)) best = i; });
    const err = obs[best] - 52;
    tip(`<b>${app.stations[codes[best]].name}</b><br>Average delay ${obs[best]} min<br>Constant-delay ETA off by ${err} min`, e);
  });
  svg.addEventListener("mouseleave", () => tip(null));
}

// ---------- Boot ----------
async function boot() {
  try {
    await load();
  } catch (err) {
    $("#loader").innerHTML = `<p style="max-width:44ch;text-align:center">Kalyon could not load its data (${err.message}). Open it through a web server, for example the GitHub Pages link, or run <code>python -m http.server</code> inside the docs folder.</p>`;
    return;
  }
  overview();
  control.mount(app); journey.mount(app); board.mount(app); whatif.mount(app); lab.mount(app); method.mount(app);
  $$(".tab").forEach(b => b.addEventListener("click", () => route(b.dataset.view)));
  window.addEventListener("hashchange", () => route(location.hash.slice(1)));
  route(location.hash.slice(1) || "overview");
  app.emit("replay", app.replay);
  app.emit("tick", { t: app.t, jumped: true });
  requestAnimationFrame(loop);
  setTimeout(() => $("#loader").classList.add("done"), 350);
}
boot();
export default app;
