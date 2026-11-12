// The Kalyon home: the 3D opening (the nameboard inside a railway clock, a rail-track ribbon, a living
// network) and, as you scroll, the statement and the spiral of sections. The spiral replaces the old
// row of tabs: scroll turns it, the card in front can be entered, and a floating Index opens every
// section at once like a folder on a phone. The 3D world lives in home/stage.js and is loaded only
// when this view is shown.
import { h, $, $$, VER, hhmm } from "./ui.js?v=202611120808";
import { webglOK } from "./fx.js?v=202611120808";

// The sections, in the order of the old tabs. `view` is the page a card opens.
export const SECTIONS = [
  { view: "overview", title: "Briefing", hi: "ब्रीफ़िंग", desc: "The problem, the idea and the result", img: "img/home/overview.jpg" },
  { view: "team", title: "Meet the team", hi: "हमारी टीम", desc: "Eight students of IIM Sirmaur", img: "img/home/team.jpg" },
  { view: "passenger", title: "Passenger", hi: "यात्री", desc: "Your train's honest arrival time", img: "img/home/passenger.jpg" },
  { view: "control", title: "Control room", hi: "नियंत्रण कक्ष", desc: "Every train on the corridor at once", img: "img/home/control.jpg" },
  { view: "journey", title: "Journey & board", hi: "यात्रा और बोर्ड", desc: "Follow one train, see the station board", img: "img/home/journey.jpg" },
  { view: "whatif", title: "What-if", hi: "अगर ऐसा हो तो", desc: "Add fog or a fault, watch it react", img: "img/home/whatif.jpg" },
  { view: "optim", title: "Optimisation Lab", hi: "अनुकूलन", desc: "What controllers should do next", img: "img/home/optim.jpg" },
  { view: "hood", title: "Under the hood", hi: "इंजन कक्ष", desc: "Watch one forecast being made", img: "img/home/hood.jpg" },
  { view: "lab", title: "Model lab & method", hi: "मॉडल लैब", desc: "The evidence, the data and the code", img: "img/home/lab.jpg" },
];
// pages that live inside another section's card
const CARD_OF = { board: "journey", method: "lab" };
// "What are you looking for?"
const FIND = [
  ["For passengers", ["passenger", "journey"]],
  ["For station staff", ["control", "journey", "optim", "whatif"]],
  ["How the AI works", ["hood", "lab", "whatif", "optim"]],
  ["The team", ["team", "overview"]],
  ["Everything", null],
];

let app, root, eng = null, built = false, stageP = null, introDone = false, busy = false;
let active = false, saved = 0, pendingCard = null, near = -1, inSpiral = false, filterKey = "Everything", liveAt = -99;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const el = {};
const N = SECTIONS.length;
const idxOf = view => SECTIONS.findIndex(s => s.view === (CARD_OF[view] || view));

export function mount(a) {
  app = a;
  root = $("#v-home");
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";   // the home always opens on the first card
  app.on("view", v => { if (v === "home") enter(); else leave(); });
  app.on("tick", ({ t }) => { if (eng) { eng.setClock(t); live(t); } });   // the clock hands show the replay time
  // "All sections": the only navigation inside a section besides each page's Next bar
  const hud = $(".hud-top .nameboard");
  hud?.after(h("button", { class: "hud-sections", "aria-label": "All sections", onclick: () => back(app.view) },
    h("span", { class: "dots", "aria-hidden": "true" }, ...Array.from({ length: 9 }, () => h("i"))), h("span", {}, "All sections")));
}

// Go back to the spiral with the card of `view` in front.
export function back(view) {
  const i = idxOf(view);
  pendingCard = i >= 0 ? i : null;
  app.route("home");
}

