// Passenger tab: what a traveller would see. Same replay clock, same Kalyon forecasts and the same
// rules as the Station board (Kalyon ETA = forecast median, "be on the platform by" = low end of the
// range, arrived trains show their actual time). Tips and alerts are worded from those numbers only.
// Presentation: one continuous three.js world (pv/chapters.js) that the camera flies through as you scroll.
import * as O from "./optimise.js?v=202611111558";
import { h, s, $, $$, clear, hhmm, dayLabel, mins, VER } from "./ui.js?v=202611111558";
import { webglOK } from "./fx.js?v=202611111558";

let app, root, eng = null, D = null, stageMod = null;
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
  // For the match test against the Station board: the exact strings the Passenger tab shows.
  app.passengerModel = (run, b, d) => { if (run !== undefined) { J.run = run; J.b = b; J.d = d; } const j = journey(); return { phase: j.phase, pass: passModel(j), led: ledModel(j), road: roadModel(j), range: rangeModel(j), pick: pickModel(j) }; };
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
  const canvas = el.canvas = h("canvas", { class: "pv-canvas", "aria-hidden": "true" });
  root.append(
    canvas,
    el.fallback = h("div", { class: "pv-fallback", "aria-hidden": "true" }),
    el.scrim = h("div", { class: "pv-scrim", "aria-hidden": "true" }),
    el.edge = h("div", { class: "pv-edge", "aria-hidden": "true" }),
    el.critical = h("div", { class: "pv-critical", role: "alert", "aria-live": "assertive" }),
    el.toasts = h("div", { class: "pv-toasts", "aria-live": "polite" }),
    h("div", { class: "pv-honest" }, h("i"), "Demo journey · replay of synthetic data · not live tracking"),
    clockBar(),
    saathiBubble(),
    el.intro = h("div", { class: "pv-intro", "aria-hidden": "true" },
      h("p", { class: "pv-intro-l1" }, "The display says: running late."),
      h("p", { class: "pv-intro-l2" }, "Kalyon tells you when."),
      h("button", { class: "pv-skip", onclick: () => skipIntro() }, "Skip")),
    h("div", { class: "pv-wrap" },
      heroSec(), tunnelSec(), boardSec(), liveSec(), ledSec(), passSec(), corridorSec(), roadSec(), saathiSec(), weatherSec(), riverSec(), alertSec(), pickupSec(), arriveSec(),
      h("footer", { class: "pv-foot" },
        h("p", {}, "Everything on this page comes from Kalyon’s models running in your browser on a replay of calibrated synthetic data for the Dehradun corridor. It is not live train tracking. Trains, numbers and timetables are invented for the demonstrator."),
        h("p", { class: "pv-credits" }, "Photographs gathered by the team from public sources for this non-commercial student project, enlarged with an AI super-resolution model (EDSR) and given depth with Depth Anything V2. Locomotive photo: Somanko. Night-berth video: Nemo’s Dreamscapes. Bareilly image: Kupi AI."))));
  if (!webglOK()) root.classList.add("no-gl");
  observeSections();
  // chapter spans move whenever content above them changes height (tips, road list, alerts)
  new ResizeObserver(() => { measureChapters(); onScroll(); }).observe($(".pv-wrap", root));
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { measureChapters(); onScroll(); }, { passive: true });
  pickDefault();
  fillPicker();
  onJourney(true);
}

