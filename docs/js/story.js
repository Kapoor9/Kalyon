// Briefing: a scroll-driven story (GSAP ScrollTrigger) opening on the 3D night-train scene.
import { h, s, $, $$, linear, hhmm, mins } from "./ui.js?v=202611130818";
import { mountHero } from "./hero.js?v=202611130818";
import { activeModels } from "./engine.js?v=202611130818";
import { webglOK, REDUCED } from "./fx.js?v=202611130818";

let app, hero = null, triggers = [];

export function mount(a) {
  app = a;
  const root = $("#v-overview");
  const m = app.metrics;
  const b1 = m.test.b1.mae, m1 = m.test.m1.mae;
  const cut = Math.round((1 - m1 / b1) * 100);
  const hrs = m.by_hours.find(r => r.bin === "2-4 h");
  const ex = example();
  const trees = activeTrees();

  const heroEl = h("section", { class: "hero", id: "hero" },
    h("div", { class: "hero-shade" }),
    ...["tl", "tr", "bl", "br"].map(c => h("i", { class: `hud-corner ${c}` })),
    h("div", { class: "hero-readout", "aria-hidden": "true" },
      h("div", {}, h("span", { class: "live" }, "●"), " Forecast engine ", h("b", {}, "online")),
      h("div", {}, "Ensemble ", h("b", {}, `${trees} trees`)),
      h("div", {}, "Signals per forecast ", h("b", {}, `${app.M.features.length}`)),
      h("div", {}, "Range target ", h("b", { class: "lvl-pct" }, app.pct())),
      h("div", {}, "Corridor ", h("b", {}, "DDN · LKO · NDLS"))),
    h("div", { class: "hero-copy" },
      h("div", { class: "hi-line" }, "काल + नियोजन"),
      h("h1", {}, h("span", { class: "ln" }, h("span", {}, "Late trains")), h("span", { class: "ln" }, h("span", {}, "don’t stay")), h("span", { class: "ln" }, h("span", {}, "equally late."))),
      h("p", { class: "lede" }, "Today’s ETA is the timetable plus the current delay, as if delay never changes. Kalyon re-forecasts every station ahead each time a train reports, gives a likely range instead of a single time, and says why."),
      h("div", { class: "cta" },
        h("button", { class: "btn primary", onclick: () => { app.route("control"); app.play(true); } }, "Launch the control room ", h("span", { class: "arr" }, "→")),
        h("button", { class: "btn", onclick: () => document.getElementById("ch-problem").scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth" }) }, "See the problem"))),
    h("div", { class: "scroll-cue", "aria-hidden": "true" }, "Scroll", h("i")));

  root.append(heroEl,
    problemChapter(),
    reschedChapter(),
    engineChapter(ex, trees),
    h("section", { class: "chapter", id: "ch-results" }, h("div", { class: "chapter-inner", style: "padding:90px 0 40px" },
      h("div", { class: "chapter-label" }, "Results on unseen test days"),
      h("h2", {}, "Measured, not claimed."),
      h("p", { class: "lede", style: "margin-top:12px" }, `Trained on ${m.periods.train}, tested on ${m.periods.test}, against today’s constant-delay method. Calibrated synthetic data: proof that the method works end to end, not a real-world accuracy figure.`),
      h("div", { class: "results" },
        result("r-cut", cut, "%", `less ETA error than today’s method: ${m1.toFixed(1)} min against ${b1.toFixed(1)} min.`, cut / 50),
        result("r-cov", Math.round(app.lm().coverage * 1000) / 10, "%", `of actual arrivals fell inside Kalyon’s likely range, which is designed to hold ${app.pct()}.`, app.lm().coverage),
        result("r-hrs", hrs.m1, " min", `average error 2–4 hours ahead, against ${hrs.b1.toFixed(1)} min today. The further ahead, the bigger the gain.`, hrs.m1 / hrs.b1, 1)))),
    missionsChapter(),
    h("section", { class: "chapter" }, h("div", { class: "chapter-inner team" },
      h("div", {},
        h("div", { class: "chapter-label" }, "Team"),
        h("h2", {}, "Indian Institute of Management Sirmaur"),
        h("ul", {}, ...[
          ["Aakarsh Kapoor", "BMS25001"], ["Bonisha Makwana", "BMS25032"], ["Anittya Rahul Lele", "BMS25015"],
          ["Ashish Ranjan", "BMS25024"], ["Hritankar Das", "BMS25058"], ["Jaie Surya K", "BMS25060"],
          ["Gottemukkula Praneeth", "BMS25048"], ["Adya Jain", "BMS25009"]].map(([n, r]) => n === "Aakarsh Kapoor"
          ? h("li", { class: "designer" }, h("div", {}, h("em", {}, "Designed by"), h("b", {}, n)), h("span", {}, r))
          : h("li", {}, n, h("span", {}, r)))),
        h("button", { class: "btn primary", style: "margin-top:18px", onclick: () => app.route("team") }, "Meet the team ", h("span", { class: "arr" }, "→"))),
      h("div", { class: "panel" },
        h("div", { class: "nameboard big", style: "margin-bottom:16px" }, h("span", { class: "hi" }, "काल + नियोजन"), h("span", { class: "en" }, "KALYON")),
        h("p", { class: "small" }, "Time + planning. Knowledge-Augmented Logistics Yield Optimization Network."),
        h("p", { class: "small", style: "margin-top:12px" }, "Smart India Hackathon problem: dynamic forecast of expected time of arrival for coaching trains."),
        h("p", { class: "small", style: "margin-top:12px" }, "Submitted for approval to Dr. Pradipta Patra, Associate Professor, Decision Sciences. Course faculty: Professor Vibhu Gautam, Professor of Practice, Computer Science.")))));

  if (webglOK()) {
    try {
      hero = mountHero(heroEl, ex && { name: ex.wp.name, name_hi: ex.wp.name_hi, med: hhmm(ex.wp.med), lo: hhmm(ex.wp.lo), hi: hhmm(ex.wp.hi), b1: hhmm(ex.wp.b1) });
    } catch (err) { console.error(err); hero = null; }
  }
  if (!hero) heroEl.style.background = "radial-gradient(ellipse at 70% 40%, rgba(255,194,26,.18), transparent 50%), #070b0a";
  app.on("view", v => { if (v === "overview") { hero && hero.start(); enable(true); } else { hero && hero.stop(); enable(false); } });
  // The likely-range level (80/90/95%) changes the range result and the low/high model names.
  app.on("level", () => {
    $$(".lvl-pct").forEach(e => { e.textContent = app.pct(); });
    $$(".e-q-low").forEach(e => { e.textContent = qName("low"); });
    $$(".e-q-high").forEach(e => { e.textContent = qName("high"); });
    const r = $("#r-cov");
    if (r) {
      const v = Math.round(app.lm().coverage * 1000) / 10;
      r.dataset.count = v; r.querySelector(".n").textContent = v.toFixed(0);
      r.querySelector("p").textContent = `of actual arrivals fell inside Kalyon’s likely range, which is designed to hold ${app.pct()}.`;
      const bar = r.querySelector(".meter span"); bar.dataset.w = Math.min(1, app.lm().coverage); bar.style.width = `${app.lm().coverage * 100}%`;
    }
    const tr = document.querySelector(".e-trees"); if (tr) tr.textContent = activeTrees();
  });
}
// Trees in the four models in use: point, median, and the low/high pair of the chosen range level.
const activeTrees = () => activeModels(app.M).reduce((a, k) => a + app.M.models[k].trees.length, 0);
const qName = side => ({ q10: "10th percentile", q90: "90th percentile", q05: "5th percentile", q95: "95th percentile", q025: "2.5th percentile", q975: "97.5th percentile" })[app.levelInfo()[side === "low" ? "lo" : "hi"]];

// A real forecast used across the story: K101 on the winter-fog replay, reporting at Dehradun.
function example() {
  const rep = app.replays.find(r => r.id === "fog");
  // the K101 run that departs during the replay day (not the previous evening's)
  const run = rep && rep.runs.filter(r => r.train === "K101" && r.resched === 0).sort((a, b) => b.ev[0][2] - a.ev[0][2])[0];
  if (!run) return null;
  const fc = app.forecastFor(rep, run, 0, true);
  const train = app.trains[run.train];
  const pick = fc.find(f => f.code === "MB") || fc[Math.floor(fc.length / 2)];
  const wpRow = fc[0];
  const w0 = rep.t0_day * 1440 + 240;
  const actual = w0 + run.ev[pick.s][1] + run.ev[pick.s][3];
  const items = app.M.features.map((f, i) => ({ label: app.M.labels[f], v: pick.shap[i] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
  const st = app.stations[pick.code], wst = app.stations[wpRow.code];
  return { train, run, delay: run.ev[0][4], pick, st, actual, items, wp: { ...wpRow, name: wst.name, name_hi: wst.name_hi } };
}

function result(id, value, unit, text, frac, dec = 0) {
  return h("div", { class: "panel result", "data-count": value, "data-dec": dec, id },
    h("div", { class: "big" }, h("span", { class: "n" }, "0"), h("small", {}, unit)),
    h("p", {}, text), h("div", { class: "meter" }, h("span", { "data-w": Math.min(1, frac) })));
}

// ---------- Chapter: the problem (pinned, scrubbed) ----------
function problemChapter() {
  const codes = ["DDN", "HW", "LRJ", "NBD", "MB", "RMU"], km = [0, 52, 79, 123, 226, 253], obs = [52, 73, 83, 91, 73, 82];
  const W = 760, H = 400, L = 54, R = 30, T = 46, B = 74;
  const x = linear(0, 253, L, W - R), y = linear(30, 100, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Train 15002: average delay rises from 52 to 91 minutes then falls to 73; a constant-delay ETA stays at 52." });
  [40, 60, 80, 100].forEach(v => svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "rgba(214,232,220,.1)" }),
    s("text", { x: L - 10, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 12, "font-family": "JetBrains Mono", text: v })));
  svg.append(s("text", { x: L - 10, y: T - 22, "text-anchor": "end", fill: "var(--faint)", "font-size": 12, "font-family": "JetBrains Mono", text: "min late" }));
  const pts = km.map((k, i) => [x(k), y(obs[i])]);
  const gap = s("path", { class: "p-gap", d: `M${pts.map(p => p.join(",")).join("L")}L${x(253)},${y(52)}L${x(0)},${y(52)}Z`, fill: "rgba(255,77,61,0.18)", opacity: 0 });
  const flat = s("path", { class: "p-flat", d: `M${x(0)},${y(52)}L${x(253)},${y(52)}`, stroke: "var(--today)", "stroke-width": 3, "stroke-dasharray": "8 7", fill: "none" });
  const up = s("path", { class: "p-up", d: `M${pts.slice(0, 4).map(p => p.join(",")).join("L")}`, stroke: "var(--amber)", "stroke-width": 4, fill: "none", "stroke-linejoin": "round", style: "filter:drop-shadow(0 0 6px rgba(255,194,26,.7))" });
  const down = s("path", { class: "p-down", d: `M${pts.slice(3).map(p => p.join(",")).join("L")}`, stroke: "var(--amber)", "stroke-width": 4, fill: "none", "stroke-linejoin": "round", style: "filter:drop-shadow(0 0 6px rgba(255,194,26,.7))" });
  svg.append(gap, flat, up, down);
  codes.forEach((c, i) => {
    const st = app.stations[c];
    svg.append(s("g", { class: `p-pt p-pt${i}`, opacity: i === 0 ? 1 : 0 },
      s("circle", { cx: pts[i][0], cy: pts[i][1], r: 7, fill: "var(--bg)", stroke: "var(--amber)", "stroke-width": 3 }),
      s("text", { x: pts[i][0], y: pts[i][1] - 16, "text-anchor": "middle", fill: "var(--text)", "font-size": 17, "font-weight": 700, "font-family": "Rajdhani", text: obs[i] })),
    s("text", { x: pts[i][0], y: H - B + 26, "text-anchor": "middle", fill: "var(--text)", "font-size": 14, "font-weight": 700, "font-family": "Rajdhani", text: st.name }),
    s("text", { x: pts[i][0], y: H - B + 44, "text-anchor": "middle", fill: "var(--faint)", "font-size": 13, "font-family": "Rajdhani", text: st.name_hi }));
  });
  svg.append(s("g", { class: "p-call", opacity: 0 },
    s("line", { x1: x(123), x2: x(123), y1: y(52) - 2, y2: y(91) + 10, stroke: "var(--red)", "stroke-width": 2 }),
    s("text", { x: x(123) + 10, y: y(72), fill: "var(--red)", "font-size": 18, "font-weight": 700, "font-family": "Rajdhani", text: "39 MIN OFF" })),
    s("text", { class: "p-flat-lbl", x: x(0) + 6, y: y(52) + 22, fill: "var(--today)", "font-size": 13, "font-weight": 600, text: "Today’s ETA: stays 52 min late", opacity: 0 }));
  return h("section", { class: "chapter", id: "ch-problem" }, h("div", { class: "chapter-inner pin" },
    h("div", { class: "problem-grid" },
      h("div", {},
        h("div", { class: "chapter-label" }, "The problem, in real data"),
        h("div", { class: "beats" },
          beat("Today’s ETA assumes the delay stays put.", "Train 15002 leaves Dehradun 52 minutes late on average. The public estimate simply adds 52 minutes to every station ahead."),
          beat("Reality: delay builds on the single line.", "By Haridwar it is 73 minutes, by Laksar 83, by Najibabad 91. Late trains lose their crossing slots on single-line track."),
          beat("Then it partly recovers.", "Recovery time in the timetable brings it back to 73 at Moradabad. A constant-delay ETA is wrong almost everywhere."),
          h("div", { class: "beat" }, h("div", { class: "big" }, "39 min"), h("p", { class: "lede" }, "average error at Najibabad for one ordinary train. Multiply that by thousands of trains and millions of passengers a day.")))),
      h("div", { class: "panel chart-card" },
        h("div", { class: "panel-title" }, h("h3", {}, "Train 15002 leaving Dehradun, 2026"), h("span", { class: "small" }, "Average delay at each station")),
        svg,
        h("p", { class: "small", style: "margin-top:8px" }, "Observed: RunningStatus.in train history, 32 runs in 2026, viewed 9 Nov 2026.")))));
}
function beat(title, text) { return h("div", { class: "beat" }, h("h2", {}, title), h("p", { class: "lede" }, text)); }

// ---------- Chapter: rescheduling dial ----------
function reschedChapter() {
  const R = 150, C = 200;
  const arc = (a0, a1, r) => {
    const p = a => [C + r * Math.sin(a), C - r * Math.cos(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0},${y0}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
  };
  const svg = s("svg", { viewBox: "0 0 400 400", "aria-hidden": "true" });
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, r1 = i % 4 === 0 ? 168 : 174;
    svg.append(s("line", { x1: C + r1 * Math.sin(a), y1: C - r1 * Math.cos(a), x2: C + 182 * Math.sin(a), y2: C - 182 * Math.cos(a), stroke: i % 4 === 0 ? "var(--muted)" : "var(--faint)", "stroke-width": i % 4 === 0 ? 2 : 1 }));
  }
  [0, 6, 12, 18].forEach(hr => { const a = hr / 24 * Math.PI * 2; svg.append(s("text", { x: C + 196 * Math.sin(a), y: C - 196 * Math.cos(a) + 4, "text-anchor": "middle", fill: "var(--faint)", "font-size": 12, "font-family": "JetBrains Mono", text: `${hr}h` })); });
  svg.append(s("circle", { cx: C, cy: C, r: R, fill: "none", stroke: "rgba(214,232,220,.08)", "stroke-width": 26 }));
  const a0 = 4 / 24 * Math.PI * 2, a1 = (17 + 46 / 60) / 24 * Math.PI * 2;
  svg.append(s("path", { class: "dial-arc", d: arc(a0, a1, R), stroke: "var(--amber)", "stroke-width": 26, fill: "none", style: "filter:drop-shadow(0 0 10px rgba(255,194,26,.6))" }),
    s("path", { d: arc(0, a0, R), stroke: "rgba(255,77,61,.35)", "stroke-width": 26, fill: "none" }));
  return h("section", { class: "chapter", id: "ch-resched" }, h("div", { class: "chapter-inner", style: "padding:80px 0" },
    h("div", { class: "resched" },
      h("div", { class: "dial" }, svg, h("div", { class: "readout" }, h("div", {}, h("b", { id: "dial-n" }, "4 h 00"), h("span", { class: "small" }, "rescheduled at origin")))),
      h("div", {},
        h("div", { class: "chapter-label" }, "Late before the journey starts"),
        h("h2", {}, "Some trains start hours behind."),
        h("p", { class: "lede", style: "margin-top:14px" }, "On RunningStatus.in’s list for runs dated 7–8 November 2026, dozens of services across India were rescheduled at their origin by about 4 hours to 17 h 46 min, many of them festival, exam and Holi specials."),
        h("p", { class: "lede", style: "margin-top:12px" }, "Kalyon treats origin rescheduling as an input signal, so a late start changes the whole forecast, not just the first station.")))));
}

// ---------- Chapter: how Kalyon thinks (pinned, scrubbed) ----------
function engineChapter(ex, trees) {
  const svg = s("svg", { viewBox: "0 0 800 500", role: "img", "aria-label": "How a forecast is made: report, signals, models, forecast" });
  const g1 = s("g", { class: "e1" }), g2 = s("g", { class: "e2" }), g3 = s("g", { class: "e3" }), g4 = s("g", { class: "e4" });
  // stage 1: a report
  const sx = [90, 250, 360, 500, 640, 740];
  g1.append(s("line", { x1: 60, x2: 760, y1: 250, y2: 250, stroke: "#3f8a72", "stroke-width": 6, "stroke-linecap": "round" }));
  ["DDN", "HW", "LRJ", "NBD", "MB", "RMU"].forEach((c, i) => g1.append(
    s("circle", { cx: sx[i], cy: 250, r: 9, fill: "var(--bg)", stroke: "var(--text)", "stroke-width": 3 }),
    s("text", { x: sx[i], y: 284, "text-anchor": "middle", fill: "var(--muted)", "font-size": 15, "font-family": "Rajdhani", "font-weight": 700, text: app.stations[c].name })));
  g1.append(s("circle", { class: "e-ping", cx: sx[0], cy: 250, r: 10, fill: "none", stroke: "var(--green)", "stroke-width": 3 }),
    s("rect", { class: "e-train", x: sx[0] - 22, y: 232, width: 44, height: 16, fill: "var(--green)" }),
    s("g", { class: "e-card" },
      s("rect", { x: 70, y: 120, width: 330, height: 74, fill: "rgba(10,14,12,.95)", stroke: "var(--green)" }),
      s("text", { x: 86, y: 148, fill: "var(--green)", "font-size": 13, "font-family": "JetBrains Mono", text: "RUNNING REPORT" }),
      s("text", { x: 86, y: 176, fill: "var(--text)", "font-size": 19, "font-family": "Rajdhani", "font-weight": 700,
        text: ex ? `${ex.train.number} left Dehradun, ${ex.delay < 1 ? "on time" : mins(ex.delay) + " late"}` : "A train departs a station" })));
  // stage 2: signals
  const labels = Object.values(app.M.labels);
  labels.forEach((lab, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 40 + col * 186, y = 60 + row * 62;
    const w = Math.min(176, 22 + lab.length * 7.2);
    g2.append(s("g", { class: "e-chip", "data-x": 400 - (x + w / 2), "data-y": 250 - (y + 16) },
      s("rect", { x, y, width: w, height: 32, fill: "rgba(255,194,26,.08)", stroke: "rgba(255,194,26,.6)" }),
      s("text", { x: x + 11, y: y + 21, fill: "var(--text)", "font-size": 13.5, "font-family": "Barlow", "font-weight": 600, text: lab })));
  });
  // stage 3: tree ensemble around a core
  g3.append(s("circle", { cx: 400, cy: 250, r: 70, fill: "rgba(255,194,26,.08)", stroke: "var(--amber)", "stroke-width": 2, style: "filter:drop-shadow(0 0 14px rgba(255,194,26,.5))" }),
    s("text", { class: "e-trees", x: 400, y: 248, "text-anchor": "middle", fill: "var(--amber)", "font-size": 40, "font-family": "Rajdhani", "font-weight": 700, text: "0" }),
    s("text", { x: 400, y: 274, "text-anchor": "middle", fill: "var(--muted)", "font-size": 13, "font-family": "JetBrains Mono", text: "decision trees" }));
  const treePath = (x, y, d) => {
    let p = "";
    const rec = (x0, y0, w, lvl) => { if (lvl > d) return; const y1 = y0 + 22; p += `M${x0},${y0}L${x0 - w},${y1}M${x0},${y0}L${x0 + w},${y1}`; rec(x0 - w, y1, w / 2, lvl + 1); rec(x0 + w, y1, w / 2, lvl + 1); };
    rec(x, y, 26, 1);
    return p;
  };
  const spots = [[110, 70], [250, 50], [550, 50], [690, 70], [90, 330], [230, 370], [570, 370], [710, 330]];
  ["Point model (Huber)", "Point model (Huber)", "low", "low", "Median", "Median", "high", "high"].forEach((name, i) => {
    const [x, y] = spots[i];
    g3.append(s("path", { class: "e-tree", d: treePath(x, y, 3), stroke: i % 2 ? "var(--cyan)" : "var(--amber)", "stroke-width": 2, fill: "none", "stroke-linecap": "round" }));
    if (i % 2 === 0) g3.append(s("text", { class: name === "low" || name === "high" ? `e-q e-q-${name}` : null, x: (x + spots[i + 1][0]) / 2, y: y + (y < 200 ? 96 : -14), "text-anchor": "middle", fill: "var(--muted)", "font-size": 13, "font-family": "Rajdhani", "font-weight": 700, text: name === "low" || name === "high" ? qName(name) : name }));
  });
  // stage 4: forecast card with reasons
  if (ex) {
    const x0 = 150;
    g4.append(s("rect", { x: x0, y: 70, width: 500, height: 360, fill: "rgba(8,12,10,.96)", stroke: "var(--amber)", "stroke-width": 1.5 }),
      s("text", { x: x0 + 24, y: 108, fill: "var(--amber)", "font-size": 13, "font-family": "JetBrains Mono", text: `FORECAST  ${ex.train.number}  →  ${ex.st.name.toUpperCase()}` }),
      s("text", { x: x0 + 24, y: 168, fill: "var(--text)", "font-size": 58, "font-family": "Rajdhani", "font-weight": 700, text: hhmm(ex.pick.med) }),
      s("text", { x: x0 + 180, y: 150, fill: "var(--muted)", "font-size": 15, "font-family": "Barlow", text: `Likely ${hhmm(ex.pick.lo)}–${hhmm(ex.pick.hi)}` }),
      s("text", { x: x0 + 180, y: 172, fill: "var(--today)", "font-size": 15, "font-family": "Barlow", text: `Today’s estimate ${hhmm(ex.pick.b1)}` }),
      s("text", { x: x0 + 24, y: 214, fill: "var(--muted)", "font-size": 13, "font-family": "JetBrains Mono", text: "WHY" }));
    const max = Math.max(...ex.items.map(i => Math.abs(i.v)), 1);
    ex.items.forEach((it, i) => {
      const yy = 240 + i * 40, w = Math.abs(it.v) / max * 110;
      g4.append(s("text", { x: x0 + 24, y: yy + 12, fill: "var(--text)", "font-size": 16, "font-family": "Barlow", "font-weight": 600, text: it.label }),
        s("rect", { class: "e-bar", x: x0 + 300, y: yy, width: w, height: 14, fill: it.v > 0 ? "var(--red)" : "var(--green)" }),
        s("text", { x: x0 + 476, y: yy + 12, "text-anchor": "end", fill: "var(--text)", "font-size": 14, "font-family": "JetBrains Mono", text: mins(it.v, true) }));
    });
    g4.append(s("line", { x1: x0 + 24, x2: x0 + 476, y1: 368, y2: 368, stroke: "rgba(214,232,220,.15)" }),
      s("text", { x: x0 + 24, y: 400, fill: "var(--green)", "font-size": 16, "font-family": "Barlow", "font-weight": 600,
        text: `Actual: ${hhmm(ex.actual)}. Kalyon off by ${mins(Math.abs(ex.pick.med - ex.actual))}, today’s estimate by ${mins(Math.abs(ex.pick.b1 - ex.actual))}.` }));
  }
  svg.append(g1, g2, g3, g4);
  return h("section", { class: "chapter", id: "ch-engine" }, h("div", { class: "chapter-inner pin" },
    h("div", { class: "engine" },
      h("div", {},
        h("div", { class: "chapter-label" }, "How Kalyon thinks"),
        h("h2", { style: "margin-bottom:22px" }, "From one report to a forecast you can plan around."),
        h("ol", { class: "stage-list" },
          h("li", { "data-i": 0 }, h("b", {}, "A train reports"), h("span", {}, "Departing a station gives its current delay. This is the moment Kalyon re-forecasts.")),
          h("li", { "data-i": 1 }, h("b", {}, `${app.M.features.length} signals`), h("span", {}, "Delay trend, distance and recovery time left, single-line share, congestion, fog, rain, festival rush, this train’s history.")),
          h("li", { "data-i": 2 }, h("b", {}, `${trees} decision trees`), h("span", {}, "Four LightGBM models, trained in Python, predict the correction to today’s estimate and the likely range.")),
          h("li", { "data-i": 3 }, h("b", {}, "ETA, range and reasons"), h("span", {}, ex ? `A real example from the winter-fog replay: ${ex.train.name} at ${ex.st.name}.` : "The forecast, its range and the top reasons.")))),
      h("div", { class: "panel engine-stage" }, svg))));
}

// ---------- Chapter: mission select ----------
const ART = {
  control: '<svg viewBox="0 0 300 150"><g transform="translate(150 75)"><circle r="58" fill="none" stroke="rgba(60,240,160,.35)"/><circle r="36" fill="none" stroke="rgba(60,240,160,.25)"/><circle r="14" fill="none" stroke="rgba(60,240,160,.25)"/><path class="sweep" d="M0 0L58 0A58 58 0 0 0 41 -41Z" fill="rgba(60,240,160,.25)"/><rect x="20" y="-30" width="16" height="7" fill="#ffc21a"/><rect x="-40" y="12" width="16" height="7" fill="#3cf0a0"/><rect x="-8" y="34" width="16" height="7" fill="#ff4d3d"/></g></svg>',
  journey: '<svg viewBox="0 0 300 150"><path d="M30 110 L100 70 L170 88 L270 40" fill="none" stroke="#3f8a72" stroke-width="4"/><path d="M100 64 L170 76 L270 26 L270 54 L170 100 L100 76Z" fill="rgba(255,194,26,.18)"/><path d="M100 70 L170 88 L270 40" fill="none" stroke="#ffc21a" stroke-width="3" stroke-dasharray="6 5"/><circle cx="30" cy="110" r="7" fill="#3cf0a0"/><circle cx="100" cy="70" r="6" fill="#090c0b" stroke="#fff" stroke-width="2"/><circle cx="170" cy="88" r="6" fill="#090c0b" stroke="#fff" stroke-width="2"/><circle cx="270" cy="40" r="6" fill="#090c0b" stroke="#fff" stroke-width="2"/></svg>',
  board: '<svg viewBox="0 0 300 150"><g font-family="JetBrains Mono" font-size="22" font-weight="600">' + ["2", "1", ":", "4", "7"].map((c, i) => `<rect x="${70 + i * 34}" y="48" width="30" height="46" fill="#151c1a"/><line x1="${70 + i * 34}" x2="${100 + i * 34}" y1="71" y2="71" stroke="#000"/><text x="${85 + i * 34}" y="80" text-anchor="middle" fill="#ffc21a">${c}</text>`).join("") + '</g><text x="150" y="120" text-anchor="middle" fill="#94a19a" font-size="12" font-family="JetBrains Mono">KALYON ETA</text></svg>',
  whatif: '<svg viewBox="0 0 300 150"><g stroke-width="3">' + [40, 75, 110].map((y, i) => `<line x1="50" x2="250" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.15)"/><line x1="50" x2="${[180, 110, 220][i]}" y1="${y}" y2="${y}" stroke="#ffc21a"/><rect x="${[180, 110, 220][i] - 6}" y="${y - 9}" width="12" height="18" fill="#e9ede6"/>`).join("") + "</g></svg>",
  lab: '<svg viewBox="0 0 300 150">' + [[60, 30, 40], [110, 50, 60], [160, 70, 90], [210, 84, 110]].map(([x, a, b]) => `<rect x="${x}" y="${130 - b}" width="18" height="${b}" fill="#cfc6b6"/><rect x="${x + 21}" y="${130 - a}" width="18" height="${a}" fill="#ffc21a"/>`).join("") + '<line x1="40" x2="270" y1="130" y2="130" stroke="rgba(255,255,255,.2)"/></svg>',
  passenger: '<svg viewBox="0 0 300 150"><defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stop-color="#ffd9a0"/><stop offset="1" stop-color="#f2a65a"/></linearGradient></defs><rect x="80" y="22" width="140" height="106" rx="16" fill="rgba(255,250,240,.92)"/><text x="98" y="58" font-family="Georgia" font-size="26" fill="#1a140d">06:42</text><rect x="98" y="72" width="104" height="6" rx="3" fill="url(#pg)"/><line x1="96" x2="204" y1="96" y2="96" stroke="#b49a74" stroke-dasharray="3 5"/><circle cx="96" cy="96" r="4" fill="#1a140d"/><circle cx="204" cy="96" r="4" fill="#1a140d"/></svg>',
  optim: '<svg viewBox="0 0 300 150"><g fill="none" stroke-width="3"><path d="M40 120 L120 40 L170 40 L260 120" stroke="#cfc6b6" stroke-dasharray="6 5"/><path d="M40 120 L110 50 L150 50 L180 50 L260 120" stroke="#ffc21a"/><path d="M40 30 L130 30 L150 75 L260 75" stroke="#5fd4ff"/><line x1="130" x2="152" y1="50" y2="50" stroke="#ffd75a" stroke-width="7"/></g><circle cx="140" cy="45" r="11" fill="none" stroke="#ff4d3d" stroke-width="2"/></svg>',
  method: '<svg viewBox="0 0 300 150"><g fill="none" stroke-width="2"><path d="M150 30 L230 60 L150 90 L70 60Z" stroke="#ffc21a" fill="rgba(255,194,26,.1)"/><path d="M70 78 L150 108 L230 78" stroke="#5fd4ff"/><path d="M70 96 L150 126 L230 96" stroke="#3cf0a0"/></g></svg>',
};
function missionsChapter() {
  const items = [
    ["passenger", "Passenger", "What a traveller sees: an honest arrival time, tips, alerts and a pick-up plan, over living photographs."],
    ["control", "Control room", "Watch a full day replay on a 3D map. Every departure triggers a fresh forecast."],
    ["journey", "Journey", "Follow one train report by report, against what actually happened, with reasons."],
    ["board", "Station board", "A split-flap arrivals board with today’s estimate and Kalyon side by side."],
    ["whatif", "What-if", "Dial in fog, rain, festival rush or a 6-hour rescheduling and watch the models react."],
    ["optim", "Optimisation Lab", "From prediction to action: which train waits, where trains cross, who goes first, with the best plan proven."],
    ["lab", "Model lab", "Honest evaluation: baselines, error by horizon, interval coverage, hypothesis tests."],
    ["method", "Method and data", "The Python pipeline, what is real and what is synthetic, and data-cleaning rules."],
  ];
  return h("section", { class: "chapter", id: "ch-missions" }, h("div", { class: "chapter-inner", style: "padding:70px 0 80px" },
    h("div", { class: "chapter-label" }, "Explore the console"),
    h("h2", {}, "Eight ways to see Kalyon work."),
    h("div", { class: "missions" }, ...items.map(([id, title, text]) =>
      h("button", { class: "panel mission", onclick: () => app.route(id) },
        h("div", { class: "art", html: ART[id] }),
        h("div", { class: "body" }, h("b", {}, title), h("p", {}, text), h("div", { class: "go" }, "Open ", h("span", { class: "arr" }, "→"))))))));
}

// ---------- Animations ----------
export function intro() {
  const gsap = window.gsap;
  hero && hero.start();
  if (!gsap || REDUCED()) return;
  gsap.from("#hero .hero-copy h1 .ln > span", { yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.12, delay: 0.1 });
  gsap.from("#hero .hi-line, #hero .hero-copy .lede, #hero .cta", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1, delay: 0.45 });
  gsap.from("#hero .hero-readout > div", { x: 30, opacity: 0, duration: 0.6, stagger: 0.08, delay: 0.7 });
  gsap.from("#hero .hud-corner", { scale: 1.6, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.2 });
}

export function animate() {
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) { fallback(); return; }
  gsap.registerPlugin(ST);
  if (REDUCED()) { fallback(); return; }

  // hero: camera rises to a tactical top view as you scroll away
  triggers.push(ST.create({ trigger: "#hero", start: "top top", end: "bottom top", scrub: true,
    onUpdate: self => { hero && hero.setProgress(self.progress * 1.4); } }));
  triggers.push(gsap.to("#hero .hero-copy", { yPercent: -30, opacity: 0, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "60% top", scrub: true } }).scrollTrigger);

  // problem: pinned and scrubbed
  const len = el => { const p = document.querySelector(el); const l = p.getTotalLength(); p.style.strokeDasharray = `${l}`; p.style.strokeDashoffset = `${l}`; return l; };
  len(".p-up"); len(".p-down");
  const flatEl = document.querySelector(".p-flat"); flatEl.style.opacity = 0;
  const beats = gsap.utils.toArray("#ch-problem .beat");
  gsap.set(beats[0], { opacity: 1 });
  const tl = gsap.timeline({ scrollTrigger: { trigger: "#ch-problem .pin", start: "top top", end: "+=260%", scrub: 0.6, pin: true } });
  tl.set(beats[0], { opacity: 1 })
    .to(".p-flat", { opacity: 1, duration: 0.6 })
    .to(".p-flat-lbl", { opacity: 1, duration: 0.4 }, "<")
    .to(beats[0], { opacity: 0, y: -20, duration: 0.4 }, "+=0.6")
    .fromTo(beats[1], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 })
    .to(".p-up", { strokeDashoffset: 0, duration: 1.2, ease: "none" }, "<")
    .to(".p-pt1", { opacity: 1, duration: 0.15 }, "<0.35").to(".p-pt2", { opacity: 1, duration: 0.15 }, "<0.3").to(".p-pt3", { opacity: 1, duration: 0.15 }, "<0.35")
    .to(beats[1], { opacity: 0, y: -20, duration: 0.4 }, "+=0.5")
    .fromTo(beats[2], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 })
    .to(".p-down", { strokeDashoffset: 0, duration: 1, ease: "none" }, "<")
    .to(".p-pt4", { opacity: 1, duration: 0.15 }, "<0.5").to(".p-pt5", { opacity: 1, duration: 0.15 }, "<0.3")
    .to(beats[2], { opacity: 0, y: -20, duration: 0.4 }, "+=0.5")
    .fromTo(beats[3], { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.5 })
    .to(".p-gap", { opacity: 1, duration: 0.6 }, "<")
    .to(".p-call", { opacity: 1, duration: 0.4 }, "<0.2")
    .to({}, { duration: 0.6 });
  triggers.push(tl.scrollTrigger);

  // rescheduling dial
  const arcEl = document.querySelector(".dial-arc");
  const al = arcEl.getTotalLength(); arcEl.style.strokeDasharray = `${al}`; arcEl.style.strokeDashoffset = `${al}`;
  const dialN = $("#dial-n"), obj = { v: 240 };
  const dt = gsap.timeline({ scrollTrigger: { trigger: "#ch-resched", start: "top 70%", end: "center 45%", scrub: 0.8 } });
  dt.to(arcEl, { strokeDashoffset: 0, ease: "none" })
    .to(obj, { v: 1066, ease: "none", onUpdate: () => { const v = Math.round(obj.v); dialN.textContent = `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, "0")}`; } }, 0);
  dt.from("#ch-resched .resched > div:last-child > *", { y: 30, opacity: 0, stagger: 0.1 }, 0);
  triggers.push(dt.scrollTrigger);

  // engine: pinned and scrubbed through four stages
  const steps = $$("#ch-engine .stage-list li");
  const setStage = i => steps.forEach((li, j) => { li.classList.toggle("on", j === i); li.classList.toggle("done", j < i); });
  setStage(0);
  const chips = gsap.utils.toArray(".e-chip");
  const treesEl = document.querySelector(".e-trees"), tc = { v: 0 };
  const total = activeTrees();
  $$(".e-tree").forEach(p => { const l = p.getTotalLength(); p.style.strokeDasharray = `${l}`; p.style.strokeDashoffset = `${l}`; });
  gsap.set([".e2", ".e3", ".e4"], { opacity: 0 });
  gsap.set(".e-bar", { scaleX: 0, transformOrigin: "left center" });
  const et = gsap.timeline({ scrollTrigger: { trigger: "#ch-engine .pin", start: "top top", end: "+=320%", scrub: 0.6, pin: true,
    onUpdate: self => setStage(Math.min(3, Math.floor(self.progress * 4))) } });
  et.fromTo(".e-ping", { attr: { r: 10 }, opacity: 1 }, { attr: { r: 60 }, opacity: 0, duration: 0.5 })
    .from(".e-card", { y: 20, opacity: 0, duration: 0.4 }, "<")
    .to(".e-train", { x: 150, duration: 0.8, ease: "none" })
    .to(".e1", { opacity: 0, duration: 0.3 })
    .to(".e2", { opacity: 1, duration: 0.1 })
    .from(chips, { opacity: 0, y: 14, duration: 0.3, stagger: 0.04 }, "<")
    .to(chips, { x: (i, el) => +el.dataset.x, y: (i, el) => +el.dataset.y, scale: 0.2, opacity: 0, duration: 0.8, stagger: 0.02, ease: "power2.in" }, "+=0.3")
    .to(".e3", { opacity: 1, duration: 0.2 }, "-=0.3")
    .to(".e-tree", { strokeDashoffset: 0, duration: 0.8, stagger: 0.06 }, "<")
    .to(tc, { v: total, duration: 0.9, onUpdate: () => { treesEl.textContent = Math.round(tc.v); } }, "<")
    .to(".e3", { opacity: 0, duration: 0.3 }, "+=0.3")
    .to(".e4", { opacity: 1, duration: 0.3 })
    .from(".e4 rect:first-child", { scaleY: 0.6, transformOrigin: "center", duration: 0.3 }, "<")
    .to(".e-bar", { scaleX: 1, duration: 0.5, stagger: 0.1 })
    .to({}, { duration: 0.5 });
  triggers.push(et.scrollTrigger);

  // results: count up and fill meters on entry
  $$("#ch-results .result").forEach((el, i) => {
    const n = el.querySelector(".n"), to = +el.dataset.count, dec = +el.dataset.dec, o = { v: 0 };
    const meter = el.querySelector(".meter span");
    const tw = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    tw.from(el, { y: 40, opacity: 0, duration: 0.7, delay: i * 0.1, ease: "power3.out" })
      .to(o, { v: to, duration: 1.4, ease: "power2.out", onUpdate: () => { n.textContent = o.v.toFixed(dec); } }, "<0.2")
      .to(meter, { width: `${+meter.dataset.w * 100}%`, duration: 1.4, ease: "power2.out" }, "<");
    triggers.push(tw.scrollTrigger);
  });
  // missions: staggered reveal
  const mt = gsap.from("#ch-missions .mission", { y: 50, opacity: 0, duration: 0.8, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: "#ch-missions .missions", start: "top 85%", once: true } });
  triggers.push(mt.scrollTrigger);
  ST.refresh();
}

function fallback() {
  $$("#ch-problem .beat").forEach((b, i) => { b.style.position = "static"; b.style.opacity = 1; b.style.marginBottom = "18px"; });
  $$(".p-pt, .p-gap, .p-call, .p-flat-lbl").forEach(e => e.setAttribute("opacity", 1));
  $$("#ch-results .result").forEach(el => { el.querySelector(".n").textContent = (+el.dataset.count).toFixed(+el.dataset.dec); el.querySelector(".meter span").style.width = `${+el.querySelector(".meter span").dataset.w * 100}%`; });
  $$("#ch-engine .stage-list li").forEach(li => li.classList.add("on"));
  $$(".e1, .e2, .e3").forEach(g => g.setAttribute("opacity", 0));
  const tr = document.querySelector(".e-trees"); if (tr) tr.textContent = activeTrees();
  const d = $("#dial-n"); if (d) d.textContent = "17 h 46";
}

function enable(on) {
  triggers.forEach(t => t && (on ? t.enable() : t.disable()));
  if (on && window.ScrollTrigger) requestAnimationFrame(() => window.ScrollTrigger.refresh());
}
