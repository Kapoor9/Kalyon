// Kalyon app shell: boot sequence, data loading, replay clock, shared state and routing.
import { forecastAll, replayState } from "./engine.js";
import { h, $, $$ } from "./ui.js";
import * as story from "./story.js";
import * as control from "./control.js";
import * as journey from "./journey.js";
import * as board from "./board.js";
import * as whatif from "./whatif.js";
import * as lab from "./lab.js";
import * as method from "./method.js";
import { startTour, firstVisit } from "./tour.js";

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
app.forecastFor = (rep, run, k, withShap = false) => {
  const key = `${rep.id}:${run.run}:${k}:${withShap}`;
  if (app.cache.has(key)) return app.cache.get(key);
  const train = app.trains[run.train];
  const st = replayState(rep, run, k, app.startDate);
  const w0 = rep.t0_day * 1440 + 240;
  const out = forecastAll(app.M, train, k, st, i => w0 + run.ev[i][1], w0 + run.ev[k][2], withShap);
  app.cache.set(key, out);
  return out;
};
app.forecast = (run, k, withShap = false) => app.forecastFor(app.replay, run, k, withShap);
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
const FLOW = {
  control: ["Step 1 of 6", "नियंत्रण कक्ष", "journey", "Follow one train, report by report"],
  journey: ["Step 2 of 6", "यात्रा", "board", "See what a station display would show"],
  board: ["Step 3 of 6", "स्टेशन बोर्ड", "whatif", "Change the situation and watch the models react"],
  whatif: ["Step 4 of 6", "अगर ऐसा हो तो", "lab", "Check the evidence"],
  lab: ["Step 5 of 6", "मॉडल लैब", "method", "See how it is built, and what is real"],
  method: ["Step 6 of 6", "पद्धति", "overview", "Back to the briefing"],
};
const NAMES = { overview: "Briefing", control: "Control room", journey: "Journey", board: "Station board", whatif: "What-if", lab: "Model lab", method: "Method and data" };

function route(name) {
  if (!VIEWS.includes(name)) name = "overview";
  const prev = app.view;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `v-${name}`));
  $$(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  document.body.classList.toggle("console-mode", name !== "overview");
  app.view = name;
  if (prev !== name) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  app.emit("view", name);
  const g = window.gsap;
  if (g && name !== "overview" && prev !== name && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    g.fromTo(`#v-${name} .view-head > *, #v-${name} .help-line`, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity" });
    g.fromTo(`#v-${name} .panel, #v-${name} .board-wrap, #v-${name} .pipe, #v-${name} .preset`, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.04, ease: "power3.out", delay: 0.1, clearProps: "transform,opacity" });
  }
  if (name === "control" && firstVisit()) setTimeout(() => app.view === "control" && startTour("control"), 900);
}
app.route = route;

function decorate() {
  for (const [view, [step, hi, next, why]] of Object.entries(FLOW)) {
    const root = $(`#v-${view}`);
    const head = root.querySelector(".view-head > div");
    if (head && !head.querySelector(".kicker")) head.prepend(h("span", { class: "kicker" }, step));
    const h2 = root.querySelector(".view-head h2");
    if (h2 && !h2.querySelector(".hi")) h2.append(h("span", { class: "hi" }, hi));
    root.append(h("div", { class: "next-step" },
      h("div", {}, h("p", { class: "small" }, "Next"), h("b", {}, `${NAMES[next]}: ${why}`)),
      h("button", { class: "btn primary", onclick: () => route(next) }, `Go to ${NAMES[next]} `, h("span", { class: "arr" }, "→"))));
  }
}

// ---------- Boot ----------
const LOG = [
  ["Kalyon ops console", ""],
  ["Loading corridor network", "17 stations"],
  ["Loading synthetic timetable", "18 services"],
  ["Loading LightGBM ensemble", "4 models"],
  ["Calibrating likely range", "80% target"],
  ["TreeSHAP explainer", "ready"],
];
async function bootLog(done) {
  const log = $("#boot-log"), bar = $("#boot-bar");
  let skip = false;
  const doSkip = () => { skip = true; };
  $("#boot-skip").addEventListener("click", doSkip);
  window.addEventListener("keydown", doSkip, { once: true });
  const wait = ms => new Promise(r => setTimeout(r, skip ? 0 : ms));
  for (let i = 0; i < LOG.length; i++) {
    const [a, b] = LOG[i];
    log.innerHTML += i === 0 ? `<b>${a.toUpperCase()}</b>\n` : `&gt; ${a.padEnd(30, ".")} `;
    await wait(i === 0 ? 220 : 160);
    if (i > 0) { await done[i - 1]; log.innerHTML += `<b>${b}</b>\n`; }
    bar.style.width = `${((i + 1) / LOG.length) * 100}%`;
  }
  await wait(280);
}

async function boot() {
  let resolveData;
  const dataReady = new Promise(r => { resolveData = r; });
  const steps = [dataReady, dataReady, dataReady, dataReady, dataReady];
  const logDone = bootLog(steps);
  try {
    await load();
    resolveData();
  } catch (err) {
    $("#boot-log").innerHTML += `\n<span style="color:var(--red)">Kalyon could not load its data (${err.message}). Open it through a web server, for example the GitHub Pages link, or run: python -m http.server (inside the docs folder).</span>`;
    return;
  }
  story.mount(app);
  control.mount(app); journey.mount(app); board.mount(app); whatif.mount(app); lab.mount(app); method.mount(app);
  decorate();
  $$(".tab").forEach(b => b.addEventListener("click", () => route(b.dataset.view)));
  $("#help-btn").addEventListener("click", () => startTour(app.view));
  window.addEventListener("hashchange", () => route(location.hash.slice(1)));
  route(location.hash.slice(1) || "overview");
  app.emit("replay", app.replay);
  app.emit("tick", { t: app.t, jumped: true });
  requestAnimationFrame(loop);
  await logDone;
  $("#loader").classList.add("done");
  story.animate();
  if (app.view === "overview") story.intro();
  else app.emit("view", app.view);
}
boot();
export default app;
