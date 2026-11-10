// Journey: how Kalyon's forecasts for one train evolve, station by station, against what happened.
import { h, s, $, clear, linear, niceTicks, hhmm, mins, tip, animAttr, drawIn, fill } from "./ui.js?v=202611101408";
import { renderWhy } from "./explain.js?v=202611101408";

let app, root, sel, stepIn, stepLbl, ladderEl, evoEl, whyEl, calloutEl, showActual = true;
let state = { runId: null, k: 0, row: null };

export function mount(a) {
  app = a;
  root = $("#v-journey");
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Journey"),
        h("p", { class: "lede" }, "Pick a train and step through its running reports. At each one Kalyon re-forecasts every station ahead; today’s method just adds the current delay.")),
      h("div", { class: "legend" },
        h("span", { class: "key" }, h("i", { class: "sched" }), "Timetable"),
        h("span", { class: "key" }, h("i", { class: "today" }), "Today’s estimate (constant delay)"),
        h("span", { class: "key" }, h("i", { class: "band" }), "Kalyon likely range"),
        h("span", { class: "key" }, h("i", { class: "kal" }), "Kalyon ETA"),
        h("span", { class: "key" }, h("i", { class: "act" }), "Actual arrival"))),
    h("div", { class: "journey-head" },
      sel = h("select", { "aria-label": "Train", onchange: e => { app.selectRun(+e.target.value); } }),
      h("div", { class: "stepper", style: "flex:1" },
        h("button", { class: "btn", "aria-label": "Previous report", onclick: () => setK(state.k - 1) }, "‹"),
        stepIn = h("input", { type: "range", min: 0, max: 1, step: 1, value: 0, "aria-label": "Running report", oninput: e => setK(+e.target.value) }),
        h("button", { class: "btn", "aria-label": "Next report", onclick: () => setK(state.k + 1) }, "›"),
        stepLbl = h("span", { class: "small", style: "min-width:24ch" })),
      h("label", { class: "toggle" }, "Show actual arrivals",
        h("input", { type: "checkbox", class: "switch", checked: true, onchange: e => { showActual = e.target.checked; draw(); } }))),
    h("div", { class: "journey" },
      h("div", { class: "grid" },
        h("div", { class: "panel chart" },
          h("div", { class: "panel-title" }, h("h3", {}, "Forecasts for the stations ahead"), h("span", { class: "small" }, "Click a station to see why")),
          ladderEl = h("div")),
        h("div", { class: "panel chart" },
          h("div", { class: "panel-title" }, h("h3", { id: "evo-title" }, "How the destination forecast changed"), h("span", { class: "small" }, "One point per running report")),
          evoEl = h("div"))),
      h("div", { class: "grid", style: "align-content:start" },
        calloutEl = h("div", { class: "callout" }),
        h("div", { class: "panel" },
          h("div", { class: "panel-title" }, h("h3", { id: "why-title" }, "Why this ETA")),
          whyEl = h("div")))));
  app.on("replay", fillSelect);
  app.on("select", id => { if (id !== null && id !== undefined) open(id, true); });
  app.on("view", v => { if (v === "journey") { if (state.runId === null) open(defaultRun(), false, 1); else draw(); } });
}

function defaultRun() {
  const runs = app.replay.runs;
  const ok = r => r.resched === 0 && r.ev.length >= 8;
  const pick = runs.find(r => r.train === "K131" && ok(r)) || runs.find(r => r.train === "K101" && ok(r)) || runs.find(ok) || runs[0];
  return pick.run;
}

function fillSelect() {
  clear(sel);
  for (const r of app.replay.runs) {
    const t = app.trains[r.train];
    sel.append(h("option", { value: r.run }, `${t.number}  ${t.name}${t.held_out ? " (unseen train)" : ""}`));
  }
  state.runId = null;
  if (app.view === "journey") open(defaultRun(), false, 1);
}

function run() { return app.replay.runs.find(r => r.run === state.runId); }

function open(runId, fromClock, startK = 0) {
  state.runId = runId;
  sel.value = runId;
  const r = run();
  if (!r) return;
  const n = r.ev.length;
  stepIn.max = n - 2;
  let k = fromClock ? app.lastDeparted(r, app.t) : Math.min(startK, n - 2);
  if (k < 0) k = 0;
  state.k = k; state.row = null;
  stepIn.value = k;
  fill(stepIn);
  clear(ladderEl); clear(evoEl);
  draw(true);
}

function setK(k) {
  const r = run();
  if (!r) return;
  state.k = Math.max(0, Math.min(r.ev.length - 2, k));
  stepIn.value = state.k;
  fill(stepIn);
  draw();
}