// ------------------------------------------------------------------------------------------
// Saathi, always at hand: a floating orb on every part of the Passenger tab. Tap it for quick answers.
// Every answer is built from the same model functions as the cards (passModel, pickModel, rangeModel,
// tipsModel, alerts), so Saathi can never say a different number from the Station board.
// ------------------------------------------------------------------------------------------
const ASK = [
  ["arrive", "When will I arrive?", "कब पहुँचूँगा?"],
  ["leave", "When should I leave home?", "घर से कब निकलूँ?"],
  ["late", "Is my train late?", "क्या ट्रेन लेट है?"],
  ["why", "Why this time?", "यह समय क्यों?"],
  ["alerts", "Any alerts?", "कोई सूचना?"],
  ["weather", "Weather on the line?", "रास्ते का मौसम?"],
];
function saathiAnswer(k) {
  const j = journey(), P = passModel(j), pk = pickModel(j), R = rangeModel(j);
  const tr = j.tr.number, dN = P.to.name, bN = P.from.name;
  if (k === "arrive") {
    if (j.phase === "arrived") return `${tr} arrived at ${dN} at ${P.cells[0][1]}. The timetable said ${P.to.time}.`;
    if (j.phase === "notdeparted") return `I give my first forecast when ${tr} leaves ${stn(j.tr.stops[0].code).name}. Until then, the timetable says ${P.to.time} at ${dN}.`;
    return `Kalyon expects ${tr} at ${dN} at ${P.cells[0][1]}, most likely between ${P.cells[1][1].replace("–", " and ")}. The timetable says ${P.to.time}.`;
  }
  if (k === "leave") {
    if (pk.state === "arrived") return `${tr} has already reached ${dN} (${tm(pk.arrived)}). Head to the exit gate.`;
    if (pk.state === "nofc") return `I can plan this once ${tr} has left its first station. For now the timetable says ${tm(pk.sched)} at ${dN}.`;
    return `If the station is ${pk.travel} min from home, leave by ${tm(pk.leave)}. That puts you on the platform by ${tm(pk.platform)}, the earliest ${tr} is likely to arrive. You can change the travel time in “Picking someone up?”.`;
  }
  if (k === "late") {
    const run = P.cells[2][1];
    if (run === "not started") return `${tr} has not started yet. It is timetabled to leave ${stn(j.tr.stops[0].code).name} at ${tm(j.SD(0))}.`;
    if (j.phase === "arrived") return `${tr} has arrived at ${dN}: ${P.cells[0][1]} against a timetable of ${P.to.time}.`;
    return run === "on time" ? `${tr} is running on time at the moment.` : `${tr} is running ${run} at the moment. Kalyon’s time for ${dN} already allows for it: ${P.cells[0][1]}.`;
  }
  if (k === "why") {
    const w = tipsModel(j).find(t => t.icon === "why");
    if (w) return `${w.title}: ${w.body} (${w.src})`;
    return R ? `Kalyon reads ${tr}’s running reports, the weather and the line ahead. Its likely range at ${R.at} is ${tm(R.lo)} to ${tm(R.hi)}.` : `Kalyon reads the running reports, the weather and the line ahead; it starts once ${tr} has left.`;
  }
  if (k === "alerts") {
    const live = alerts.filter(a => !a.quiet);
    if (!live.length) return `No alerts yet. I will tell you the moment the arrival moves by 10 minutes or more, when you are 30 minutes out, and when fog, rain or rescheduling affects you.`;
    return `${live.length === 1 ? "One alert" : `${live.length} alerts`} so far. The latest, at ${tm(live[0].t)}: ${live[0].title}. ${live[0].body}`;
  }
  const W = weatherWords(j);
  return `${W.head} ${W.body}`;
}
function saathiBubble() {
  const orb = h("button", { class: "sa-orb", "aria-label": "Ask Saathi, your travel companion", "aria-expanded": "false", "aria-controls": "sa-panel", onclick: () => saathiOpen(!el.sa.classList.contains("open")) },
    h("span", { class: "sa-core" }), h("span", { class: "sa-ring" }), h("span", { class: "sa-ring r2" }), h("i", { class: "sa-dot" }));
  el.saSay = h("div", { class: "sa-say", "aria-live": "polite", onclick: () => saathiOpen(true) });
  el.saLog = h("div", { class: "sa-log" });
  el.sa = h("div", { class: "sa" },
    h("div", { class: "sa-panel glass", id: "sa-panel", role: "dialog", "aria-label": "Saathi" },
      h("div", { class: "sa-head" },
        h("span", { class: "sa-mini" }),
        h("div", {}, h("b", {}, "Saathi ", h("span", { class: "hi" }, "साथी")), h("small", {}, "Answers from Kalyon’s forecast for your train")),
        h("button", { class: "sa-x", "aria-label": "Close Saathi", onclick: () => saathiOpen(false) }, "×")),
      el.saLog,
      h("div", { class: "sa-chips" }, ...ASK.map(([k, en, hi]) => h("button", { class: "sa-chip", onclick: () => saathiAsk(k, en, hi) }, en))),
      h("div", { class: "sa-foot" },
        h("button", { class: "sa-link", onclick: () => { saathiOpen(false); const sec = $('[data-sec="saathi"]', root); if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY, behavior: reduce ? "auto" : "smooth" }); } }, "All of today’s tips ↓"),
        h("span", {}, "Replay of synthetic data"))),
    el.saSay, orb);
  el.saOrb = orb;
  addEventListener("keydown", e => { if (e.key === "Escape" && el.sa.classList.contains("open")) { saathiOpen(false); orb.focus(); } });
  return el.sa;
}
function saathiOpen(on) {
  el.sa.classList.toggle("open", on);
  el.saOrb.setAttribute("aria-expanded", String(on));
  el.sa.classList.remove("unread");
  if (on) {
    el.saSay.classList.remove("on");
    if (!el.saLog.children.length) saathiReply(`Namaste. I am Saathi. Ask me about ${journey().tr.number}, ${passModel(journey()).from.name} to ${passModel(journey()).to.name}.`);
    $(".sa-chip", el.sa)?.focus({ preventScroll: true });
  }
}
function saathiReply(text) {
  el.saLog.append(h("p", { class: "sa-a" }, text));
  while (el.saLog.children.length > 12) el.saLog.firstChild.remove();
  el.saLog.scrollTop = el.saLog.scrollHeight;
}
function saathiAsk(k, en, hi) {
  el.saLog.append(h("p", { class: "sa-q" }, PREF.lang.startsWith("hi") ? hi : en));
  const a = saathiAnswer(k);
  saathiReply(a);            // added at once, so answers always follow their questions; CSS fades it in
  if (PREF.voice) say(a);
}
// A short speech bubble beside the orb (an alert, or the first hello).
let saT = 0;
function saathiPop(text, level = "") {
  if (!el.sa || el.sa.classList.contains("open")) return;
  el.saSay.textContent = text;
  el.saSay.className = `sa-say on ${level}`;
  el.sa.classList.add("unread");
  el.sa.dataset.lv = level;
  clearTimeout(saT);
  saT = setTimeout(() => el.saSay.classList.remove("on"), level === "critical" ? 9000 : 6500);
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

// Cinematic chapters: tall scroll spans with a caption pinned in place while the camera travels.
function tunnelSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-tunnel", "data-sec": "tunnel", "aria-label": "Into the forecast" },
    h("div", { class: "pv-cap" },
      h("p", { class: "pv-kicker" }, "Inside the timetable · समय-सारणी के भीतर"),
      h("h2", { class: "pv-h2" }, "A timetable is a promise."),
      h("p", { class: "pv-cap-l" }, "Kalyon checks it against every running report your train sends, and tells you what is likely to really happen."),
      el.tunCap = h("p", { class: "pv-cap-src" })));
}
function boardSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-board", "data-sec": "board", "aria-label": "Boarding" },
    h("div", { class: "pv-cap low" },
      h("p", { class: "pv-kicker" }, "Step aboard · सवार हों"),
      el.boardCap = h("h2", { class: "pv-h2" }, ""),
      el.boardCapHi = h("p", { class: "pv-hi" }, "")));
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
  );
}

