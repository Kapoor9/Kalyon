// Passenger tab: what a traveller would see. Same replay clock, same Kalyon forecasts and the same
// rules as the Station board (Kalyon ETA = forecast median, "be on the platform by" = low end of the
// range, arrived trains show their actual time). Tips and alerts are worded from those numbers only.
import { createScene, SCENES } from "./pscene.js?v=202611091922";
import * as O from "./optimise.js?v=202611091922";
import { h, s, $, $$, clear, hhmm, dayLabel, mins, VER } from "./ui.js?v=202611091922";
import { webglOK } from "./fx.js?v=202611091922";

let app, root, eng = null, D = null;
const J = { run: null, b: 0, d: null, home: 30, pick: 40 };
const PREF = { sound: true, vib: true, voice: false, lang: "en-IN" };
const el = {};
let alerts = [], fired = new Set(), lastMed = null, plan = null, planKey = "", activeSec = "hero", lastMinute = -1, built = false, introDone = false;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px)").matches;
const CITY = { DDN: "city-DDN", HW: "city-HW", MB: "city-MB", BE: "city-BE", LKO: "city-LKO", NDLS: "city-NDLS" };

const I = { // thin line icons
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  trend: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
  range: '<svg viewBox="0 0 24 24"><path d="M4 12h16M7 8v8M17 8v8"/></svg>',
  why: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/></svg>',
  fog: '<svg viewBox="0 0 24 24"><path d="M3 9h13M6 13h15M3 17h12"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1 .5-8 6 6 0 0 1 11 2 3.5 3.5 0 0 1-.5 6.9H7zM9 18l-1 3M13 18l-1 3M17 18l-1 3"/></svg>',
  crowd: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><path d="M3 20c.5-3.5 2.5-5.5 5-5.5s4.5 2 5 5.5M11 20c.5-3.5 2.5-5.5 5-5.5s4.5 2 5 5.5"/></svg>',
  line: '<svg viewBox="0 0 24 24"><path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>',
  train: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/></svg>',
  hold: '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14"/><rect x="13.5" y="5" width="3.5" height="14"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>',
};

export function mount(a) {
  app = a;
  root = $("#v-passenger");
  app.on("view", v => {
    document.body.classList.toggle("passenger-mode", v === "passenger");
    if (v === "passenger") enter(); else if (eng) eng.pause();
  });
  app.on("replay", () => { if (built) { pickDefault(); fillPicker(); onJourney(); } });
  app.on("tick", ({ t, jumped }) => {
    if (!built || app.view !== "passenger") return;
    const m = Math.floor(t);
    if (m === lastMinute && !jumped) return;
    lastMinute = m;
    refresh(!!jumped);
  });
  app.on("report", ({ run, k }) => { if (built && run.run === J.run) onReport(k); });
  app.on("play", on => { if (el.playBtn) el.playBtn.innerHTML = on ? I.pause : I.play; });
}

// ------------------------------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------------------------------
function build() {
  built = true;
  const canvas = h("canvas", { class: "pv-canvas", "aria-hidden": "true" });
  root.append(
    canvas,
    el.fallback = h("div", { class: "pv-fallback", "aria-hidden": "true" }),
    el.scrim = h("div", { class: "pv-scrim", "aria-hidden": "true" }),
    el.edge = h("div", { class: "pv-edge", "aria-hidden": "true" }),
    el.critical = h("div", { class: "pv-critical", role: "alert", "aria-live": "assertive" }),
    el.toasts = h("div", { class: "pv-toasts", "aria-live": "polite" }),
    h("div", { class: "pv-honest" }, h("i"), "Demo journey · replay of synthetic data · not live tracking"),
    clockBar(),
    el.intro = h("div", { class: "pv-intro", "aria-hidden": "true" },
      h("p", { class: "pv-intro-l1" }, "The display says: running late."),
      h("p", { class: "pv-intro-l2" }, "Kalyon tells you when."),
      h("button", { class: "pv-skip", onclick: () => skipIntro() }, "Skip")),
    h("div", { class: "pv-wrap" },
      heroSec(), liveSec(), saathiSec(), roadSec(), alertSec(), pickupSec(), arriveSec(),
      h("footer", { class: "pv-foot" },
        h("p", {}, "Everything on this page comes from Kalyon’s models running in your browser on a replay of calibrated synthetic data for the Dehradun corridor. It is not live train tracking. Trains, numbers and timetables are invented for the demonstrator."),
        h("p", { class: "pv-credits" }, "Photographs gathered by the team from public sources for this non-commercial student project, enlarged with an AI super-resolution model (EDSR) and given depth with Depth Anything V2. Locomotive photo: Somanko. Night-berth video: Nemo’s Dreamscapes. Bareilly image: Kupi AI."))));
  if (webglOK()) {
    try { eng = createScene(canvas, { reduce, mobile, ver: VER }); } catch (e) { console.error(e); eng = null; }
  }
  if (!eng) root.classList.add("no-gl");
  observeSections();
  window.addEventListener("scroll", onScroll, { passive: true });
  pickDefault();
  fillPicker();
  onJourney(true);
}

function clockBar() {
  el.clock = h("b", { class: "pv-clock-t" }, "--:--");
  el.clockDay = h("span", {}, "");
  el.playBtn = h("button", { class: "pv-play", "aria-label": "Play or pause the replay", html: app.playing ? I.pause : I.play, onclick: () => { unlockAudio(); app.play(!app.playing); } });
  const sp = h("div", { class: "pv-speed", role: "group", "aria-label": "Replay speed" },
    ...[[1, "1×"], [5, "5×"], [15, "15×"]].map(([v, l]) => h("button", { "data-v": v, "aria-pressed": String(app.speed === v), onclick: e => {
      app.speed = v; $$("button", sp).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === v)));
    } }, l)));
  return h("div", { class: "pv-clockbar" }, el.playBtn, h("div", { class: "pv-clock" }, el.clock, el.clockDay), sp);
}

function words(text, cls = "") {
  const parts = [];
  text.split(" ").forEach((w, i) => { if (i) parts.push(" "); parts.push(h("span", { class: "w", style: `--i:${i}` }, h("span", {}, w))); });
  return h("span", { class: `pv-words ${cls}` }, ...parts);
}