function draw(fresh = false) {
  const r = run();
  if (!r || app.view !== "journey") return;
  const train = app.trains[r.train];
  const k = state.k;
  const fc = app.forecast(r, k, true);
  const w0 = app.w0();
  const dk = r.ev[k][4];
  stepLbl.textContent = `Report ${k + 1} of ${r.ev.length - 1}: left ${app.stations[train.stops[k].code].name} at ${hhmm(w0 + app.dep(r, k))}, ${dk < 1 ? "on time" : mins(dk) + " late"}`;
  if (state.row === null || !fc.find(f => f.s === state.row)) state.row = fc[Math.min(fc.length - 1, Math.floor(fc.length / 2))].s;
  ladder(r, train, fc, fresh);
  evolution(r, train, fresh);
  const row = fc.find(f => f.s === state.row);
  $("#why-title").textContent = `Why Kalyon expects ${hhmm(row.med)} at ${app.stations[row.code].name}`;
  renderWhy(whyEl, app.M, row);
  const actual = w0 + app.arr(r, row.s);
  clear(calloutEl).append(
    h("p", {}, h("b", {}, `${app.stations[row.code].name} `), h("span", { class: "hi faint" }, app.stations[row.code].name_hi)),
    h("p", { style: "margin-top:6px" }, `Kalyon: ${hhmm(row.med)}, likely between ${hhmm(row.lo)} and ${hhmm(row.hi)}. Today’s estimate: ${hhmm(row.b1)}.`),
    h("p", { class: "small", style: "margin-top:6px" }, `Platform staff plan for ${hhmm(row.lo)}. Passengers and feeder transport use ${hhmm(row.med)}. Crew and cleaning plan for ${hhmm(row.hi)}.`),
    showActual ? h("p", { style: "margin-top:6px" }, `Actual: ${hhmm(actual)}. Kalyon was off by ${mins(Math.abs(row.med - actual))}; today’s estimate by ${mins(Math.abs(row.b1 - actual))}.`) : null);
}

function ladder(r, train, fc, fresh) {
  const w0 = app.w0();
  const n = train.stops.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = fc.find(x => x.s === i);
    const sched = i === 0 ? w0 + r.ev[0][2] : w0 + r.ev[i][1];
    const act = i === 0 ? w0 + app.dep(r, 0) : w0 + app.arr(r, i);
    rows.push({ i, code: train.stops[i].code, sched, act, f, passed: i <= state.k });
  }
  const vals = rows.flatMap(x => [x.sched, x.act, ...(x.f ? [x.f.lo, x.f.hi, x.f.b1] : [])]);
  const t0 = Math.floor((Math.min(...vals) - 20) / 60) * 60, t1 = Math.ceil((Math.max(...vals) + 20) / 60) * 60;
  const W = 760, rowH = 38, L = 150, R = 20, T = 30;
  const H = T + rows.length * rowH + 10;
  const x = linear(t0, t1, L, W - R);
  let svg = ladderEl.querySelector("svg");
  if (!svg || fresh || svg.dataset.n !== String(n)) {
    clear(ladderEl);
    svg = s("svg", { viewBox: `0 0 ${W} ${H}`, "data-n": n, role: "img", "aria-label": "Forecast arrival times for each station" });
    svg.append(s("g", { class: "axis" }), s("g", { class: "rows" }));
    rows.forEach(row => {
      const st = app.stations[row.code];
      const y = T + row.i * rowH + rowH / 2;
      const g = s("g", { class: "row", "data-i": row.i });
      g.append(
        s("rect", { class: "row-hit", x: 0, y: y - rowH / 2, width: W, height: rowH }),
        s("text", { class: "lbl", x: 0, y: y - 2, text: st.name }),
        s("text", { class: "lbl-hi", x: 0, y: y + 12, text: st.name_hi }),
        s("line", { class: "trackline", x1: L, x2: W - R, y1: y, y2: y, stroke: "var(--rule)" }),
        s("rect", { class: "band", y: y - 7, height: 14, x: L, width: 0, rx: 3, fill: "var(--band)", stroke: "rgba(244,197,20,.55)" }),
        s("line", { class: "sch", y1: y - 9, y2: y + 9, x1: L, x2: L, stroke: "var(--sched)", "stroke-width": 2, "stroke-dasharray": "3 2" }),
        s("path", { class: "today", d: "M0,-6L6,0L0,6L-6,0Z", fill: "var(--today)", transform: `translate(${L},${y})` }),
        s("rect", { class: "med", y: y - 9, height: 18, width: 4, x: L, fill: "var(--kalyon)", rx: 1 }),
        s("circle", { class: "act", cy: y, cx: L, r: 5, fill: "var(--actual)", stroke: "var(--panel)", "stroke-width": 2 }));
      g.addEventListener("click", () => { if (row.i > state.k) { state.row = row.i; draw(); } });
      g.addEventListener("mousemove", e => {
        const cur = g._row;
        if (!cur) return;
        tip(cur.f ? `<b>${st.name}</b><br>Timetable ${hhmm(cur.sched)}<br>Today’s estimate ${hhmm(cur.f.b1)}<br>Kalyon <b>${hhmm(cur.f.med)}</b> (${hhmm(cur.f.lo)}–${hhmm(cur.f.hi)})${showActual ? `<br>Actual ${hhmm(cur.act)}` : ""}`
          : `<b>${st.name}</b><br>Passed. Actual ${hhmm(cur.act)}, timetable ${hhmm(cur.sched)}`, e);
      });
      g.addEventListener("mouseleave", () => tip(null));
      svg.querySelector(".rows").append(g);
    });
    ladderEl.append(svg);
  }
  const ax = clear(svg.querySelector(".axis"));
  for (let v = t0; v <= t1; v += (t1 - t0) > 720 ? 120 : 60) {
    ax.append(s("line", { x1: x(v), x2: x(v), y1: T - 6, y2: H - 6 }), s("text", { x: x(v), y: T - 12, "text-anchor": "middle", text: hhmm(v) }));
  }
  rows.forEach(row => {
    const g = svg.querySelector(`.row[data-i="${row.i}"]`);
    g._row = row;
    const y = T + row.i * rowH + rowH / 2;
    g.style.opacity = row.passed ? 0.45 : 1;
    g.querySelector(".row-hit").classList.toggle("sel", row.i === state.row);
    animAttr(g.querySelector(".sch"), { x1: x(row.sched), x2: x(row.sched) });
    const f = row.f;
    const band = g.querySelector(".band"), med = g.querySelector(".med"), today = g.querySelector(".today");
    if (f) {
      animAttr(band, { x: x(f.lo), width: Math.max(2, x(f.hi) - x(f.lo)) });
      animAttr(med, { x: x(f.med) - 2 });
      today.setAttribute("transform", `translate(${x(f.b1).toFixed(1)},${y})`);
      today.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)";
      band.style.opacity = med.style.opacity = today.style.opacity = 1;
    } else {
      band.style.opacity = med.style.opacity = today.style.opacity = 0;
    }
    const act = g.querySelector(".act");
    animAttr(act, { cx: x(row.act) });
    act.style.opacity = showActual || row.passed ? 1 : 0;
  });
}

