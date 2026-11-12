// Kalyon app shell: boot sequence, data loading, replay clock, shared state and routing.
import { forecastAll, replayState } from "./engine.js?v=202611120808";
import { h, $, $$, VER } from "./ui.js?v=202611120808";
import * as home from "./home.js?v=202611120808";
import * as story from "./story.js?v=202611120808";
import * as team from "./team.js?v=202611120808";
import * as hood from "./hood.js?v=202611120808";
import * as optlab from "./optlab.js?v=202611120808";
import * as passenger from "./passenger.js?v=202611120808";
import * as control from "./control.js?v=202611120808";
import * as journey from "./journey.js?v=202611120808";
import * as board from "./board.js?v=202611120808";
import * as whatif from "./whatif.js?v=202611120808";
import * as lab from "./lab.js?v=202611120808";
import * as method from "./method.js?v=202611120808";
import { startTour, firstVisit } from "./tour.js?v=202611120808";

const app = {
  listeners: {},
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
  emit(ev, p) { (this.listeners[ev] || []).forEach(fn => fn(p)); },
  t: 180, playing: false, speed: 5, // replay minutes per real second
  cache: new Map(),
};
window.kalyon = app; // handy for exploring in the browser console

async function load() {
  const get = f => fetch(`data/${f}?v=${VER}`).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
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
const VIEWS = ["home", "overview", "team", "passenger", "control", "journey", "board", "whatif", "optim", "hood", "lab", "method"];
// Two pages that share one tab, switched with a small sub-navigation.
const GROUPS = { journey: ["journey", "board"], board: ["journey", "board"], lab: ["lab", "method"], method: ["lab", "method"] };
const TAB_OF = { board: "journey", method: "lab" };
const FLOW = {
  control: ["Step 1 of 6", "नियंत्रण कक्ष", "journey", "Follow one train, report by report"],
  journey: ["Step 2 of 6", "यात्रा", "board", "See what a station display would show"],
  board: ["Step 2 of 6", "स्टेशन बोर्ड", "whatif", "Change the situation and watch the models react"],
  whatif: ["Step 3 of 6", "अगर ऐसा हो तो", "optim", "Let Kalyon decide what controllers should do"],
  optim: ["Step 4 of 6", "अनुकूलन", "hood", "Watch one forecast being made, live"],
  hood: ["Step 5 of 6", "इंजन कक्ष", "lab", "Check the evidence"],
  lab: ["Step 6 of 6", "मॉडल लैब", "method", "See how it is built, and what is real"],
  method: ["Step 6 of 6", "पद्धति", "overview", "Back to the briefing"],
};
const NAMES = { home: "Kalyon", overview: "Briefing", team: "Meet the team", passenger: "Passenger", control: "Control room", journey: "Journey", board: "Station board", whatif: "What-if", optim: "Optimisation Lab", lab: "Model lab", hood: "Under the hood", method: "Method and data" };

function route(name) {
  if (!VIEWS.includes(name)) name = "home";
  const prev = app.view;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `v-${name}`));
  $$(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === (TAB_OF[name] || name))));
  $$(".subnav button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === name)));
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  document.body.classList.toggle("console-mode", !["home", "overview", "team", "passenger"].includes(name));
  app.view = name;
  if (prev !== name) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  app.emit("view", name);
  const g = window.gsap;
  if (g && !["home", "overview", "team", "passenger"].includes(name) && prev !== name && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    g.fromTo(`#v-${name} .view-head > *, #v-${name} .help-line`, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity" });
    g.fromTo(`#v-${name} .panel, #v-${name} .board-wrap, #v-${name} .pipe, #v-${name} .preset`, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.04, ease: "power3.out", delay: 0.1, clearProps: "transform,opacity" });
  }
  if (name === "control" && firstVisit()) setTimeout(() => app.view === "control" && startTour("control"), 900);
}
app.route = route;

function decorate() {
  const SUB = { journey: "Journey", board: "Station board", lab: "Model lab", method: "Method and data" };
  for (const view of Object.keys(SUB)) {
    const root = $(`#v-${view}`);
    root.prepend(h("div", { class: "seg subnav", role: "group", "aria-label": "Pages in this tab" },
      ...GROUPS[view].map(v => h("button", { "data-view": v, "aria-pressed": String(v === view), onclick: () => route(v) }, SUB[v]))));
  }
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
// There is no separate loading screen: the home's 3D opening (light gathering into the logo) plays
// while the data loads behind it. The old boot panel is only shown if the data cannot be loaded.
async function boot() {
  // A fresh visit always opens on the home spiral, whatever hash the address bar remembered.
  // A deep link can still open a section directly with ?view=name (used by the tests).
  const deep = new URLSearchParams(location.search).get("view");
  const target = deep && VIEWS.includes(deep) ? deep : "home";
  app.startTour = startTour;
  home.mount(app);
  if (target === "home") route("home");
  try {
    await load();
  } catch (err) {
    $("#loader").classList.remove("quiet");
    $("#boot-log").innerHTML = `<span style="color:var(--red)">Kalyon could not load its data (${err.message}). Open it through a web server, for example the GitHub Pages link, or run: python -m http.server (inside the docs folder).</span>`;
    return;
  }
  story.mount(app);
  team.mount(app);
  control.mount(app); journey.mount(app); board.mount(app); whatif.mount(app); lab.mount(app); hood.mount(app); method.mount(app); optlab.mount(app); passenger.mount(app);
  decorate();
  $$(".tab").forEach(b => b.addEventListener("click", () => route(b.dataset.view)));
  $("#help-btn").addEventListener("click", () => startTour(app.view));
  window.addEventListener("hashchange", () => route(location.hash.slice(1)));
  if (target !== "home") route(target);
  app.emit("replay", app.replay);
  app.emit("tick", { t: app.t, jumped: true });
  requestAnimationFrame(loop);
  $("#loader").classList.add("done");
  // The briefing's scroll triggers can only be built while that view is visible.
  let storyReady = false;
  const startStory = () => {
    if (storyReady) return;
    storyReady = true;
    try { story.animate(); } catch (err) { console.error(err); }
  };
  if (app.view === "overview") { startStory(); story.intro(); }
  else {
    app.on("view", v => { if (v === "overview") requestAnimationFrame(startStory); });
    app.emit("view", app.view);
  }
}
boot();
export default app;