// ---------------------------------------------------------------------------------------------
function build() {
  built = true;
  const icons = Object.fromEntries($$(".tabs .tab").map(b => [b.dataset.view, b.querySelector("svg")]));
  const icon = view => icons[view] ? icons[view].cloneNode(true) : h("span");
  root.append(
    el.canvas = h("canvas", { class: "hm-canvas", "aria-hidden": "true" }),
    h("div", { class: "hm-fallback", "aria-hidden": "true" }),
    h("div", { class: "hm-seed", "aria-hidden": "true" }),
    h("div", { class: "hm-pill" },
      h("button", { onclick: guide }, "Guide"),
      h("i", { "aria-hidden": "true" }),
      h("a", { href: "https://github.com/Kapoor9/Kalyon", target: "_blank", rel: "noopener" }, "GitHub")),
    h("p", { class: "hm-honest" }, h("i"), "Demo · replay of synthetic data · not live tracking"),
    h("div", { class: "hm-wrap" },
      h("h1", { class: "sr-only" }, "Kalyon: know when your train will really arrive"),
      // 3 · the spiral of sections. The cards are drawn in 3D; this list is for screen readers,
      //     keyboards and browsers without WebGL (where it shows as a grid).
      el.spiral = h("section", { class: "hm-sec hm-spiral", "data-hm": "spiral", "aria-label": "Sections" },
        h("h2", { class: "sr-only" }, "Sections"),
        el.grid = h("ol", { class: "hm-grid" }, ...SECTIONS.map((s, i) => h("li", {},
          h("a", { href: `#${s.view}`, onclick: e => { e.preventDefault(); open(i); } },
            h("img", { src: s.img, alt: "", loading: "lazy" }),
            h("span", { class: "n" }, `${String(i + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`),
            h("span", { class: "hi" }, s.hi), h("b", {}, s.title), h("span", { class: "d" }, s.desc))))))),
    // the spiral's own controls (shown only while the spiral is on screen)
    el.find = h("div", { class: "hm-find", role: "group", "aria-label": "What are you looking for?" },
      h("p", {}, "What are you looking for?"),
      ...FIND.map(([label, list]) => h("button", { "aria-pressed": String(label === filterKey), onclick: e => setFilter(label, list, e.currentTarget) }, h("i"), label))),
    el.now = h("div", { class: "hm-now", "aria-live": "polite" },
      el.nowN = h("span", { class: "n" }, "01 / 09"),
      el.nowT = h("b", {}, SECTIONS[0].title),
      el.nowGo = h("button", { class: "go", onclick: () => open(Math.max(0, near)) }, "Enter ", h("span", { "aria-hidden": "true" }, "→")),
      h("span", { class: "tip" }, mobile ? "Tap the card or scroll to turn" : "Click the card · scroll to turn")),
    el.index = h("button", { class: "hm-index", "aria-label": "Index of all sections", "aria-haspopup": "dialog", onclick: openFolder },
      h("span", { class: "dots", "aria-hidden": "true" }, ...SECTIONS.map(() => h("i"))), h("span", { class: "lbl" }, "Index")),
    el.folder = h("div", { class: "hm-folder", role: "dialog", "aria-modal": "true", "aria-label": "All sections", hidden: "" },
      el.box = h("div", { class: "hm-folder-box" },
        h("p", { class: "hm-folder-t" }, h("span", { class: "hi" }, "सभी खंड"), "All sections"),
        el.tiles = h("div", { class: "hm-tiles" }, ...SECTIONS.map((s, i) => h("button", { class: "hm-tile", style: `--k:${i}`, onclick: () => { closeFolder(true); open(i); } },
          h("span", { class: "ic" }, icon(s.view)), h("span", { class: "t" }, s.title)))))));
  el.folder.addEventListener("click", e => { if (e.target === el.folder) closeFolder(); });
  addEventListener("keydown", e => {
    if (app.view !== "home") return;
    if (e.key === "Escape" && !el.folder.hidden) closeFolder();
    if (!el.folder.hidden || !inSpiral || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === "Enter" && e.target === document.body && near >= 0) open(near);
  });
  if (!webglOK()) root.classList.add("no-gl");
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  // pointer: hover lights the card under the pointer; a click on a card enters it
  addEventListener("pointermove", e => {
    if (app.view !== "home" || !eng || !inSpiral || busy || e.pointerType === "touch") return;
    const i = eng.pick(e.clientX, e.clientY);
    eng.hover(i);
    root.classList.toggle("hot", i >= 0 && !e.target.closest("button, a"));
  }, { passive: true });
  addEventListener("click", e => {
    if (app.view !== "home" || !eng || !inSpiral || busy || !el.folder.hidden) return;
    if (e.target.closest("button, a, .hm-find, .hm-now, .hm-pill, .tour")) return;
    const i = eng.pick(e.clientX, e.clientY);
    if (i >= 0) open(i);
  });
}

