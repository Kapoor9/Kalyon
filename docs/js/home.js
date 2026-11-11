// The Kalyon home: the 3D opening (the nameboard in a railway clock, a rail-track ribbon, a living
// network) and, as you scroll, the statement and the spiral of sections. The 3D world lives in
// home/stage.js and is loaded only when this view is shown.
import { h, $, $$, VER } from "./ui.js?v=202611111558";
import { webglOK } from "./fx.js?v=202611111558";

let app, root, eng = null, built = false, stageP = null, introDone = false;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const el = {};

export function mount(a) {
  app = a;
  root = $("#v-home");
  app.on("view", v => { if (v === "home") enter(); else leave(); });
  app.on("tick", ({ t }) => { if (eng) eng.setClock(t); });   // the clock hands show the replay time
}

function build() {
  built = true;
  root.append(
    el.canvas = h("canvas", { class: "hm-canvas", "aria-hidden": "true" }),
    h("div", { class: "hm-fallback", "aria-hidden": "true" }),
    h("div", { class: "hm-pill" },
      h("button", { onclick: () => app.startTour?.("home") }, "Guide"),
      h("i", { "aria-hidden": "true" }),
      h("a", { href: "https://github.com/Kapoor9/Kalyon", target: "_blank", rel: "noopener" }, "GitHub")),
    h("p", { class: "hm-honest" }, h("i"), "Demo · replay of synthetic data · not live tracking"),
    h("div", { class: "hm-wrap" },
      // 1 · the opening
      h("section", { class: "hm-sec hm-open", "data-hm": "open", "aria-label": "Kalyon" },
        h("h1", { class: "sr-only" }, "Kalyon: know when your train will really arrive"),
        el.hint = h("p", { class: "hm-hint" }, "Scroll down", h("span", { "aria-hidden": "true" }))),
      // 2 · the statement
      h("section", { class: "hm-sec hm-state", "data-hm": "state", "aria-label": "About Kalyon" },
        h("div", { class: "hm-state-in" },
          h("h2", { class: "hm-title" }, h("span", {}, "Know when"), h("span", {}, "your train"), h("span", {}, "will really"), h("span", {}, "arrive.")),
          h("div", { class: "hm-blurb" },
            h("p", {}, "काल + नियोजन · time + planning"),
            h("p", {}, "Kalyon reads every running report, the weather and the line ahead, and gives an honest arrival time with a range you can plan around."),
            h("p", {}, "Built by eight students of IIM Sirmaur for the Smart India Hackathon. The AI models run in your browser."),
            h("p", { class: "dim" }, "Dehradun corridor · synthetic replay data")))),
      // 3 · the spiral of sections (round 2)
      el.spiral = h("section", { class: "hm-sec hm-spiral", "data-hm": "spiral", "aria-label": "Sections" })));
  if (!webglOK()) root.classList.add("no-gl");
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
}

// Scroll → clock T: opening 0–1 (to the statement), statement 1–2, spiral 2+.
function homeT() {
  const y = scrollY, vh = innerHeight;
  const st = $(".hm-state", root), sp = el.spiral;
  if (!st) return 0;
  const a = st.offsetTop, b = sp.offsetTop;
  if (y < a) return Math.max(0, y / Math.max(1, a));                      // opening → statement
  if (y < b) return 1 + (y - a) / Math.max(1, b - a);                      // statement held
  return 2 + (y - b) / Math.max(1, sp.offsetHeight - vh);                  // spiral
}
function onScroll() {
  if (app.view !== "home") return;
  const T = homeT();
  if (eng) eng.setT(T);
  root.style.setProperty("--t", T.toFixed(3));
  if (!introDone && scrollY > 40) finishIntro();
}

function ensureStage() {
  if (stageP) return stageP;
  if (!webglOK()) return (stageP = Promise.resolve(null));
  stageP = (async () => {
    try {
      const mod = await import(`./home/stage.js?v=${VER}`);
      eng = await mod.createHome(el.canvas, { mobile, reduce });
      eng.setClock(app.t ?? 420);
      app.home = eng;
      onScroll();
      return eng;
    } catch (e) { console.error(e); eng = null; root.classList.add("no-gl"); return null; }
  })();
  return stageP;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function enter() {
  if (!built) build();
  document.body.classList.add("home-mode");
  onScroll();
  await ensureStage();
  if (app.view !== "home") return;
  eng?.resume();
  if (introDone) { eng?.skip(); return; }
  for (let i = 0; i < 100 && !document.getElementById("loader")?.classList.contains("done"); i++) await wait(100);
  if (app.view !== "home") return;
  root.classList.add("intro");
  eng?.intro();
  await wait(reduce ? 0 : 2600);
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
  document.body.classList.remove("home-mode");
  eng?.pause();
}