function heroSec() {
  el.trainSel = h("select", { "aria-label": "Train", onchange: e => { J.run = +e.target.value; J.b = 0; J.d = null; fillPicker(); onJourney(); } });
  el.fromSel = h("select", { "aria-label": "Boarding station", onchange: e => { J.b = +e.target.value; if (J.d <= J.b) J.d = null; fillPicker(); onJourney(); } });
  el.toSel = h("select", { "aria-label": "Destination", onchange: e => { J.d = +e.target.value; onJourney(); } });
  el.days = h("div", { class: "pv-days", role: "group", "aria-label": "Day" },
    ...app.replays.map(r => h("button", { "data-id": r.id, onclick: () => app.setReplay(r.id) }, r.title)));
  return h("section", { class: "pv-sec pv-hero", "data-sec": "hero" },
    h("div", { class: "pv-hero-in" },
      h("p", { class: "pv-kicker rv" }, "Kalyon for passengers · यात्री"),
      h("h1", { class: "pv-h1" }, words("Know when you’ll"), h("br"), words("really arrive.", "em")),
      h("p", { class: "pv-hi rv", style: "--d:.5s" }, "जानिए आप सच में कब पहुँचेंगे।"),
      h("p", { class: "pv-lede rv", style: "--d:.6s" }, "Kalyon reads your train’s running reports, the weather and the line ahead, and gives you an honest arrival time, with a range you can plan around."),
      h("div", { class: "pv-picker glass rv", style: "--d:.75s" },
        h("p", { class: "pv-sentence" }, "I’m on ", el.trainSel, h("br", { class: "m" }), " from ", el.fromSel, " to ", el.toSel, "."),
        h("div", { class: "pv-picker-row" }, el.days,
          h("button", { class: "pv-go", onclick: () => $(".pv-live").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }) }, "Show my journey", h("span", {}, "↓"))))),
    h("div", { class: "pv-scroll-cue", "aria-hidden": "true" }, h("span")));
}

function liveSec() {
  return h("section", { class: "pv-sec pv-live", "data-sec": "live" },
    h("div", { class: "pv-live-grid" },
      h("div", { class: "pv-live-main" },
        el.liveKick = h("p", { class: "pv-kicker rv" }, ""),
        el.liveLead = h("h2", { class: "pv-lead rv", style: "--d:.1s" }, ""),
        el.bigTime = h("div", { class: "pv-bigtime rv", style: "--d:.2s", "aria-live": "polite" }),
        el.rangeLine = h("p", { class: "pv-range rv", style: "--d:.3s" }),
        el.rangeBar = h("div", { class: "pv-rangebar rv", style: "--d:.35s" }),
        el.liveFacts = h("div", { class: "pv-facts rv", style: "--d:.45s" })),
      el.pass = h("div", { class: "pv-pass rv", style: "--d:.3s",
        onpointermove: e => { if (reduce) return; const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          e.currentTarget.style.transform = `perspective(1100px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg) translateY(-4px)`; e.currentTarget.style.setProperty("--gx", `${(x + 0.5) * 100}%`); },
        onpointerleave: e => { e.currentTarget.style.transform = ""; } })),
    el.ribbon = h("div", { class: "pv-ribbon glass rv", style: "--d:.5s" }));
}

function saathiSec() {
  el.voiceBtn = h("button", { class: "pv-toggle", "aria-pressed": "false", onclick: e => { unlockAudio(); PREF.voice = !PREF.voice; e.currentTarget.setAttribute("aria-pressed", String(PREF.voice)); if (PREF.voice) say(PREF.lang.startsWith("hi") ? "साथी की आवाज़ चालू है।" : "Saathi will read your alerts aloud."); } }, "Speak alerts");
  el.langBtn = h("button", { class: "pv-toggle", onclick: e => { PREF.lang = PREF.lang === "en-IN" ? "hi-IN" : "en-IN"; e.currentTarget.textContent = PREF.lang === "en-IN" ? "English" : "हिन्दी"; } }, "English");
  return h("section", { class: "pv-sec pv-saathi", "data-sec": "saathi" },
    h("div", { class: "pv-sec-head" },
      h("p", { class: "pv-kicker rv" }, "Saathi · साथी"),
      h("h2", { class: "pv-h2" }, words("Your travel companion.")),
      h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Every tip below is worked out from Kalyon’s latest forecast for your train. Nothing is guessed, and each one says where it came from."),
      h("div", { class: "pv-voice rv", style: "--d:.4s" }, el.voiceBtn, el.langBtn)),
    el.tips = h("div", { class: "pv-tips" }));
}