// Scroll → T, 0 at the first card and 1 at the last. The home opens straight on the spiral.
function homeT() {
  const sp = el.spiral;
  return Math.max(0, Math.min(1, (scrollY - sp.offsetTop) / Math.max(1, sp.offsetHeight - innerHeight)));
}
// the scroll position that puts card i at rest in front (the inverse of the stage's card mapping)
function scrollFor(i) {
  const sp = el.spiral;
  return sp.offsetTop + (i / (N - 0.85)) * Math.max(1, sp.offsetHeight - innerHeight);
}
function onScroll() {
  if (app.view !== "home" || !built) return;
  const T = homeT();
  if (eng) eng.setT(T);
  root.style.setProperty("--t", T.toFixed(3));
  if (!busy) saved = scrollY;
  // when the scrolling stops between two cards, glide on to the nearer one
  clearTimeout(snapT);
  if (!busy && !touching && introDone && eng?.state.ready) snapT = setTimeout(snap, 170);
  if (!introDone && scrollY > 40) finishIntro();
}

let snapT = 0, touching = false;
addEventListener("touchstart", () => { touching = true; }, { passive: true });
addEventListener("touchend", () => { touching = false; clearTimeout(snapT); snapT = setTimeout(snap, 260); }, { passive: true });
function snap() {
  if (app.view !== "home" || busy || touching || !el.folder?.hidden) return;
  const i = Math.max(0, Math.min(N - 1, Math.round(homeT() * (N - 0.85))));
  const y = scrollFor(i);
  if (Math.abs(scrollY - y) > 6) scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
}

// The UI follows the card in front; runs only while the home is shown.
let uiRaf = 0;
function uiLoop() {
  uiRaf = requestAnimationFrame(uiLoop);
  const on = introDone && !busy && (!eng || eng.state.ready);
  if (on !== inSpiral) {
    inSpiral = on; root.classList.toggle("in-spiral", on);
    if (!on) { eng?.hover(-1); root.classList.remove("hot"); if (!el.folder.hidden) closeFolder(); }
  }
  const n = eng ? eng.state.near : Math.max(0, Math.min(N - 1, Math.round(homeT() * (N - 0.85))));
  if (n !== near) {
    near = n;
    el.nowN.textContent = `${String(n + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`;
    el.nowT.textContent = SECTIONS[n].title;
    el.nowGo.setAttribute("aria-label", `Enter ${SECTIONS[n].title}`);
    el.now.classList.remove("swap"); void el.now.offsetWidth; el.now.classList.add("swap");
  }
}

// A short live line on some cards, from the replay clock.
function live(t, force) {
  if (!eng || !app.replay || (!force && Math.abs(t - liveAt) < 5)) return;
  liveAt = t;
  let running = 0;
  for (const run of app.replay.runs) if (app.status(run, t).state === "running") running++;
  const clock = hhmm(app.abs(t));
  const L = { overview: "2 minute read", team: "8 students + mentor", passenger: `Replay ${clock}`, control: `${running} trains running`,
    journey: `Board at ${clock}`, whatif: "4 models ready", optim: "Solver in your browser", hood: "Runs in this tab", lab: "80% range target" };
  SECTIONS.forEach((s, i) => eng.setLive(i, L[s.view] || ""));
}

function setFilter(label, list, btn) {
  filterKey = label;
  $$("button", el.find).forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
  const idx = list ? list.map(v => idxOf(v)) : null;
  eng?.setFilter(idx);
  root.classList.toggle("filtered", !!idx);
  $$("li", el.grid).forEach((li, i) => li.classList.toggle("dim", !!idx && !idx.includes(i)));
  // turn to the first match if the card in front is not one
  if (idx && !idx.includes(near)) {
    const target = idx.slice().sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0];
    scrollTo({ top: scrollFor(target), behavior: reduce ? "auto" : "smooth" });
  }
}

// Enter card i: turn to it, fly in, then open its page.
async function open(i) {
  if (busy) return;
  const s = SECTIONS[i];
  while (!app.replay) await wait(100);
  if (!eng) { app.route(s.view); return; }
  busy = true; root.classList.add("flying"); eng.hover(-1); root.classList.remove("hot");
  const y = scrollFor(i);
  if (Math.abs(scrollY - y) > 4 || near !== i) {
    scrollTo({ top: y, behavior: "auto" });
    eng.setT(homeT());
    await wait(reduce ? 0 : Math.min(900, 260 + Math.abs(near - i) * 140));
  }
  saved = scrollFor(i);
  await eng.fly(i);
  busy = false;
  app.route(s.view);
}