function evolution(r, train, fresh) {
  const w0 = app.w0();
  const n = train.stops.length;
  const pts = [];
  for (let k = 0; k < n - 1; k++) {
    const f = app.forecast(r, k).find(x => x.s === n - 1);
    pts.push({ k, b1: f.b1, med: f.med, lo: f.lo, hi: f.hi });
  }
  const actual = w0 + app.arr(r, n - 1);
  $("#evo-title").textContent = `How the forecast for ${app.stations[train.stops[n - 1].code].name} changed`;
  const W = 760, H = 250, L = 56, R = 20, T = 16, B = 44;
  const all = pts.flatMap(p => [p.b1, p.lo, p.hi]).concat([actual]);
  const y0 = Math.min(...all) - 10, y1 = Math.max(...all) + 10;
  const x = linear(0, Math.max(1, n - 2), L, W - R), y = linear(y0, y1, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Destination forecast after each report" });
  niceTicks(y0, y1, 5).forEach(v => svg.append(
    s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }),
    s("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: hhmm(v) })));
  pts.forEach(p => svg.append(s("text", { x: x(p.k), y: H - B + 18, "text-anchor": "middle", fill: p.k === state.k ? "var(--chalk)" : "var(--faint)", "font-size": 11, "font-weight": p.k === state.k ? 700 : 400, text: train.stops[p.k].code })));
  svg.append(s("text", { x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle", fill: "var(--faint)", "font-size": 11, text: "Report made on leaving station" }));
  const band = `M${pts.map(p => `${x(p.k)},${y(p.hi)}`).join("L")}L${pts.slice().reverse().map(p => `${x(p.k)},${y(p.lo)}`).join("L")}Z`;
  svg.append(s("path", { d: band, fill: "var(--band)" }));
  if (showActual) svg.append(s("line", { x1: L, x2: W - R, y1: y(actual), y2: y(actual), stroke: "var(--actual)", "stroke-width": 2 }),
    s("text", { x: W - R, y: y(actual) - 6, "text-anchor": "end", fill: "var(--actual)", "font-size": 12, "font-weight": 700, text: `Actual ${hhmm(actual)}` }));
  const lb1 = s("path", { d: `M${pts.map(p => `${x(p.k)},${y(p.b1)}`).join("L")}`, stroke: "var(--today)", "stroke-width": 2.5, fill: "none", "stroke-dasharray": "7 5" });
  const lm = s("path", { d: `M${pts.map(p => `${x(p.k)},${y(p.med)}`).join("L")}`, stroke: "var(--kalyon)", "stroke-width": 3, fill: "none" });
  svg.append(lb1, lm);
  pts.forEach(p => svg.append(
    s("circle", { cx: x(p.k), cy: y(p.med), r: p.k === state.k ? 6 : 3.5, fill: "var(--kalyon)", stroke: "var(--panel)", "stroke-width": 2, style: "cursor:pointer", onclick: () => setK(p.k),
      onmousemove: e => tip(`After leaving <b>${app.stations[train.stops[p.k].code].name}</b><br>Kalyon ${hhmm(p.med)} (${hhmm(p.lo)}–${hhmm(p.hi)})<br>Today’s estimate ${hhmm(p.b1)}`, e),
      onmouseleave: () => tip(null) })));
  svg.append(s("line", { x1: x(state.k), x2: x(state.k), y1: T, y2: H - B, stroke: "var(--chalk)", "stroke-opacity": 0.25 }));
  clear(evoEl).append(svg);
  if (fresh) { drawIn(lm, 1100); drawIn(lb1, 1100, 150); }
}