function roadSec() {
  return h("section", { class: "pv-sec pv-road", "data-sec": "road" },
    h("div", { class: "pv-sec-head" },
      h("p", { class: "pv-kicker rv" }, "The road ahead · आगे का रास्ता"),
      h("h2", { class: "pv-h2" }, words("Station by station.")),
      h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Where your train has been, and when Kalyon expects it at every station still ahead.")),
    el.road = h("ol", { class: "pv-stops glass" }));
}

function alertSec() {
  const t = (k, label) => h("button", { class: "pv-toggle", "aria-pressed": String(PREF[k]), onclick: e => { unlockAudio(); PREF[k] = !PREF[k]; e.currentTarget.setAttribute("aria-pressed", String(PREF[k])); } }, label);
  return h("section", { class: "pv-sec pv-alerts", "data-sec": "alerts" },
    h("div", { class: "pv-sec-head" },
      h("p", { class: "pv-kicker rv" }, "Alerts · सूचनाएँ"),
      h("h2", { class: "pv-h2" }, words("Told the moment it changes.")),
      h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Kalyon re-forecasts each time your train leaves a station. You hear about it when the arrival moves by 10 minutes or more, when the train reaches your station, when you are 30 minutes out, and when fog, rain or rescheduling affects you."),
      h("div", { class: "pv-voice rv", style: "--d:.4s" }, t("sound", "Sound"), t("vib", "Vibrate"),
        h("button", { class: "pv-go small", onclick: () => { unlockAudio(); app.speed = 15; $$(".pv-speed button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === 15))); app.play(true); } }, "Play the journey at 15×", h("span", {}, "▶")))),
    el.alertList = h("ol", { class: "pv-alertlist" }));
}

function pickupSec() {
  el.pickOut = h("output", {}, `${J.pick} min`);
  return h("section", { class: "pv-sec pv-pickup", "data-sec": "pickup" },
    h("div", { class: "pv-sec-head" },
      h("p", { class: "pv-kicker rv" }, "Picking someone up? · लेने जा रहे हैं?"),
      h("h2", { class: "pv-h2" }, words("Leave home at the right time.")),
      h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Kalyon’s range tells you the earliest the train is likely to arrive. Be on the platform by then and you will rarely miss anyone.")),
    h("div", { class: "pv-pick glass rv", style: "--d:.35s" },
      el.pickMain = h("div", { class: "pv-pick-main" }),
      h("div", { class: "pv-pick-ctl" },
        h("label", {}, "Your travel time to the station ", el.pickOut),
        h("input", { type: "range", min: 5, max: 120, step: 5, value: J.pick, "aria-label": "Travel time to the station", oninput: e => { J.pick = +e.target.value; el.pickOut.textContent = `${J.pick} min`; renderPickup(); } }),
        h("button", { class: "pv-go", onclick: share }, "Share the plan", h("span", { html: I.share })))));
}

function arriveSec() {
  return h("section", { class: "pv-sec pv-arrive", "data-sec": "arrive" },
    el.arrive = h("div", { class: "pv-arrive-in" }));
}

// ------------------------------------------------------------------------------------------
// Journey selection
// ------------------------------------------------------------------------------------------
function runsNow() { return app.replay.runs; }
function pickDefault() {
  const t = app.t;
  let best = null, bestScore = -1;
  for (const run of runsNow()) {
    const st = app.status(run, t);
    if (st.state === "done") continue;
    const k = app.lastDeparted(run, t);
    const left = run.ev.length - 1 - Math.max(k, 0);
    const score = (k >= 0 ? 100 : 0) + left * 3 - (run.resched > 0 ? 80 : 0) + (CITY[app.trains[run.train].stops[app.trains[run.train].stops.length - 1].code] ? 20 : 0);
    if (left >= 3 && score > bestScore) { best = run; bestScore = score; }
  }
  best = best || runsNow()[0];
  J.run = best.run; J.b = 0; J.d = null;
}
function fillPicker() {
  const runs = runsNow();
  clear(el.trainSel);
  for (const run of runs) {
    const t = app.trains[run.train];
    el.trainSel.append(h("option", { value: run.run }, `${t.number} ${t.name}${run.date !== app.replay.date ? ` (from ${run.date.slice(5)})` : ""}`));
  }
  if (!runs.find(r => r.run === J.run)) pickDefault();
  el.trainSel.value = J.run;
  const run = runs.find(r => r.run === J.run), tr = app.trains[run.train];
  clear(el.fromSel); clear(el.toSel);
  tr.stops.slice(0, -1).forEach((st, i) => el.fromSel.append(h("option", { value: i }, app.stations[st.code].name)));
  tr.stops.forEach((st, i) => { if (i > J.b) el.toSel.append(h("option", { value: i }, app.stations[st.code].name)); });
  if (J.d === null || J.d <= J.b) J.d = tr.stops.length - 1;
  el.fromSel.value = J.b; el.toSel.value = J.d;
  $$("button", el.days).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === app.replay.id)));
}

// ------------------------------------------------------------------------------------------
// The numbers (identical rules to the Station board)
// ------------------------------------------------------------------------------------------
function journey() {
  const run = runsNow().find(r => r.run === J.run);
  const tr = app.trains[run.train];
  const w0 = app.w0(), t = app.t, now = w0 + t;
  const k = app.lastDeparted(run, t);
  const st = app.status(run, t);
  const A = i => { const v = app.arr(run, i); return v === null ? null : w0 + v; };
  const Dp = i => { const v = app.dep(run, i); return v === null ? null : w0 + v; };
  const SA = i => (run.ev[i][1] === null ? null : w0 + run.ev[i][1]);
  const SD = i => (run.ev[i][2] === null ? null : w0 + run.ev[i][2]);
  const fc = k >= 0 ? app.forecast(run, k, true) : null;
  const row = i => (fc ? fc.find(x => x.s === i) : null);
  const b = J.b, d = J.d;
  let phase;
  if (A(d) !== null && A(d) <= now) phase = "arrived";
  else if (k >= b) phase = "onboard";
  else if (b > 0 && A(b) !== null && A(b) <= now) phase = "atplatform";
  else if (k < 0) phase = "notdeparted";
  else phase = "waiting";
  const day = Math.floor(now / 1440);
  const wx = app.replay.weather[String(day - app.replay.t0_day)] || {};
  const hour = ((now % 1440) + 1440) % 1440 / 60;
  return { run, tr, k, st, A, Dp, SA, SD, fc, row, b, d, phase, now, wx, hour, night: hour < 6 || hour >= 18.5 };
}

function sceneForState(j) {
  const fogNight = j.wx.visibility < 1 && j.night;
  const rain = j.wx.rain > 20;
  const fest = j.wx.festival === 1;
  const fog = { fog: Math.min(1, 0.55 + (1 - j.wx.visibility) * 0.5) };
  if (j.phase === "arrived") return [CITY[j.tr.stops[j.d].code] || "platform", {}];
  if (j.phase === "onboard") {
    const md = j.row(j.d);
    if (md && md.med - j.now <= 25) return [j.night ? "platform" : (CITY[j.tr.stops[j.d].code] || "hero"), {}];
    if (fogNight) return ["fog", fog];
    if (j.night) return ["onboard", {}];
    return ["window", rain ? { rain: Math.min(1, j.wx.rain / 40) } : {}];
  }
  if (j.phase === "atplatform") return [fest && !j.night ? "crowd" : "platform", {}];
  if (fogNight) return ["fog", fog];
  if (rain) return ["rain", {}];
  if (fest) return ["crowd", {}];
  return [j.night ? "platform" : "hero", {}];
}

// ------------------------------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------------------------------
const stn = c => app.stations[c];
const tm = v => (v === null || v === undefined ? "--:--" : hhmm(v));
function dayNote(v, now) { const a = Math.floor(v / 1440), b = Math.floor(now / 1440); return a > b ? " tomorrow" : a < b ? " yesterday" : ""; }

function onJourney(first = false) {
  alerts = []; fired = new Set(); lastMed = null; plan = null; planKey = "";
  clear(el.alertList);
  const j = journey();
  // Conditions already true when you start following a train are noted quietly, not alarmed.
  seedFired(j);
  pushAlert({ level: "info", title: `Following ${j.tr.number} ${j.tr.name}`, body: `${stn(j.tr.stops[j.b].code).name} → ${stn(j.tr.stops[j.d].code).name}. Replay of ${app.replay.title.toLowerCase()}, ${dayLabel(app.replay.t0_day * 1440)}.`, quiet: true });
  if (j.run.resched > 0) pushAlert({ level: "critical", title: `Rescheduled by ${mins(j.run.resched)}`, body: `${j.tr.number} was rescheduled at ${stn(j.tr.stops[0].code).name}: it leaves at ${tm(j.SD(0) + j.run.ev[0][4])} instead of ${tm(j.SD(0))}.`, quiet: !first ? false : true,
    hi: `${j.tr.number} का समय बदला गया है। यह ${stn(j.tr.stops[0].code).name_hi} से ${tm(j.SD(0) + j.run.ev[0][4])} बजे चलेगी।` });
  const md = j.row(j.d);
  lastMed = md ? md.med : null;
  refresh(true, true);
}

function seedFired(j) {
  if (j.phase === "atplatform") fired.add("platform");
  if (j.phase === "arrived") fired.add("arrived");
  const md = j.row(j.d);
  if (j.phase === "onboard" && md && md.med - j.now <= 30) fired.add("arr30");
  if (j.wx.visibility < 1) fired.add("fog");
}

function refresh(jumped, force = false) {
  const j = journey();
  el.clock.textContent = tm(j.now);
  el.clockDay.textContent = `${dayLabel(j.now)} · replay`;
  renderLive(j);
  renderTips(j);
  renderRoad(j);
  renderPickup(j);
  renderArrive(j);
  if (!jumped || force) timeAlerts(j, jumped);
  else seedFired(j);
  updateScene(j);
  ensurePlan(j);
}

function renderLive(j) {
  const { tr, b, d } = j;
  const bS = stn(tr.stops[b].code), dS = stn(tr.stops[d].code);
  let kick, lead, big, range = "", rangeVals = null, facts = [];
  const md = j.row(d), mb = j.row(b);
  if (j.phase === "arrived") {
    const prev = j.d - 1 >= 0 ? app.forecast(j.run, j.d - 1).find(x => x.s === j.d) : null;
    kick = "Arrived · पहुँच गए"; lead = `You reached ${dS.name} at`; big = j.A(d);
    range = prev ? `Kalyon’s last forecast, when the train left ${stn(tr.stops[j.d - 1].code).name}: ${tm(prev.med)} (${Math.abs(Math.round(prev.med - j.A(d)))} min ${prev.med > j.A(d) ? "later" : "earlier"} than reality). Today’s display said ${tm(prev.b1)}.` : "";
    facts = [["Timetable", tm(j.SA(d))], ["Arrival delay", mins(j.A(d) - j.SA(d))]];
  } else if (j.phase === "onboard") {
    kick = "On board · यात्रा जारी"; lead = `You’ll most likely reach ${dS.name} at`; big = md.med;
    range = `Likely between ${tm(md.lo)} and ${tm(md.hi)}. Kalyon’s range holds the real arrival about 4 times in 5.`;
    rangeVals = md;
    facts = [["Timetable", tm(md.sched)], ["Today’s display would say", tm(md.b1)], ["Expected delay", mins(md.med - md.sched)], ["Last report", `Left ${stn(tr.stops[j.k].code).name} ${tm(j.Dp(j.k))}`]];
  } else if (j.phase === "atplatform") {
    kick = "Board now · सवार हों"; lead = `${tr.number} is at ${bS.name}. It arrived at`; big = j.A(b);
    range = `It leaves when its stop is over, not before the scheduled ${tm(j.SD(b))}.`;
    facts = [["Scheduled departure", tm(j.SD(b))], ["Running", mins(j.A(b) - j.SA(b))]];
  } else if (j.phase === "waiting") {
    kick = "Your train is on its way · आ रही है"; lead = `${tr.number} should reach ${bS.name} at`; big = mb.med;
    range = `Likely between ${tm(mb.lo)} and ${tm(mb.hi)}. Be on the platform by ${tm(mb.lo)}.`;
    rangeVals = mb;
    facts = [["Be on the platform by", tm(mb.lo)], ["Leave home by", `${tm(mb.lo - J.home)} (${J.home} min away)`], ["Timetable", tm(mb.sched)], ["Last report", `Left ${stn(tr.stops[j.k].code).name} ${tm(j.Dp(j.k))}`]];
  } else {
    kick = "Not yet departed · अभी चली नहीं"; lead = `${tr.number} is scheduled to leave ${stn(tr.stops[0].code).name} at`; big = j.SD(0);
    range = `Kalyon gives its first forecast the moment the train leaves ${stn(tr.stops[0].code).name}, from its first running report.${j.run.resched > 0 ? ` It has been rescheduled to ${tm(j.SD(0) + j.run.ev[0][4])}.` : ""}`;
    facts = [["Your stop", `${bS.name}, timetable ${tm(b === 0 ? j.SD(0) : j.SA(b))}`], ["Destination", `${dS.name}, timetable ${tm(j.SA(d))}`]];
  }
  el.liveKick.textContent = kick;
  el.liveLead.textContent = lead;
  setBigTime(big, j.now);
  el.rangeLine.textContent = range;
  renderRangeBar(rangeVals);
  clear(el.liveFacts).append(...facts.map(([a, v]) => h("div", {}, h("span", {}, a), h("b", {}, v))));
  renderPass(j);
  renderRibbon(j);
}

// Rolling digits, like a station clock settling.
function setBigTime(v, now) {
  const txt = tm(v);
  if (el.bigTime._txt === txt) return;
  const first = !el.bigTime.children.length;
  if (first) {
    for (const c of txt) {
      if (c === ":") { el.bigTime.append(h("span", { class: "colon" }, ":")); continue; }
      const reel = h("span", { class: "reel" }, h("span", { class: "strip" }, ...Array.from({ length: 10 }, (_, i) => h("span", {}, String(i)))));
      el.bigTime.append(reel);
    }
    el.bigTime.append(el.bigNote = h("span", { class: "note" }));
  }
  const reels = $$(".reel", el.bigTime);
  [...txt.replace(":", "")].forEach((c, i) => { const n = c === "-" ? 0 : +c; reels[i].firstChild.style.transform = `translateY(${-n * 10}%)`; reels[i].style.setProperty("--dl", `${i * 70}ms`); });
  el.bigNote.textContent = v ? dayNote(v, now) : "";
  el.bigTime._txt = txt;
}

function renderRangeBar(r) {
  if (!r) { el.rangeBar.hidden = true; return; }
  el.rangeBar.hidden = false;
  const lo = Math.min(r.lo, r.sched, r.b1) - 10, hi = Math.max(r.hi, r.b1, r.sched) + 10;
  const x = v => `${((v - lo) / (hi - lo)) * 100}%`;
  const edge = v => { const f = (v - lo) / (hi - lo); return f < 0.18 ? " edge-l" : f > 0.82 ? " edge-r" : ""; };
  clear(el.rangeBar).append(
    h("div", { class: "rb-track" }),
    h("div", { class: "rb-band", style: `left:${x(r.lo)};width:calc(${x(r.hi)} - ${x(r.lo)})` }),
    h("div", { class: `rb-mark sched${edge(r.sched)}`, style: `left:${x(r.sched)}` }, h("span", {}, `Timetable ${tm(r.sched)}`)),
    h("div", { class: `rb-mark today${edge(r.b1)}`, style: `left:${x(r.b1)}` }, h("span", {}, `Display ${tm(r.b1)}`)),
    h("div", { class: `rb-mark kal${edge(r.med)}`, style: `left:${x(r.med)}` }, h("span", {}, `Kalyon ${tm(r.med)}`)));
}

function renderPass(j) {
  const { tr, b, d } = j;
  const bS = stn(tr.stops[b].code), dS = stn(tr.stops[d].code);
  const md = j.row(d);
  const late = j.st.state === "waiting" ? null : j.st.delay;
  const line = planLine(j);
  clear(el.pass).append(
    h("div", { class: "pp-top" }, h("span", { class: "pp-brand" }, "KALYON", h("i", {}, " यात्री पास")), h("span", { class: `pp-live ${j.phase}` }, h("i"), j.phase === "arrived" ? "Arrived" : j.phase === "notdeparted" ? "Scheduled" : "Live replay")),
    h("div", { class: "pp-train" }, h("b", {}, tr.number), h("div", {}, h("span", {}, tr.name), h("span", { class: "hi" }, tr.name_hi))),
    h("div", { class: "pp-route" },
      h("div", {}, h("b", {}, tr.stops[b].code), h("span", {}, bS.name), h("em", {}, b === 0 ? tm(j.SD(0)) : tm(j.SA(b)))),
      h("div", { class: "pp-line", html: `<svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M2 10H118" stroke-dasharray="3 5"/></svg>${I.train}` }),
      h("div", { class: "r" }, h("b", {}, tr.stops[d].code), h("span", {}, dS.name), h("em", {}, tm(j.SA(d))))),
    h("div", { class: "pp-perf" }, h("i"), h("i")),
    h("div", { class: "pp-grid" },
      cell("Kalyon ETA", j.phase === "arrived" ? tm(j.A(d)) : md ? tm(md.med) : "after departure"),
      cell("Likely range", md && j.phase !== "arrived" ? `${tm(md.lo)}–${tm(md.hi)}` : "—"),
      cell("Running", late === null ? "not started" : late < 5 ? "on time" : `${Math.round(late)} min late`),
      cell("Planned line", line ? `Line ${line} at ${dS.name}` : "—")),
    h("p", { class: "pp-foot" }, line ? "Line from Kalyon’s Optimisation Lab plan; station layout assumed." : "Synthetic train and timetable for the demonstrator."));
  function cell(a, v) { return h("div", {}, h("span", {}, a), h("b", {}, v)); }
}

function renderRibbon(j) {
  const { tr, run } = j;
  const stops = tr.stops, n = stops.length;
  const km = stops.map(s0 => s0.km), tot = km[n - 1];
  const X = v => 3 + (v / tot) * 94;
  let pos = 0;
  if (j.st.state === "running") pos = km[j.st.from] + (km[j.st.to] - km[j.st.from]) * j.st.p;
  else if (j.st.state === "dwell") pos = km[j.st.at];
  else if (j.st.state === "done") pos = tot;
  const svgW = 1000;
  const sx = v => (X(v) / 100) * svgW;
  const svg = s("svg", { viewBox: `0 0 ${svgW} 120`, preserveAspectRatio: "none", class: "rb-svg", "aria-hidden": "true" },
    s("path", { d: `M${sx(0)} 60H${sx(tot)}`, class: "rb-ahead" }),
    s("path", { d: `M${sx(0)} 60H${sx(pos)}`, class: "rb-done" }),
    s("path", { d: `M${sx(km[j.b])} 60H${sx(km[j.d])}`, class: "rb-mine" }));
  const labels = h("div", { class: "rb-labels" });
  stops.forEach((st, i) => {
    const passed = j.A(i) !== null && j.A(i) <= j.now || (i === 0 && j.k >= 0);
    const mine = i === j.b || i === j.d;
    const r = j.row(i);
    const when = i === 0 ? tm(j.Dp(0) ?? j.SD(0)) : passed ? tm(j.A(i)) : r ? tm(r.med) : tm(j.SA(i));
    labels.append(h("div", { class: `rb-st ${passed ? "passed" : ""} ${mine ? "mine" : ""} ${i % 2 ? "low" : ""} ${i === 0 ? "first" : i === n - 1 ? "last" : ""}`, style: `left:${X(km[i])}%` },
      h("i"), h("b", {}, stn(st.code).name), h("span", {}, when)));
  });
  const head = h("div", { class: "rb-train", style: `left:${X(pos)}%` }, h("span", {}, tr.number));
  clear(el.ribbon).append(svg, labels, head);
}

function tip(icon, title, body, src, tone = "") {
  return h("article", { class: `pv-tip glass ${tone}` }, h("div", { class: "ico", html: I[icon] }), h("div", {}, h("b", {}, title), h("p", {}, body), src ? h("small", {}, src) : null));
}

function renderTips(j) {
  const out = [];
  const { tr, d, b } = j;
  const dS = stn(tr.stops[d].code), bS = stn(tr.stops[b].code);
  const md = j.row(d);
  const src = j.k >= 0 ? `From Kalyon’s forecast after ${tr.number} left ${stn(tr.stops[j.k].code).name} at ${tm(j.Dp(j.k))}.` : "";
  if (j.phase === "notdeparted") {
    out.push(tip("clock", "No forecast yet", `${tr.number} has not left ${stn(tr.stops[0].code).name}. Kalyon forecasts from running reports, so the first estimate comes when it departs. Until then, plan on the timetable.`, "Kalyon never guesses before the first report."));
  }
  if (j.phase === "waiting") {
    const mb = j.row(b);
    out.push(tip("home", `Leave home by ${tm(mb.lo - J.home)}`, `Kalyon expects ${tr.number} at ${bS.name} at ${tm(mb.med)}, and probably not before ${tm(mb.lo)}. With ${J.home} minutes to the station, leaving at ${tm(mb.lo - J.home)} gets you there in time.`, src));
    if (j.k + 1 === b) out.push(tip("flag", "Yours is the next stop", `${tr.number} is now running towards ${bS.name}. Be on the platform by ${tm(mb.lo)}.`, src, "warm"));
  }
  if (md && (j.phase === "onboard" || j.phase === "waiting")) {
    const diff = md.med - md.b1;
    if (Math.abs(diff) >= 3) out.push(tip("trend", diff > 0 ? `Expect about ${Math.round(diff)} min more than the display says` : `You may arrive ${Math.round(-diff)} min earlier than the display says`,
      `A station display adds today’s delay to the timetable (${tm(md.b1)} at ${dS.name}). Kalyon expects ${tm(md.med)}, because delay usually ${diff > 0 ? "grows" : "shrinks"} on the stretch ahead of this train.`, src));
    out.push(tip("range", `4 in 5 chance: ${tm(md.lo)} to ${tm(md.hi)}`, `Kalyon’s likely range for ${dS.name} is ${Math.round(md.hi - md.lo)} minutes wide. On test days, ranges like this held the real arrival 80% of the time.`, src));
    const why = reasons(md);
    if (why.length) out.push(tip("why", "Why this time", why.map(([l, v]) => `${l} ${v > 0 ? "adds" : "saves"} ${Math.abs(v).toFixed(0)} min`).join(" · ") + ".", "Top reasons from the model’s own explanation (TreeSHAP)."));
    if (j.k >= 1) {
      const prev = app.forecast(j.run, j.k - 1).find(x => x.s === d);
      if (prev) {
        const ch = md.med - prev.med;
        if (Math.abs(ch) >= 2) out.push(tip("trend", ch > 0 ? `Arrival moved ${Math.round(ch)} min later` : `Gaining time: ${Math.round(-ch)} min earlier`, `Before ${tr.number} left ${stn(tr.stops[j.k].code).name}, Kalyon expected ${tm(prev.med)}. Now it expects ${tm(md.med)}.`, src, ch > 0 ? "warn" : "good"));
      }
    }
  }
  if (j.wx.visibility < 1) out.push(tip("fog", "Dense fog today", `Visibility around ${(j.wx.visibility * 1000).toFixed(0)} m. Trains run at fog-safe speeds at night, so delays can grow after dark; Kalyon already accounts for this in the time above.`, "Weather recorded in the replay data.", "cool"));
  if (j.wx.rain > 20) out.push(tip("rain", "Heavy rain", `${j.wx.rain.toFixed(0)} mm of rain on the corridor today. Kalyon’s forecast includes it.`, "Weather recorded in the replay data.", "cool"));
  if (j.wx.festival === 1) out.push(tip("crowd", "Festival rush", "Platforms and coaches are crowded during the festival season. Reach a little early and keep your belongings close.", "Festival period in the replay data.", "warm"));
  const line = planLine(j);
  if (line && j.phase !== "arrived") out.push(tip("line", `Planned line ${line} at ${dS.name}`, `Kalyon’s optimiser assigns ${tr.number} to line ${line} when it reaches ${dS.name}. Platform staff can prepare in advance.`, "Optimisation Lab plan; the station’s line layout is assumed."));
  if (j.phase === "arrived") out.push(tip("flag", `Welcome to ${dS.name}`, `${tr.number} arrived at ${tm(j.A(d))}, ${mins(j.A(d) - j.SA(d))} after the timetable.`, "Actual arrival in the replay."));
  const key = out.map(x => x.textContent).join("|");
  if (key === el.tips._key) return;
  el.tips._key = key;
  clear(el.tips).append(...out);
  out.forEach((x, i) => { x.style.setProperty("--i", i); requestAnimationFrame(() => x.classList.add("on")); });
  pulseEdge();
}

function reasons(row) {
  if (!row.shap) return [];
  const f = app.M.features, L = app.M.labels;
  return f.map((k, i) => [L[k], row.shap[i]]).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
}

function renderRoad(j) {
  const { tr } = j;
  const items = [];
  tr.stops.forEach((st, i) => {
    const S = stn(st.code);
    const passed = (j.A(i) !== null && j.A(i) <= j.now) || (i === 0 && j.k >= 0);
    const r = j.row(i);
    const mine = i === j.b ? "Your boarding station" : i === j.d ? "Your destination" : "";
    let main, sub, cls = "";
    if (i === 0) { main = j.k >= 0 ? `Left ${tm(j.Dp(0))}` : `Leaves ${tm(j.SD(0))}`; sub = j.k >= 0 ? `${mins(j.Dp(0) - j.SD(0))} after the timetable` : "Scheduled"; cls = j.k >= 0 ? "passed" : ""; }
    else if (passed) { main = `Arrived ${tm(j.A(i))}`; sub = `${mins(j.A(i) - j.SA(i))} late`; cls = "passed"; }
    else if (r) { main = `Kalyon ${tm(r.med)}`; sub = `likely ${tm(r.lo)}–${tm(r.hi)} · timetable ${tm(r.sched)}`; }
    else { main = `Timetable ${tm(j.SA(i))}`; sub = "forecast after departure"; }
    const nextLeg = i < tr.stops.length - 1 ? tr.stops[i + 1].leg_single : 0;
    items.push(h("li", { class: `${cls} ${mine ? "mine" : ""}`, style: `--i:${i}` },
      h("div", { class: "dot" }),
      h("div", { class: "nm" }, h("b", {}, S.name), h("span", { class: "hi" }, S.name_hi), mine ? h("em", {}, mine) : null),
      h("div", { class: "tm" }, h("b", {}, main), h("span", {}, sub)),
      nextLeg > 0.5 ? h("div", { class: "leg" }, "single line to the next station") : null));
  });
  const key = items.map(x => x.textContent).join("|");
  if (key === el.road._key) return;
  el.road._key = key;
  clear(el.road).append(...items);
}

function renderPickup(j = journey()) {
  const { tr, d } = j;
  const dS = stn(tr.stops[d].code);
  const md = j.row(d);
  clear(el.pickMain);
  if (j.phase === "arrived") {
    el.pickMain.append(h("p", { class: "pk-k" }, `${tr.number} has arrived`), h("p", { class: "pk-big" }, tm(j.A(d))), h("p", { class: "pk-s" }, `at ${dS.name}. Head to the exit gate.`));
    return;
  }
  if (!md) {
    el.pickMain.append(h("p", { class: "pk-k" }, `Waiting for ${tr.number} to depart`), h("p", { class: "pk-big" }, tm(j.SA(d))), h("p", { class: "pk-s" }, `Timetable at ${dS.name}. Kalyon gives a time to plan around once the train leaves ${stn(tr.stops[0].code).name}.`));
    return;
  }
  el.pickMain.append(
    h("p", { class: "pk-k" }, `Meeting ${tr.number} at ${dS.name} · ${dS.name_hi}`),
    h("div", { class: "pk-row" },
      h("div", {}, h("span", {}, "Leave home by"), h("b", { class: "pk-big" }, tm(md.lo - J.pick))),
      h("div", {}, h("span", {}, "Be on the platform by"), h("b", {}, tm(md.lo))),
      h("div", {}, h("span", {}, "Most likely arrival"), h("b", {}, tm(md.med)))),
    h("p", { class: "pk-s" }, `Kalyon’s range is ${tm(md.lo)}–${tm(md.hi)}. On Kalyon’s test days, 89% of trains arrived at or after the start of their range, so being there by then means you are rarely late to meet anyone.`));
}

function renderArrive(j) {
  const { tr, d } = j;
  const dS = stn(tr.stops[d].code);
  const md = j.row(d);
  const done = j.phase === "arrived";
  const txt = done ? `Welcome to ${dS.name}.` : `Next for you: ${dS.name}.`;
  if (el.arrive._t === txt + (md ? md.med : "")) return;
  el.arrive._t = txt + (md ? md.med : "");
  clear(el.arrive).append(
    h("p", { class: "pv-kicker" }, done ? "Arrived · स्वागत है" : "Destination · गंतव्य"),
    h("h2", { class: "pv-h1" }, words(txt)),
    h("p", { class: "pv-hi" }, done ? `${dS.name_hi} में आपका स्वागत है।` : `${dS.name_hi}`),
    h("p", { class: "pv-lede" }, done ? `${tr.number} arrived at ${tm(j.A(d))}.` : md ? `Kalyon expects ${tr.number} at ${tm(md.med)}, likely between ${tm(md.lo)} and ${tm(md.hi)}.` : `Timetable ${tm(j.SA(d))}. Kalyon forecasts once the train departs.`));
  if (activeSec === "arrive") el.arrive.parentNode.classList.add("in");
}

// ------------------------------------------------------------------------------------------
// The optimiser link (planned platform line for this train)
// ------------------------------------------------------------------------------------------
async function ensurePlan(j) {
  const key = `${app.replay.id}:${J.run}:${j.k}:${Math.floor(app.t / 30)}`;
  if (key === planKey) return;
  planKey = key;
  try {
    if (!D) { D = await fetch(`data/dispatch.json?v=${VER}`).then(r => r.json()); O.setNetwork(app.net.sections); }
    const snap = O.snapshotFromReplay(app, app.replay, app.t, D);
    const ti = snap.trains.findIndex(x => x.id === J.run);
    if (ti < 0) { plan = null; return; }
    const inst = O.buildInstance(snap.trains, snap.now, D);
    const res = O.runToEnd(O.branchAndBound(inst, D, { nodeLimit: 20000 }));
    plan = { inst, res, ti, key };
    const jj = journey();
    renderPass(jj); renderTips(jj);
  } catch (e) { console.warn("plan", e); plan = null; }
}
function planLine(j) {
  if (!plan) return null;
  const code = j.tr.stops[j.d].code;
  const pl = O.platforms(plan.inst, plan.res.t, code);
  const it = pl.items.find(x => x.train === plan.ti);
  return it ? it.line + 1 : null;
}

// ------------------------------------------------------------------------------------------
// Alerts: toasts, critical banner, sound, vibration, voice
// ------------------------------------------------------------------------------------------
function onReport(k) {
  const j = journey();
  const md = j.row(j.d);
  const tr = j.tr, dS = stn(tr.stops[j.d].code);
  if (md && lastMed !== null && j.phase !== "arrived") {
    const ch = md.med - lastMed;
    if (ch >= 10) pushAlert({ level: ch >= 30 ? "critical" : "warn", title: `Arrival moved ${Math.round(ch)} min later`, body: `${tr.number} now expected at ${dS.name} at ${tm(md.med)} (likely ${tm(md.lo)}–${tm(md.hi)}).`,
      hi: `${tr.number} अब ${dS.name_hi} लगभग ${tm(md.med)} बजे पहुँचेगी, पहले से ${Math.round(ch)} मिनट देर से।` });
    else if (ch <= -10) pushAlert({ level: "good", title: `Gaining time: ${Math.round(-ch)} min earlier`, body: `${tr.number} now expected at ${dS.name} at ${tm(md.med)}.`,
      hi: `${tr.number} समय पकड़ रही है। अब ${dS.name_hi} लगभग ${tm(md.med)} बजे पहुँचने की उम्मीद है।` });
    else pushAlert({ level: "info", title: `Left ${stn(tr.stops[k].code).name}`, body: `${Math.round(j.st.delay)} min late. Arrival at ${dS.name} now ${tm(md.med)}${Math.abs(md.med - lastMed) >= 1 ? ` (was ${tm(lastMed)})` : ', unchanged'}.`, quiet: true });
  }
  if (md) lastMed = md.med;
  if (j.phase === "waiting" && k + 1 === j.b && !fired.has("next")) {
    fired.add("next");
    const mb = j.row(j.b), bS = stn(tr.stops[j.b].code);
    pushAlert({ level: "warn", title: `Next stop: ${bS.name}`, body: `Be on the platform by ${tm(mb.lo)}. Kalyon expects ${tr.number} at ${tm(mb.med)}.`,
      hi: `अगला स्टेशन ${bS.name_hi} है। ${tm(mb.lo)} तक प्लेटफ़ॉर्म पर पहुँच जाइए।` });
  }
}

function timeAlerts(j, jumped) {
  if (jumped) return;
  const tr = j.tr, dS = stn(tr.stops[j.d].code), bS = stn(tr.stops[j.b].code);
  const md = j.row(j.d);
  if (j.phase === "atplatform" && !fired.has("platform")) {
    fired.add("platform");
    pushAlert({ level: "critical", title: `${tr.number} is at ${bS.name}. Board now.`, body: `It arrived at ${tm(j.A(j.b))} and leaves after its stop.`, hi: `आपकी ट्रेन ${tr.number} ${bS.name_hi} पर खड़ी है। कृपया सवार हो जाइए।` });
  }
  if (j.phase === "onboard" && md && md.med - j.now <= 30 && !fired.has("arr30")) {
    fired.add("arr30");
    pushAlert({ level: "warn", title: `${dS.name} in about ${Math.max(1, Math.round(md.med - j.now))} min`, body: `Expected at ${tm(md.med)}. Time to gather your things.`, hi: `${dS.name_hi} लगभग ${Math.max(1, Math.round(md.med - j.now))} मिनट में आने वाला है।` });
  }
  if (j.phase === "arrived" && !fired.has("arrived")) {
    fired.add("arrived");
    const prev = app.forecast(j.run, j.d - 1).find(x => x.s === j.d);
    pushAlert({ level: "good", title: `Arrived at ${dS.name} at ${tm(j.A(j.d))}`, body: prev ? `Kalyon’s last forecast was ${tm(prev.med)}.` : "", hi: `आप ${dS.name_hi} पहुँच गए हैं।` });
  }
  if (j.wx.visibility < 1 && j.night && !fired.has("fog") && j.phase !== "arrived") {
    fired.add("fog");
    pushAlert({ level: "warn", title: "Dense fog tonight", body: "Trains slow down in fog after dark. Kalyon’s forecast already includes it.", hi: "आज रात घना कोहरा है। ट्रेनें धीमी चल सकती हैं।" });
  }
}

function pushAlert(a) {
  a.t = journey().now;
  alerts.unshift(a);
  const li = h("li", { class: `al ${a.level}` }, h("span", { class: "al-t" }, tm(a.t)), h("div", {}, h("b", {}, a.title), h("p", {}, a.body)));
  el.alertList.prepend(li);
  requestAnimationFrame(() => li.classList.add("on"));
  if (a.quiet) return;
  toast(a);
  if (a.level === "critical") critical(a);
  chime(a.level);
  if (PREF.vib && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(a.level === "critical" ? [80, 60, 80, 60, 160] : [60]); } catch { /* not supported */ } }
  if (PREF.voice) say(PREF.lang.startsWith("hi") && a.hi ? a.hi : `${a.title}. ${a.body}`);
  pulseEdge(a.level);
}

function toast(a) {
  const t = h("div", { class: `pv-toast ${a.level}` }, h("div", { class: "ico", html: a.level === "good" ? I.flag : a.level === "info" ? I.train : I.bell }),
    h("div", {}, h("span", {}, `Kalyon · ${tm(a.t)}`), h("b", {}, a.title), h("p", {}, a.body)));
  el.toasts.prepend(t);
  requestAnimationFrame(() => t.classList.add("on"));
  setTimeout(() => { t.classList.remove("on"); t.classList.add("off"); setTimeout(() => t.remove(), 700); }, a.level === "critical" ? 9000 : 6000);
  while (el.toasts.children.length > 3) el.toasts.lastChild.remove();
}
function critical(a) {
  clear(el.critical).append(h("div", { class: "cr-in" }, h("span", { class: "cr-tag" }, "High alert · ज़रूरी सूचना"), h("b", {}, a.title), h("p", {}, a.body),
    h("button", { onclick: () => el.critical.classList.remove("on") }, "OK")));
  el.critical.classList.add("on");
  setTimeout(() => el.critical.classList.remove("on"), 9000);
}
function pulseEdge(level = "info") {
  el.edge.className = `pv-edge on ${level}`;
  clearTimeout(el.edge._t);
  el.edge._t = setTimeout(() => { el.edge.className = "pv-edge"; }, 2600);
}

let actx = null;
function unlockAudio() {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch { actx = null; }
}
// A soft two-note chime (three for critical alerts), synthesised: no audio files.
function chime(level) {
  if (!PREF.sound || !actx || actx.state !== "running") return;
  const notes = level === "critical" ? [880, 659.25, 523.25] : level === "good" ? [523.25, 783.99] : [659.25, 880];
  const t0 = actx.currentTime + 0.02;
  const out = actx.createGain(); out.gain.value = 0.18; out.connect(actx.destination);
  notes.forEach((f, i) => {
    const t = t0 + i * 0.16;
    for (const [mult, amp] of [[1, 1], [2, 0.18], [3.01, 0.07]]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.5);
    }
  });
}
function say(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/–/g, " to "));
    u.lang = PREF.lang; u.rate = 0.98; u.pitch = 1;
    const v = speechSynthesis.getVoices().find(x => x.lang === PREF.lang) || speechSynthesis.getVoices().find(x => x.lang.startsWith(PREF.lang.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

async function share() {
  const j = journey();
  const md = j.row(j.d), dS = stn(j.tr.stops[j.d].code);
  const text = md ? `${j.tr.number} ${j.tr.name} is expected at ${dS.name} at ${tm(md.med)} (likely ${tm(md.lo)}–${tm(md.hi)}), according to Kalyon. Leave home by ${tm(md.lo - J.pick)}. (Kalyon demonstrator: replay of synthetic data.)`
    : `${j.tr.number} is due at ${dS.name} at ${tm(j.SA(j.d))} by the timetable. (Kalyon demonstrator: replay of synthetic data.)`;
  try { if (navigator.share) { await navigator.share({ title: "Pick-up plan", text }); return; } } catch { /* cancelled */ }
  try { await navigator.clipboard.writeText(text); toast({ level: "good", title: "Copied", body: "The pick-up plan is on your clipboard.", t: j.now }); } catch { toast({ level: "info", title: "Pick-up plan", body: text, t: j.now }); }
}

// ------------------------------------------------------------------------------------------
// Scenes, sections, intro
// ------------------------------------------------------------------------------------------
const SEC_LOOK = { hero: [0.8, 0.0], live: [0.75, 0.5], saathi: [0.9, 1.4], road: [0.5, 0.15], alerts: [0.85, 1.1], pickup: [0.6, 0.4], arrive: [0.7, 0.0] };
function sceneFor(sec, j) {
  if (sec === "hero") return ["hero", {}];
  if (sec === "road") return ["tracks", {}];
  if (sec === "pickup" || sec === "arrive") return [CITY[j.tr.stops[j.d].code] || (j.night ? "platform" : "hero"), {}];
  return sceneForState(j);
}
let sceneKey = "";
function updateScene(j = journey()) {
  if (!eng || !introDone) return;
  const [key, over] = sceneFor(activeSec, j);
  const k2 = key + JSON.stringify(over);
  if (k2 === sceneKey) return;
  const kindFlood = sceneKey.startsWith("hero") && key !== "hero";
  sceneKey = k2;
  Promise.resolve(eng.show(key, { over, kind: kindFlood ? "flood" : "dissolve", duration: kindFlood ? 2.0 : 1.7 })).catch(e => console.warn("scene", key, e));
  const look = SEC_LOOK[activeSec] || [0.7, 0.4];
  eng.focus(look[0], look[1]);
  root.dataset.scene = key;
}

function observeSections() {
  const ratio = new Map();
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      ratio.set(e.target.dataset.sec, e.isIntersecting ? e.intersectionRatio * Math.min(1, e.intersectionRect.height / window.innerHeight * 2) : 0);
      if (e.isIntersecting && e.intersectionRatio > 0.12) e.target.classList.add("in");
    }
    let best = null, bv = 0;
    for (const [k, v] of ratio) if (v > bv) { best = k; bv = v; }
    if (best && best !== activeSec) { activeSec = best; root.dataset.active = best; updateScene(); }
  }, { threshold: [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
  $$(".pv-sec", root).forEach(sct => io.observe(sct));
}

let lastY = 0;
function onScroll() {
  if (app.view !== "passenger") return;
  const y = window.scrollY, vh = window.innerHeight;
  if (eng) eng.nudge((y - lastY) / vh);
  lastY = y;
  const hero = $(".pv-hero-in", root);
  if (hero && y < vh * 1.2) {
    const p = Math.min(1, y / (vh * 0.9));
    hero.style.transform = `translateY(${p * -60}px) scale(${1 - p * 0.04})`;
    hero.style.opacity = String(1 - p * 0.9);
    hero.style.filter = p > 0.02 ? `blur(${p * 6}px)` : "";
  }
}

async function enter() {
  if (!built) build();
  if (eng) eng.resume();
  lastMinute = -1;
  refresh(true, true);
  if (introDone) { sceneKey = ""; updateScene(); return; }
  let seen = false;
  try { seen = sessionStorage.getItem("kalyon-pv-intro") === "1"; } catch { /* storage blocked */ }
  if (!eng || reduce || seen) { finishIntro(); return; }
  // wait for the boot screen to clear, so the opening is actually seen
  for (let i = 0; i < 100 && !document.getElementById("loader")?.classList.contains("done"); i++) await wait(100);
  if (app.view !== "passenger" || introDone) return;
  root.classList.add("intro");
  eng.exposure(0, true);
  try { await eng.show("loco"); } catch (e) { console.warn(e); finishIntro(); return; }
  eng.load("hero").catch(() => {});
  eng.focus(0.8, 0);
  eng.exposure(1);
  el.intro.classList.add("l1");
  await wait(1700);
  if (introDone) return;
  el.intro.classList.add("l2");
  await wait(1500);
  if (introDone) return;
  Promise.resolve(eng.show("hero", { kind: "flood", duration: 2.2 })).catch(() => {});
  el.intro.classList.add("out");
  await wait(1100);
  finishIntro();
}
function skipIntro() { finishIntro(); }
function finishIntro() {
  if (introDone) return;
  introDone = true;
  try { sessionStorage.setItem("kalyon-pv-intro", "1"); } catch { /* storage blocked */ }
  root.classList.remove("intro");
  el.intro.classList.add("gone");
  if (eng) eng.exposure(1);
  $(".pv-hero", root).classList.add("in");
  sceneKey = "";
  updateScene();
}
const wait = ms => new Promise(r => setTimeout(r, ms));

export { SCENES };