// Chapters 5 and 6: the coach's LED display and the boarding pass, both drawn in 3D from the same
// model as the HTML. A short text twin is kept for screen readers.
function ledSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-led", "data-sec": "led", "aria-label": "Coach display" },
    h("div", { class: "pv-cap low" },
      h("p", { class: "pv-kicker" }, "On the coach display · डिब्बे का डिस्प्ले"),
      el.ledCap = h("p", { class: "pv-cap-l" }, "")));
}
function passSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-pass", "data-sec": "pass", "aria-label": "Boarding pass" },
    h("div", { class: "pv-cap low" },
      h("p", { class: "pv-kicker" }, "Your pass · यात्री पास"),
      el.passCap = h("p", { class: "pv-cap-l" }, "")));
}
// Chapters 7 and 8: out of the window and up over the whole corridor; the time scrubber lives here.
function corridorSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-map", "data-sec": "corridor", "aria-label": "The corridor" },
    h("div", { class: "pv-map-ui" },
      h("div", { class: "pv-map-head" },
        h("p", { class: "pv-kicker" }, "The whole line · पूरी लाइन"),
        h("h2", { class: "pv-h2" }, "Drag time. Watch your train move."),
        el.mapNote = h("p", { class: "pv-cap-src" }, "")),
      el.ribbon = h("div", { class: "pv-ribbon glass" }),
      h("div", { class: "pv-scrub glass" },
        h("div", { class: "pv-scrub-top" }, h("span", {}, "Drag through the journey"), el.scrubT = h("b", {}, "--:--")),
        el.scrub = h("input", { type: "range", min: 0, max: 1440, step: 1, "aria-label": "Replay time", oninput: e => { dragging = true; clearTimeout(dragT); dragT = setTimeout(() => { dragging = false; refresh(true, true); }, 350); app.seek(+e.target.value); } }),
        el.scrubMarks = h("div", { class: "pv-scrub-marks" }))));
}
// Chapters 11 and 12: the day's weather, and the forecast range as a river of light.
function weatherSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-weather", "data-sec": "weather", "aria-label": "Weather on the line" },
    h("div", { class: "pv-cap" },
      h("p", { class: "pv-kicker" }, "Weather on the line · मौसम"),
      el.wxHead = h("h2", { class: "pv-h2" }, ""),
      el.wxCap = h("p", { class: "pv-cap-l" }, ""),
      h("p", { class: "pv-cap-src" }, "Weather recorded in the replay data.")));
}
function riverSec() {
  return h("section", { class: "pv-sec pv-ch pv-ch-river", "data-sec": "river", "aria-label": "The likely range" },
    h("div", { class: "pv-cap low" },
      h("p", { class: "pv-kicker" }, "The likely range · संभावित समय"),
      el.riverHead = h("h2", { class: "pv-h2" }, ""),
      el.riverCap = h("p", { class: "pv-cap-l" }, "")));
}

