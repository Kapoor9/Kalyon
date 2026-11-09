// What-if simulator: change the situation and watch the models re-forecast live in the browser.
import { forecastAll } from "./engine.js?v=202611091935";
import { h, s, $, clear, linear, niceTicks, hhmm, mins, tip, tween, fill } from "./ui.js?v=202611091935";
import { renderWhy } from "./explain.js?v=202611091935";

let app, trainSel, stopSel, chartEl, whyEl, deltaEl, deltaNote, ctl = {}, sel = null, prev = null;
const S = { train: "K131", k: 1, delay: 45, trend: 10, resched: 0, vis: 6, rain: 0, festival: false, hour: null, month: 1, unseen: false };

const ICON = {
  clear: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/></svg>',
  fog: '<svg viewBox="0 0 32 32"><path d="M4 11h18M8 16h20M4 21h16M10 26h14"/><path d="M22 6a5 5 0 0 1 5 5"/></svg>',
  fest: '<svg viewBox="0 0 32 32"><path d="M16 4c3 4 3 7 0 10-3-3-3-6 0-10z"/><path d="M8 28h16M10 28l2-10h8l2 10"/></svg>',
  resched: '<svg viewBox="0 0 32 32"><circle cx="16" cy="17" r="11"/><path d="M16 10v7l5 3M12 3h8"/></svg>',
  rain: '<svg viewBox="0 0 32 32"><path d="M8 18a6 6 0 0 1 2-11.6A8 8 0 0 1 25 9a5 5 0 0 1-1 9.9H8z"/><path d="M11 23l-2 4M17 23l-2 4M23 23l-2 4"/></svg>',
};
const PRESETS = [
  ["Clear afternoon", "clear", "A normal day, 20 min late", { delay: 20, trend: 0, resched: 0, vis: 8, rain: 0, festival: false, hour: 14, month: 9 }],
  ["Dense fog at night", "fog", "January, 150 m visibility", { delay: 70, trend: 25, resched: 0, vis: 0.15, rain: 0, festival: false, hour: 23, month: 1 }],
  ["Festival evening rush", "fest", "October, crowded evening", { delay: 55, trend: 15, resched: 0, vis: 7, rain: 0, festival: true, hour: 19, month: 10 }],
  ["Rescheduled by 6 hours", "resched", "Late before it even starts", { delay: 360, trend: 0, resched: 360, vis: 7, rain: 0, festival: false, hour: null, month: 11 }],
  ["Monsoon downpour", "rain", "August, 60 mm of rain", { delay: 35, trend: 10, resched: 0, vis: 3, rain: 60, festival: false, hour: 16, month: 8 }],
];

