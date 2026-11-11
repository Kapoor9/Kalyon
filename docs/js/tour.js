// Guided "mission briefing": a spotlight that walks a first-time visitor through a screen.
import { h, $ } from "./ui.js?v=202611111558";

const STEPS = {
  control: [
    ["#ops-map", "The corridor", "Each glowing marker is a train. Green is under 15 minutes late, amber 15–59, red an hour or more. Drag to rotate, scroll to zoom."],
    ["#timeline", "The replay clock", "Press Play to run the day. Drag the slider to jump in time; change the speed on the right."],
    ["#feed-panel", "Every report, re-forecast", "Each time a train departs a station, Kalyon forecasts every station ahead. Click a report to select that train."],
    ["#sel-panel", "Today versus Kalyon", "For the selected train: today’s constant-delay estimate, Kalyon’s ETA and its likely range for the next stops."],
    [".tabs", "Keep exploring", "Follow one train in Journey, see a station board, run a what-if, or check the evidence in the Model lab."],
  ],
  journey: [["#v-journey .journey-head", "Step through reports", "Pick a train, then use the arrows or slider to replay its running reports one by one."],
    ["#v-journey .journey .panel", "Ranges against reality", "Yellow bars are Kalyon’s likely range, the diamond is today’s estimate, the green dot is what actually happened. Click a station to see why."]],
  board: [["#v-board .board-wrap", "A station display", "Arrivals with today’s estimate, Kalyon’s ETA and range, and the time platform staff should be ready by."]],
  whatif: [["#v-whatif .presets", "Pick a scenario", "Start from a preset such as dense fog at night, then fine-tune with the sliders."],
    ["#v-whatif .whatif > .grid", "Watch the models react", "The chart and the reasons update instantly. Everything runs in your browser."]],
  passenger: [[".pv-picker", "Pick a journey", "Choose a train, where you board and where you get off. The day and the clock are the same replay as the control room."],
    [".pv-live .pv-bigtime", "Your arrival time", "This is Kalyon’s forecast, the same number the station board shows, with its likely range."],
    [".pv-clockbar", "Play the replay", "Press play to run the clock: alerts arrive as the train reports from each station."]],
  optim: [["#v-optim .ol-presets", "Pick a situation", "Start from a preset, or set the day, time and disruptions yourself under Scenario."],
    ["#v-optim .ol-engine", "The engine at work", "Forecast, find conflicts, let the AI dispatcher suggest, then search until the best plan is proven. The counters are real."],
    ["#v-optim .ol-graph", "Before and after", "Dashed lines are standard dispatch; coloured lines are Kalyon’s plan. Yellow bars are holds; red rings are conflicts."],
    ["#v-optim .ol-decisions", "What to do, and why", "Each recommendation says what to do and what reversing it would cost."]],
  lab: [["#v-lab .lab .panel", "The evidence", "Accuracy against three baselines on test days the models never saw, plus the hypotheses from the paper."]],
  hood: [["#v-hood .hd-mon", "The engine is live", "These counters are real: the AI models are loaded in this tab, and every tree evaluated and every millisecond is counted as it happens."],
    ["#v-hood .hd-case", "Pick any example", "Choose a day, a train, the station it just left and the station to forecast. Every step updates."],
    ["#v-hood .hd-nav", "Eight steps", "Go from the raw report to the final ETA and its reasons. Use the arrows or the ← → keys."]],
  method: [["#v-method .pipeline", "The Python pipeline", "Simulate, build features, train, evaluate, serve. The code is on GitHub."]],
  overview: [[".hero-copy .cta", "Start here", "Scroll for the story, or jump straight into the control room."]],
};

let layer, hole, card, idx = 0, steps = [];

export function startTour(view) {
  steps = (STEPS[view] || []).filter(([sel]) => $(sel));
  if (!steps.length) return;
  if (!layer) {
    layer = h("div", { class: "tour", role: "dialog", "aria-modal": "true", "aria-label": "Guided tour" });
    hole = h("div", { class: "tour-hole" });
    card = h("div", { class: "tour-card" });
    layer.append(hole, card);
    document.body.append(layer);
    layer.addEventListener("click", e => { if (e.target === layer) end(); });
    document.addEventListener("keydown", e => {
      if (!layer.classList.contains("on")) return;
      if (e.key === "Escape") end();
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    });
    window.addEventListener("resize", () => { if (layer.classList.contains("on")) place(); });
  }
  layer.classList.add("on");
  layer.style.display = "block";
  go(0);
}

function go(i) {
  if (i >= steps.length) { end(); return; }
  idx = Math.max(0, i);
  const [sel, title, text] = steps[idx];
  const el = $(sel);
  el.scrollIntoView({ block: "center", behavior: "instant" in el ? "instant" : "auto" });
  card.innerHTML = "";
  card.append(
    h("span", { class: "kicker" }, `Briefing ${idx + 1} / ${steps.length}`),
    h("h3", {}, title), h("p", {}, text),
    h("div", { class: "row" },
      h("div", { class: "tour-dots" }, ...steps.map((_, j) => h("i", { class: j === idx ? "on" : "" }))),
      h("div", { style: "display:flex;gap:8px" },
        h("button", { class: "btn ghost small", onclick: end }, "Skip"),
        h("button", { class: "btn primary small", onclick: () => go(idx + 1) }, idx === steps.length - 1 ? "Done" : "Next"))));
  requestAnimationFrame(place);
  card.querySelector(".btn.primary").focus();
}

function place() {
  const el = $(steps[idx][0]);
  if (!el) return;
  const r = el.getBoundingClientRect(), pad = 8;
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let x = r.right + 18, y = r.top;
  if (x + cw > window.innerWidth - 12) x = Math.max(12, r.left - cw - 18);
  if (x < 12 || r.width > window.innerWidth * 0.6) { x = Math.min(window.innerWidth - cw - 12, Math.max(12, r.left + 12)); y = r.bottom + 16; if (y + ch > window.innerHeight - 12) y = Math.max(12, r.top - ch - 16); }
  y = Math.max(12, Math.min(y, window.innerHeight - ch - 12));
  Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
}

function end() {
  if (!layer) return;
  layer.classList.remove("on");
  layer.style.display = "none";
  try { localStorage.setItem("kalyon-toured", "1"); } catch { /* storage unavailable */ }
}

export function firstVisit() {
  try { return !localStorage.getItem("kalyon-toured"); } catch { return false; }
}