// ----- the Index: a folder that opens out of its button, like a folder on a phone -----
function openFolder() {
  if (!el.folder.hidden) return;
  el.folder.hidden = false;
  root.classList.add("folder-open");
  const b = el.index.getBoundingClientRect(), r = el.box.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (r.left + r.width / 2), dy = b.top + b.height / 2 - (r.top + r.height / 2);
  const from = `translate(${dx}px, ${dy}px) scale(${b.width / r.width}, ${b.height / r.height})`;
  el.box.animate([{ transform: from, borderRadius: "40px", opacity: 0.2 }, { transform: "none", borderRadius: "34px", opacity: 1 }],
    { duration: reduce ? 1 : 520, easing: "cubic-bezier(.2, 1.25, .35, 1)" });
  el.folder.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 1 : 320, easing: "ease-out" });
  $$(".hm-tile", el.tiles).forEach((t, k) => t.animate([{ transform: "scale(.4)", opacity: 0 }, { transform: "none", opacity: 1 }],
    { duration: reduce ? 1 : 420, delay: reduce ? 0 : 90 + k * 28, easing: "cubic-bezier(.2, 1.3, .4, 1)", fill: "backwards" }));
  el.index.setAttribute("aria-expanded", "true");
  setTimeout(() => $(".hm-tile", el.tiles)?.focus(), reduce ? 0 : 200);
}
function closeFolder(quick) {
  if (el.folder.hidden) return;
  const b = el.index.getBoundingClientRect(), r = el.box.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (r.left + r.width / 2), dy = b.top + b.height / 2 - (r.top + r.height / 2);
  const to = `translate(${dx}px, ${dy}px) scale(${b.width / r.width}, ${b.height / r.height})`;
  const ms = reduce || quick ? 1 : 380;
  el.box.animate([{ transform: "none", opacity: 1 }, { transform: to, borderRadius: "40px", opacity: 0 }], { duration: ms, easing: "cubic-bezier(.5, 0, .75, .2)" });
  el.folder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-in" }).onfinish = () => {
    el.folder.hidden = true; root.classList.remove("folder-open");
  };
  el.index.setAttribute("aria-expanded", "false");
  if (!quick) el.index.focus({ preventScroll: true });
}

// The Guide button: bring the spiral up, then walk through it.
async function guide() {
  if (!introDone) { finishIntro(); eng?.skip(); }
  const t0 = performance.now();
  while (!inSpiral && performance.now() - t0 < 1600) await wait(80);
  app.startTour?.("home");
}

// ---------------------------------------------------------------------------------------------
function ensureStage() {
  if (stageP) return stageP;
  if (!webglOK()) return (stageP = Promise.resolve(null));
  stageP = (async () => {
    try {
      const mod = await import(`./home/stage.js?v=${VER}`);
      eng = await mod.createHome(el.canvas, { mobile, reduce, sections: SECTIONS });
      eng.setClock(app.t ?? 420);
      live(app.t ?? 420, true);
      app.home = eng;
      onScroll();
      return eng;
    } catch (e) { console.error(e); eng = null; root.classList.add("no-gl"); return null; }
  })();
  return stageP;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function enter() {
  if (active) return;                 // already showing (the app announces the view again once its data is in)
  active = true;
  if (!built) build();
  document.body.classList.add("home-mode");
  // coming back from a section: return to where we were (or to the card asked for)
  if (pendingCard !== null || saved) {
    const y = pendingCard !== null ? scrollFor(pendingCard) : saved;
    pendingCard = null;
    scrollTo({ top: y, behavior: "auto" });
    introDone = true; root.classList.add("ready");
  }
  onScroll();
  cancelAnimationFrame(uiRaf); uiRaf = requestAnimationFrame(uiLoop);
  await ensureStage();
  if (app.view !== "home") return;
  eng?.land(); eng?.jump(homeT()); root.classList.remove("flying");
  eng?.resume();
  if (introDone) { eng?.skip(); return; }
  root.classList.add("intro");
  eng?.intro();
  await wait(reduce ? 0 : 4800);
  finishIntro();
}
function finishIntro() {
  if (introDone) return;
  introDone = true;
  root.classList.remove("intro");
  root.classList.add("ready");
  eng?.intro();
}
function leave() {
  active = false;
  document.body.classList.remove("home-mode");
  cancelAnimationFrame(uiRaf);
  if (el.folder && !el.folder.hidden) closeFolder(true);
  eng?.pause();
}