export function mount(a) {
  app = a;
  const root = $("#v-whatif");
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "What-if"),
        h("p", { class: "lede" }, "Set up any situation and the four models re-forecast instantly, in your browser. Compare how today’s constant-delay estimate and Kalyon react.")),
    ),
    h("div", { class: "presets", role: "group", "aria-label": "Scenario presets" }, ...PRESETS.map(([label, icon, sub, p]) => h("button", { class: "panel preset", "aria-pressed": "false", onclick: e => {
      Object.assign(S, p); syncControls(); update();
      e.currentTarget.parentNode.querySelectorAll(".preset").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
    } }, h("span", { html: ICON[icon] }), h("b", {}, label), h("span", {}, sub)))),
    h("div", { class: "whatif" },
      h("div", { class: "panel controls" },
        h("div", { class: "ctl" }, h("label", {}, "Train"), trainSel = h("select", { onchange: e => { S.train = e.target.value; S.k = 0; fillStops(); update(); } })),
        h("div", { class: "ctl" }, h("label", {}, "Train has just left"), stopSel = h("select", { onchange: e => { S.k = +e.target.value; syncControls(); update(); } })),
        slider("delay", "Current delay", 0, 600, 1, v => mins(v)),
        slider("trend", "Delay change over the last stops", -30, 60, 1, v => mins(v, true), "Positive means the train has been losing time."),
        slider("resched", "Rescheduled at origin", 0, 1066, 5, v => (v ? mins(v) : "no")),
        slider("vis", "Visibility", 0.05, 10, 0.05, v => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} km`, "Below 1 km is dense fog."),
        slider("rain", "Rainfall", 0, 80, 1, v => `${v} mm`),
        slider("hour", "Time of report", 0, 23.75, 0.25, v => hhmm(v * 60)),
        h("div", { class: "ctl" }, h("label", {}, "Month"),
          ctl.month = h("select", { onchange: e => { S.month = +e.target.value; update(); } },
            ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => h("option", { value: i + 1 }, m)))),
        h("label", { class: "toggle" }, "Festival travel period", ctl.festival = h("input", { type: "checkbox", class: "switch", onchange: e => { S.festival = e.target.checked; update(); } })),
        h("label", { class: "toggle" }, "Treat as a new train with no history", ctl.unseen = h("input", { type: "checkbox", class: "switch", onchange: e => { S.unseen = e.target.checked; update(); } }))),
      h("div", { class: "grid", style: "align-content:start" },
        h("div", { class: "panel" },
          h("div", { class: "panel-title" },
            h("div", {}, h("h3", { id: "wi-dest" }, "At the destination"), deltaNote = h("p", { class: "small" })),
            deltaEl = h("div", { class: "delta num" }, "0 min")),
          h("div", { class: "legend", style: "margin-bottom:8px" },
            h("span", { class: "key" }, h("i", { class: "today" }), "Today’s estimate: delay stays the same"),
            h("span", { class: "key" }, h("i", { class: "kal" }), "Kalyon"),
            h("span", { class: "key" }, h("i", { class: "band" }), "Likely range")),
          chartEl = h("div", { class: "chart" })),
        h("div", { class: "panel" }, h("div", { class: "panel-title" }, h("h3", { id: "wi-why" }, "Why")), whyEl = h("div")))));
  for (const t of Object.values(app.trains)) trainSel.append(h("option", { value: t.number }, `${t.number}  ${t.name}`));
  trainSel.value = S.train;
  fillStops();
  app.on("view", v => { if (v === "whatif") update(); });
}

function slider(key, label, min, max, step, fmt, hint) {
  const out = h("output");
  const input = h("input", { type: "range", min, max, step, value: S[key] ?? min, "aria-label": label,
    oninput: e => { S[key] = +e.target.value; out.textContent = fmt(S[key]); update(); } });
  ctl[key] = { input, out, fmt };
  return h("div", { class: "ctl" }, h("label", {}, label, out), input, hint ? h("div", { class: "hint" }, hint) : null);
}

function fillStops() {
  const t = app.trains[S.train];
  clear(stopSel);
  t.stops.slice(0, -1).forEach((st, i) => stopSel.append(h("option", { value: i }, `${app.stations[st.code].name} (scheduled ${hhmm(st.dep)})`)));
  stopSel.value = S.k;
  syncControls();
}

function syncControls() {
  const t = app.trains[S.train];
  if (S.hour === null) S.hour = (((t.stops[S.k].dep + S.delay) % 1440) / 60);
  for (const k of ["delay", "trend", "resched", "vis", "rain", "hour"]) {
    const c = ctl[k];
    c.input.value = S[k];
    c.out.textContent = c.fmt(+S[k]);
    fill(c.input);
  }
  ctl.trend.input.disabled = S.k === 0;
  if (S.k === 0) { S.trend = 0; ctl.trend.out.textContent = "first stop"; }
  ctl.month.value = S.month;
  ctl.festival.checked = S.festival;
  ctl.unseen.checked = S.unseen;
  stopSel.value = S.k;
}

function compute() {
  const t = app.trains[S.train];
  const k = S.k;
  const dep = new Array(k + 1).fill(S.delay);
  const weather = { fog_season: [12, 1, 2].includes(S.month) ? 1 : 0, visibility: S.vis, rain: S.rain, festival: S.festival ? 1 : 0 };
  const overrides = { dchg1: k ? S.trend / Math.min(k, 3) : 0, dchg3: k ? S.trend : 0, hour: S.hour, month: S.month, dow: 2, resched: S.resched };
  if (S.unseen) overrides.hist_chg = NaN;
  const st = { depDelays: dep, resched: S.resched, reportTime: t.stops[k].dep + S.delay, date: new Date(Date.UTC(2026, S.month - 1, 15)), weather, overrides };
  return forecastAll(app.M, t, k, st, i => t.stops[i].arr, t.stops[k].dep, true);
}

function update() {
  if (app.view !== "whatif") return;
  const t = app.trains[S.train];
  const fc = compute();
  if (sel === null || !fc.find(f => f.s === sel)) sel = fc[fc.length - 1].s;
  const dest = fc[fc.length - 1];
  const diff = dest.med - dest.b1;
  $("#wi-dest").textContent = `At ${app.stations[dest.code].name}: Kalyon ${hhmm(dest.med)}, today’s estimate ${hhmm(dest.b1)}`;
  deltaNote.textContent = `Likely between ${hhmm(dest.lo)} and ${hhmm(dest.hi)}. Timetable ${hhmm(dest.sched)}.`;
  deltaEl.textContent = mins(diff, true);
  deltaEl.className = `delta num ${diff > 0.5 ? "up" : diff < -0.5 ? "down" : ""}`;
  chart(t, fc);
  const row = fc.find(f => f.s === sel);
  $("#wi-why").textContent = `Why Kalyon expects ${hhmm(row.med)} at ${app.stations[row.code].name}`;
  renderWhy(whyEl, app.M, row);
}

function chart(t, fc) {
  const W = 760, H = 320, L = 50, R = 20, T = 20, B = 58;
  const cur = { today: fc.map(f => f.b1 - f.sched), med: fc.map(f => f.med - f.sched), lo: fc.map(f => f.lo - f.sched), hi: fc.map(f => f.hi - f.sched) };
  const from = prev && prev.n === fc.length && prev.train === S.train && prev.k === S.k ? prev.vals : cur;
  prev = { n: fc.length, train: S.train, k: S.k, vals: cur };
  const allV = [...cur.lo, ...cur.hi, ...cur.today, 0];
  const y0 = Math.min(0, ...allV) - 5, y1 = Math.max(...allV) + 10;
  const x = linear(0, Math.max(1, fc.length - 1), L + 20, W - R - 20), y = linear(y0, y1, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Expected minutes late at each station ahead" });
  niceTicks(y0, y1, 5).forEach(v => svg.append(
    s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }),
    s("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: `${v}` })));
  svg.append(s("text", { x: L - 40, y: T - 6, fill: "var(--faint)", "font-size": 11, text: "min late at arrival" }));
  fc.forEach((f, i) => {
    const st = app.stations[f.code];
    svg.append(s("text", { x: x(i), y: H - B + 20, "text-anchor": "middle", fill: f.s === sel ? "var(--chalk)" : "var(--muted)", "font-size": 12, "font-weight": f.s === sel ? 800 : 600, text: st.name.length > 11 ? st.code : st.name }),
      s("text", { x: x(i), y: H - B + 35, "text-anchor": "middle", fill: "var(--faint)", "font-size": 11, "font-family": "Mukta", text: st.name_hi }));
  });
  const band = s("path", { fill: "var(--band)" });
  const today = s("path", { stroke: "var(--today)", "stroke-width": 2.5, "stroke-dasharray": "7 5", fill: "none" });
  const med = s("path", { stroke: "var(--kalyon)", "stroke-width": 3.5, fill: "none", "stroke-linejoin": "round" });
  const dots = fc.map((f, i) => s("circle", { r: f.s === sel ? 7 : 5, fill: "var(--kalyon)", stroke: "var(--panel)", "stroke-width": 2.5, style: "cursor:pointer",
    onclick: () => { sel = f.s; update(); },
    onmousemove: e => tip(`<b>${app.stations[f.code].name}</b><br>Kalyon ${hhmm(f.med)} (${hhmm(f.lo)}–${hhmm(f.hi)})<br>Today’s estimate ${hhmm(f.b1)}<br>Timetable ${hhmm(f.sched)}`, e),
    onmouseleave: () => tip(null) }));
  svg.append(band, today, med, ...dots);
  const paint = p => {
    const v = k => cur[k].map((c, i) => from[k][i] + (c - from[k][i]) * p);
    const lo = v("lo"), hi = v("hi"), md = v("med"), td = v("today");
    band.setAttribute("d", `M${hi.map((q, i) => `${x(i)},${y(q)}`).join("L")}L${lo.map((q, i) => [i, q]).reverse().map(([i, q]) => `${x(i)},${y(q)}`).join("L")}Z`);
    today.setAttribute("d", `M${td.map((q, i) => `${x(i)},${y(q)}`).join("L")}`);
    med.setAttribute("d", `M${md.map((q, i) => `${x(i)},${y(q)}`).join("L")}`);
    dots.forEach((d, i) => { d.setAttribute("cx", x(i)); d.setAttribute("cy", y(md[i])); });
  };
  clear(chartEl).append(svg);
  tween(0, 1, 420, paint);
}