function saathiSec() {
  el.voiceBtn = h("button", { class: "pv-toggle", "aria-pressed": "false", onclick: e => { unlockAudio(); PREF.voice = !PREF.voice; e.currentTarget.setAttribute("aria-pressed", String(PREF.voice)); if (PREF.voice) say(PREF.lang.startsWith("hi") ? "साथी की आवाज़ चालू है।" : "Saathi will read your alerts aloud."); } }, "Speak alerts");
  el.langBtn = h("button", { class: "pv-toggle", onclick: e => { PREF.lang = PREF.lang === "en-IN" ? "hi-IN" : "en-IN"; e.currentTarget.textContent = PREF.lang === "en-IN" ? "English" : "हिन्दी"; } }, "English");
  return h("section", { class: "pv-sec pv-saathi", "data-sec": "saathi" },
    h("div", { class: "pv-saathi-pin" },
      h("div", { class: "pv-sec-head" },
        h("p", { class: "pv-kicker rv" }, "Saathi · साथी"),
        h("h2", { class: "pv-h2" }, words("Your travel companion.")),
        h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Every tip is worked out from Kalyon’s latest forecast for your train. Nothing is guessed, and each one says where it came from."),
        h("div", { class: "pv-voice rv", style: "--d:.4s" }, el.voiceBtn, el.langBtn)),
      el.shapeNote = h("p", { class: "pv-shape-note", "aria-live": "polite" }),
      el.tips = h("div", { class: "pv-tips" }),
      el.tipDots = h("div", { class: "pv-tip-dots", "aria-hidden": "true" })));
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
  return h("section", { class: "pv-sec pv-alerts pv-capped", "data-sec": "alerts" },
    // 3D mode: while the signal holds the screen, this pinned caption says what its colour means
    h("div", { class: "pv-cap sig", "aria-hidden": "true" },
      h("p", { class: "pv-kicker" }, "The signal · सिग्नल"),
      el.sigCap = h("p", { class: "pv-cap-l" }, ""),
      h("p", { class: "pv-cap-src" }, "Green: nothing serious · Yellow: a warning · Red: a critical alert")),
    h("div", { class: "pv-sec-head" },
      h("p", { class: "pv-kicker rv" }, "Alerts · सूचनाएँ"),
      h("h2", { class: "pv-h2" }, words("Told the moment it changes.")),
      h("p", { class: "pv-lede rv", style: "--d:.3s" }, "Kalyon re-forecasts each time your train leaves a station. You hear about it when the arrival moves by 10 minutes or more, when the train reaches your station, when you are 30 minutes out, and when fog, rain or rescheduling affects you."),
      h("div", { class: "pv-voice rv", style: "--d:.4s" }, t("sound", "Sound"), t("vib", "Vibrate"),
        h("button", { class: "pv-go small", onclick: () => { unlockAudio(); app.speed = 15; $$(".pv-speed button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === 15))); app.play(true); } }, "Play the journey at 15×", h("span", {}, "▶")))),
    el.sigNote = h("p", { class: "pv-sig-note" }),
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
  const fc = k >= 0 ? app.forecast(run, k, false) : null;
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
  stageJourney(j);
  refresh(true, true);
}

// Everything the 3D world shows, as text and numbers computed here with the Station-board rules.
// The world only draws these strings; it never computes a time of its own.
const CITY_IMG = { DDN: "city-dehradun", HW: "city-haridwar", MB: "city-moradabad", BE: "city-bareilly", LKO: "city-lucknow", NDLS: "city-newdelhi" };
function ledModel(j) {
  const { tr, d } = j, dS = stn(tr.stops[d].code), md = j.row(d);
  if (j.phase === "arrived") return { old: [`${tr.number} ${dS.name.toUpperCase()}`, `TIMETABLE ${tm(j.SA(d))}`], now: [`ARRIVED ${tm(j.A(d))}`, dS.name.toUpperCase()] };
  if (md) return { old: [`${tr.number} ${dS.name.toUpperCase()}`, `EXPECTED ${tm(md.b1)}`], now: [`KALYON ETA ${tm(md.med)}`, `LIKELY ${tm(md.lo)}-${tm(md.hi)}`] };
  return { old: [`${tr.number} ${dS.name.toUpperCase()}`, `TIMETABLE ${tm(j.SA(d))}`], now: [`TIMETABLE ${tm(j.SA(d))}`, "FORECAST AFTER DEPARTURE"] };
}
function rangeModel(j) {
  const { tr, b, d } = j;
  if (j.phase === "onboard") { const r = j.row(d); return r && { ...r, at: stn(tr.stops[d].code).name }; }
  if (j.phase === "waiting") { const r = j.row(b); return r && { ...r, at: stn(tr.stops[b].code).name }; }
  return null;
}
function weatherWords(j) {
  const v = j.wx.visibility ?? 10, r = j.wx.rain ?? 0;
  const head = v < 1 ? "Dense fog on the line." : r > 20 ? "Heavy rain on the line." : r > 2 ? "Light rain on the line." : "Dry, with good visibility.";
  const vis = v < 1 ? `${(v * 1000).toFixed(0)} m` : `${v.toFixed(1)} km`;
  const tail = v < 1 ? "Trains run at fog-safe speeds after dark; Kalyon’s forecast already includes it." : r > 20 ? "Kalyon’s forecast includes it." : "Weather is one of the things Kalyon reads in every forecast.";
  return { head, body: `Visibility around ${vis}, ${r.toFixed(0)} mm of rain${j.wx.festival === 1 ? ", festival crowds" : ""} today. ${tail}` };
}
let lastStageKey = "";
function stageData(j) {
  const P = passModel(j), led = ledModel(j), R = rangeModel(j), W = weatherWords(j);
  if (el.ledCap) el.ledCap.textContent = `${led.now[0]} · ${led.now[1]}`;
  if (el.wxHead) { el.wxHead.textContent = W.head; el.wxCap.textContent = W.body; }
  if (el.riverHead) {
    if (R) { el.riverHead.textContent = `${tm(R.lo)} to ${tm(R.hi)}`; el.riverCap.textContent = `The likely range at ${R.at}: 4 times in 5 the real arrival lands inside it. Timetable ${tm(R.sched)} · today’s display ${tm(R.b1)} · Kalyon ${tm(R.med)}.`; }
    else if (j.phase === "arrived") { el.riverHead.textContent = `Arrived ${tm(j.A(j.d))}`; el.riverCap.textContent = `${j.tr.number} reached ${stn(j.tr.stops[j.d].code).name}, ${mins(j.A(j.d) - j.SA(j.d))} after the timetable.`; }
    else { el.riverHead.textContent = "No range yet."; el.riverCap.textContent = `Kalyon gives its first forecast when ${j.tr.number} leaves ${stn(j.tr.stops[0].code).name}. Until then: timetable ${tm(j.SA(j.d))}.`; }
  }
  if (el.sigNote) {
    const lv = alerts.some(a => a.level === "critical" && !a.quiet) ? "red" : alerts.some(a => a.level === "warn") ? "yellow" : "green";
    el.sigNote.dataset.lv = lv;
    el.sigCap.textContent = lv === "red" ? "Red. You have a critical alert for this journey." : lv === "yellow" ? "Yellow. There is a warning for this journey." : "Green. Nothing serious on your journey right now.";
    el.sigNote.textContent = lv === "red" ? "The signal is red: you have a critical alert below." : lv === "yellow" ? "The signal is yellow: there is a warning for your journey below." : "The signal is green: nothing serious on your journey right now.";
  }
  if (el.mapNote) el.mapNote.textContent = `${j.tr.stops.length} stations, ${Math.round(j.tr.stops[j.tr.stops.length - 1].km)} km. Position from the replay at ${tm(j.now)}.`;
  if (!eng) return;
  const pk = pickModel(j);
  const worst = alerts.some(a => a.level === "critical" && !a.quiet) ? "critical" : alerts.some(a => a.level === "warn") ? "warn" : "ok";
  eng.setData({
    hour: j.hour, night: j.night, phase: j.phase, now: tm(j.now),
    led, pass: P, road: roadModel(j), km: trainKm(j), b: j.b, d: j.d, number: j.tr.number,
    tips: tipsModel(j).map(t => t.icon),
    wx: { vis: j.wx.visibility ?? 10, rain: j.wx.rain ?? 0, fest: j.wx.festival === 1 },
    range: R && { lo: R.lo, hi: R.hi, med: R.med, sched: R.sched, b1: R.b1, labels: { lo: tm(R.lo), hi: tm(R.hi), med: tm(R.med), sched: tm(R.sched), b1: tm(R.b1) } },
    rangeNote: R ? null : j.phase === "arrived" ? { label: `Arrived ${tm(j.A(j.d))}`, t: tm(j.SA(j.d)) } : { label: `Timetable ${tm(j.SA(j.d))}`, t: tm(j.SA(j.d)) },
    alert: worst,
    dest: { code: j.tr.stops[j.d].code, name: stn(j.tr.stops[j.d].code).name, hi: stn(j.tr.stops[j.d].code).name_hi, img: CITY_IMG[j.tr.stops[j.d].code] || "platform-night" },
    pick: pk.state === "fc" ? { state: "fc", leave: tm(pk.leave), platform: tm(pk.platform), likely: tm(pk.likely), lo: tm(pk.lo), hi: tm(pk.hi), m: [pk.leave, pk.platform, pk.likely, pk.lo, pk.hi], travel: pk.travel }
      : pk.state === "arrived" ? { state: "arrived", arrived: tm(pk.arrived) } : { state: "nofc", sched: tm(pk.sched) },
  });
}

// Signs in the world and the tunnel's streaming labels, all from the selected journey's timetable.
function tunnelLabels(j) {
  const out = [];
  const add = (tr, mine) => tr.stops.forEach((st, i) => {
    const t = i === 0 ? st.dep : st.arr;
    out.push([`${tr.number} ${st.code} ${hhmm(t)}`, `${Math.round(st.km)} KM`]);
    if (mine && st.dep !== null && i > 0) out.push([`${st.code} DEP ${hhmm(st.dep)}`, stn(st.code).name.toUpperCase()]);
  });
  add(j.tr, true);
  for (const r of runsNow()) if (r.train !== j.tr.number && out.length < 64) add(app.trains[r.train], false);
  return out.slice(0, 64);
}
function stageJourney(j) {
  const bS = stn(j.tr.stops[j.b].code);
  if (el.boardCap) { el.boardCap.textContent = `Your journey begins at ${bS.name}.`; el.boardCapHi.textContent = `आपकी यात्रा ${bS.name_hi} से शुरू होती है।`; }
  if (el.tunCap) el.tunCap.textContent = `Streaming past: the timetables of today’s ${runsNow().length} replayed trains, starting with ${j.tr.number}.`;
  if (eng) eng.setJourney({ boardEn: bS.name, boardHi: bS.name_hi, number: j.tr.number, name: j.tr.name, nameHi: j.tr.name_hi, labels: tunnelLabels(j) });
}

function seedFired(j) {
  if (j.phase === "atplatform") fired.add("platform");
  if (j.phase === "arrived") fired.add("arrived");
  const md = j.row(j.d);
  if (j.phase === "onboard" && md && md.med - j.now <= 30) fired.add("arr30");
  if (j.wx.visibility < 1) fired.add("fog");
}

let dragging = false, dragT = 0, rafPending = false;
function refresh(jumped, force = false) {
  if (dragging && !force) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; const j = journey(); el.clock.textContent = tm(j.now); renderLive(j); stageData(j); });
    return;
  }
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
  stageData(j);
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
  renderScrub(j);
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

// One model per card, used by both the HTML and the 3D world, so the two can never disagree.
function passModel(j) {
  const { tr, b, d } = j;
  const bS = stn(tr.stops[b].code), dS = stn(tr.stops[d].code);
  const md = j.row(d);
  const late = j.st.state === "waiting" ? null : j.st.delay;
  const line = planLine(j);
  return {
    number: tr.number, name: tr.name, nameHi: tr.name_hi, phase: j.phase,
    live: j.phase === "arrived" ? "Arrived" : j.phase === "notdeparted" ? "Scheduled" : "Live replay",
    from: { code: tr.stops[b].code, name: bS.name, hi: bS.name_hi, time: b === 0 ? tm(j.SD(0)) : tm(j.SA(b)) },
    to: { code: tr.stops[d].code, name: dS.name, hi: dS.name_hi, time: tm(j.SA(d)) },
    cells: [
      ["Kalyon ETA", j.phase === "arrived" ? tm(j.A(d)) : md ? tm(md.med) : "after departure"],
      ["Likely range", md && j.phase !== "arrived" ? `${tm(md.lo)}–${tm(md.hi)}` : "—"],
      ["Running", late === null ? "not started" : late < 5 ? "on time" : `${Math.round(late)} min late`],
      ["Planned line", line ? `Line ${line} at ${dS.name}` : "—"]],
    foot: line ? "Line from Kalyon’s Optimisation Lab plan; station layout assumed." : "Synthetic train and timetable for the demonstrator.",
  };
}
function renderPass(j) {
  const P = passModel(j);
  clear(el.pass).append(
    h("div", { class: "pp-top" }, h("span", { class: "pp-brand" }, "KALYON", h("i", {}, " यात्री पास")), h("span", { class: `pp-live ${P.phase}` }, h("i"), P.live)),
    h("div", { class: "pp-train" }, h("b", {}, P.number), h("div", {}, h("span", {}, P.name), h("span", { class: "hi" }, P.nameHi))),
    h("div", { class: "pp-route" },
      h("div", {}, h("b", {}, P.from.code), h("span", {}, P.from.name), h("em", {}, P.from.time)),
      h("div", { class: "pp-line", html: `<svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M2 10H118" stroke-dasharray="3 5"/></svg>${I.train}` }),
      h("div", { class: "r" }, h("b", {}, P.to.code), h("span", {}, P.to.name), h("em", {}, P.to.time))),
    h("div", { class: "pp-perf" }, h("i"), h("i")),
    h("div", { class: "pp-grid" }, ...P.cells.map(([a, v]) => h("div", {}, h("span", {}, a), h("b", {}, v)))),
    h("p", { class: "pp-foot" }, P.foot));
  if (el.passCap) el.passCap.textContent = `${P.number} ${P.from.name} → ${P.to.name}. ${P.cells.map(([a, v]) => `${a}: ${v}`).join(". ")}.`;
}

function renderScrub(j) {
  if (!el.scrub) return;
  const w0 = app.w0(), n = j.run.ev.length;
  const a = Math.max(0, Math.floor(j.run.ev[0][2] + j.run.ev[0][4] - 40));
  const b = Math.min(1440, Math.ceil(j.run.ev[n - 1][1] + j.run.ev[n - 1][3] + 40));
  if (+el.scrub.min !== a || +el.scrub.max !== b) {
    el.scrub.min = a; el.scrub.max = b;
    clear(el.scrubMarks).append(...j.tr.stops.map((st, i) => {
      const tt = i === 0 ? j.run.ev[0][2] + j.run.ev[0][4] : j.run.ev[i][1] + j.run.ev[i][3];
      const f = (tt - a) / (b - a);
      return f >= 0 && f <= 1 ? h("i", { style: `left:${f * 100}%`, class: i === j.b || i === j.d ? "mine" : "", title: app.stations[st.code].name }) : null;
    }).filter(Boolean));
  }
  el.scrub.value = app.t;
  el.scrub.style.setProperty("--p", `${((app.t - a) / (b - a)) * 100}%`);
  el.scrubT.textContent = `${tm(w0 + app.t)} · ${j.phase === "onboard" ? "on board" : j.phase === "arrived" ? "arrived" : j.phase === "atplatform" ? "at your platform" : j.phase === "waiting" ? "train on its way" : "before departure"}`;
}

// Where the train is along its route, in km (the ribbon and the 3D corridor both use this).
function trainKm(j) {
  const km = j.tr.stops.map(s0 => s0.km), tot = km[km.length - 1];
  if (j.st.state === "running") return km[j.st.from] + (km[j.st.to] - km[j.st.from]) * j.st.p;
  if (j.st.state === "dwell") return km[j.st.at];
  if (j.st.state === "done") return tot;
  return 0;
}
function renderRibbon(j) {
  const { tr, run } = j;
  const stops = tr.stops, n = stops.length;
  const km = stops.map(s0 => s0.km), tot = km[n - 1];
  const X = v => 3 + (v / tot) * 94;
  const pos = trainKm(j);
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

function tip(icon, title, body, src, tone = "") { return { icon, title, body, src, tone }; }
// What Saathi's particle sculpture turns into for each kind of tip, and what that shape means.
const SHAPE_OF = { clock: "clock", home: "clock", trend: "wave", range: "wave", fog: "fog", rain: "rain", crowd: "crowd" };
const SHAPE_SAYS = {
  clock: "Saathi becomes a clock: this tip is about timing.",
  wave: "Saathi becomes a rising wave: this tip is about how your arrival time is moving.",
  fog: "Saathi becomes drifting fog: this tip is about visibility on the line.",
  rain: "Saathi becomes falling rain: this tip is about rain on the line.",
  crowd: "Saathi becomes a crowd: this tip is about festival crowds.",
  sphere: "Saathi at rest: a note about your journey.",
};
let tipIdx = -1;
function showTip(i) {
  const cards = el.tips ? [...el.tips.children] : [];
  if (!cards.length) return;
  i = Math.max(0, Math.min(cards.length - 1, i));
  if (i === tipIdx && cards[i].classList.contains("act")) return;
  tipIdx = i;
  cards.forEach((c, k) => c.classList.toggle("act", k === i));
  [...el.tipDots.children].forEach((d, k) => d.classList.toggle("on", k === i));
  el.shapeNote.textContent = SHAPE_SAYS[SHAPE_OF[cards[i].dataset.icon] || "sphere"];
}
function tipEl(t) {
  return h("article", { class: `pv-tip glass ${t.tone}` }, h("div", { class: "ico", html: I[t.icon] }), h("div", {}, h("b", {}, t.title), h("p", {}, t.body), t.src ? h("small", {}, t.src) : null));
}

function tipsModel(j) {
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
    const why = reasons(app.forecast(j.run, j.k, true).find(x => x.s === d));
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
  return out;
}
function renderTips(j) {
  const model = tipsModel(j);
  const key = model.map(x => x.title + x.body).join("|");
  if (key === el.tips._key) return;
  el.tips._key = key;
  const out = model.map(tipEl);
  out.forEach((x, i) => { x.dataset.icon = model[i].icon; });
  clear(el.tips).append(...out);
  clear(el.tipDots).append(...model.map(() => h("i")));
  root.style.setProperty("--tips", model.length);
  tipIdx = -1; showTip(Math.max(0, saathiIdx()));
  out.forEach((x, i) => { x.style.setProperty("--i", i); requestAnimationFrame(() => x.classList.add("on")); });
  pulseEdge();
}

function reasons(row) {
  if (!row.shap) return [];
  const f = app.M.features, L = app.M.labels;
  return f.map((k, i) => [L[k], row.shap[i]]).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
}

function roadModel(j) {
  const { tr } = j;
  const out = [];
  let next = -1;
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
    if (cls !== "passed" && next < 0) next = i;
    out.push({ code: st.code, name: S.name, hi: S.name_hi, lat: S.lat, lon: S.lon, km: st.km, major: !!S.major, mine, main, sub, passed: cls === "passed", single: nextLeg > 0.5 });
  });
  out.forEach((x, i) => { x.next = i === next; });
  return out;
}
function renderRoad(j) {
  const items = roadModel(j).map((x, i) => h("li", { class: `${x.passed ? "passed" : ""} ${x.mine ? "mine" : ""}`, style: `--i:${i}` },
    h("div", { class: "dot" }),
    h("div", { class: "nm" }, h("b", {}, x.name), h("span", { class: "hi" }, x.hi), x.mine ? h("em", {}, x.mine) : null),
    h("div", { class: "tm" }, h("b", {}, x.main), h("span", {}, x.sub)),
    x.single ? h("div", { class: "leg" }, "single line to the next station") : null));
  const key = items.map(x => x.textContent).join("|");
  if (key === el.road._key) return;
  el.road._key = key;
  clear(el.road).append(...items);
}

function pickModel(j) {
  const md = j.row(j.d);
  if (j.phase === "arrived") return { state: "arrived", arrived: j.A(j.d) };
  if (!md) return { state: "nofc", sched: j.SA(j.d) };
  return { state: "fc", leave: md.lo - J.pick, platform: md.lo, likely: md.med, lo: md.lo, hi: md.hi, travel: J.pick };
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
  if (eng) eng.alert(a.level);
  saathiPop(a.title, a.level);
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
// ------------------------------------------------------------------------------------------
// The 3D world: scroll position → chapter clock T; the opening; sections
// ------------------------------------------------------------------------------------------
// Each section owns a span of the chapter clock. Hero = chapter 1 (the train forms), tunnel = 2,
// boarding = 3, then the content chapters.
const SPANS = { hero: [0, 1], tunnel: [1, 2], board: [2, 3], live: [3, 4], led: [4, 5], pass: [5, 6], corridor: [6, 8], road: [8, 9], saathi: [9, 10], weather: [10, 11], river: [11, 12], alerts: [12, 13], pickup: [13, 13.6], arrive: [13.6, 14] };
let chapters = [];
function measureChapters() {
  chapters = $$(".pv-sec", root).map(e => { const r = e.getBoundingClientRect(); return { e, top: r.top + window.scrollY, h: r.height, span: SPANS[e.dataset.sec] || [5, 5] }; });
}
function chapterT() {
  const y = window.scrollY;
  if (!chapters.length) return 0;
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i], last = i === chapters.length - 1;
    const h0 = last ? Math.max(1, maxY - c.top) : c.h;     // the last chapter ends at the bottom of the page
    if (y < c.top + h0 || last) { const f = Math.max(0, Math.min(1, (y - c.top) / Math.max(1, h0))); return c.span[0] + f * (c.span[1] - c.span[0]); }
  }
  return chapters[chapters.length - 1].span[1];
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
    if (best && best !== activeSec) {
      activeSec = best; root.dataset.active = best;
      if (best === "alerts" && eng) { const a = alerts.find(x => !x.quiet); eng.alert(a ? a.level : "info", true); }
    }
  }, { threshold: [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
  $$(".pv-sec", root).forEach(sct => io.observe(sct));
}

// The tip on show while scrolling through Saathi: the same formula the 3D sculpture uses (pv/chapters.js).
function saathiIdx(T = chapterT()) {
  const n = el.tips ? el.tips.children.length : 0;
  if (!n) return 0;
  return Math.min(n - 1, Math.floor(Math.max(0, Math.min(1, (T - 9) / 0.95)) * n));
}
function onScroll() {
  if (app.view !== "passenger") return;
  const y = window.scrollY, vh = window.innerHeight;
  if (!chapters.length) measureChapters();
  const T = chapterT();
  if (eng) eng.setT(T);
  if (T >= 8.9 && T <= 10.1) showTip(saathiIdx(T));
  // captions in the cinematic chapters fade in and out with their own span
  for (const c of chapters) {
    if (!c.e.classList.contains("pv-ch") && !c.e.classList.contains("pv-capped")) continue;
    const f = (y - c.top) / c.h;
    c.e.style.setProperty("--p", Math.max(-0.5, Math.min(1.5, f)).toFixed(3));
    c.e.style.setProperty("--vis", f > -0.2 && f < 1.2 ? "visible" : "hidden");
  }
  const hero = $(".pv-hero-in", root);
  if (hero && y < vh * 1.2) {
    const p = Math.min(1, y / (vh * 0.9));
    hero.style.transform = `translateY(${p * -60}px) scale(${1 - p * 0.04})`;
    hero.style.opacity = String(1 - p * 0.9);
    hero.style.filter = p > 0.02 ? `blur(${p * 6}px)` : "";
  }
}

let stageP = null;
function ensureStage() {
  if (stageP) return stageP;
  if (!webglOK()) return (stageP = Promise.resolve(null));
  stageP = (async () => {
    try {
      stageMod ||= await import(`./pv/chapters.js?v=${VER}`);
      await stageMod.FX.fontsReady();
      eng = stageMod.createStage(el.canvas, { reduce, mobile, ver: VER, onTier: t => { root.dataset.tier = t; } });
      eng.setNetwork(app.net);
      app.pv = eng; // handy in the console, like window.kalyon
      stageJourney(journey()); stageData(journey());
      measureChapters(); onScroll();
      return eng;
    } catch (e) { console.error(e); eng = null; root.classList.add("no-gl"); return null; }
  })();
  return stageP;
}

async function enter() {
  if (!built) build();
  lastMinute = -1;
  refresh(true, true);
  measureChapters(); onScroll();
  await ensureStage();
  if (app.view !== "passenger") return;
  if (eng) eng.resume();
  if (introDone) { if (eng) eng.skip(); return; }
  let seen = false;
  try { seen = sessionStorage.getItem("kalyon-pv-intro") === "1"; } catch { /* storage blocked */ }
  if (!eng || reduce || seen || window.scrollY > 40) { finishIntro(); return; }
  // wait for the boot screen to clear, so the opening is actually seen
  for (let i = 0; i < 100 && !document.getElementById("loader")?.classList.contains("done"); i++) await wait(100);
  if (app.view !== "passenger" || introDone) return;
  root.classList.add("intro");
  eng.intro();                              // particles condense into the train (about 6 s)
  await wait(500); if (introDone) return;
  el.intro.classList.add("l1");
  await wait(2200); if (introDone) return;
  el.intro.classList.add("l2");
  await wait(2000); if (introDone) return;
  el.intro.classList.add("out");
  await wait(1300);
  finishIntro();
}
function skipIntro() { finishIntro(); }
function finishIntro() {
  if (introDone) return;
  introDone = true;
  try { sessionStorage.setItem("kalyon-pv-intro", "1"); } catch { /* storage blocked */ }
  root.classList.remove("intro");
  el.intro.classList.add("gone");
  let hello = false;
  try { hello = sessionStorage.getItem("kalyon-saathi-hi") === "1"; sessionStorage.setItem("kalyon-saathi-hi", "1"); } catch { /* storage blocked */ }
  if (!hello) (async () => {   // say hello once the boot screen has gone, so it is actually seen
    for (let i = 0; i < 120 && !document.getElementById("loader")?.classList.contains("done"); i++) await wait(100);
    await wait(1500);
    if (app.view === "passenger") saathiPop("Hi, I’m Saathi. Tap me any time to ask about your train.");
  })();
  if (eng && !eng.formed) eng.skip();
  $(".pv-hero", root).classList.add("in");
}
// Scrolling during the opening finishes it at once.
addEventListener("wheel", () => { if (built && !introDone && app?.view === "passenger") finishIntro(); }, { passive: true });
addEventListener("touchmove", () => { if (built && !introDone && app?.view === "passenger") finishIntro(); }, { passive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
