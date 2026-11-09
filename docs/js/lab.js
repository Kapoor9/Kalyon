// Model lab: honest evaluation against the baselines, by horizon, with hypothesis tests.
import { h, s, $, clear, linear, niceTicks, tip, tween } from "./ui.js?v=202611091935";

let app, tableEl, part = "test";

export function mount(a) {
  app = a;
  const m = app.metrics;
  const root = $("#v-lab");
  const w = m.wilcoxon;
  const stops = m.by_stops;
  const gainFirst = stops[0].b1 - stops[0].m1, gainLast = stops[stops.length - 1].b1 - stops[stops.length - 1].m1;
  const maxGain = Math.max(...stops.map(r => r.b1 - r.m1));
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Model lab"),
        h("p", { class: "lede" }, `Trained on ${m.periods.train}, tuned on ${m.periods.val}, tested on ${m.periods.test}. Two trains were kept out of training entirely to test forecasts for trains the models have never seen.`))),
    h("div", { class: "lab" },
      h("div", { class: "panel span-7" },
        h("div", { class: "panel-title" }, h("h3", {}, "Accuracy on unseen test days"),
          h("div", { class: "seg", role: "group", "aria-label": "Which forecasts" },
            ...[["test", "All"], ["intermediate", "Intermediate stations"], ["held_out", "Unseen trains"]].map(([k, l]) =>
              h("button", { "aria-pressed": String(k === part), "data-k": k, onclick: e => { part = k; e.target.parentNode.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k))); table(); } }, l)))),
        tableEl = h("div", { class: "tablewrap" }),
        h("p", { class: "small", style: "margin-top:10px" }, "Error = forecast arrival minus actual arrival, in minutes, over every station ahead at every report. The historical average baseline (B2) does badly because rare rescheduled runs inflate its averages.")),
      h("div", { class: "panel span-5" },
        h("div", { class: "panel-title" }, h("h3", {}, "Hypotheses from the paper")),
        h("div", { class: "hyp" },
          hyp("H1", `Kalyon beats the constant-delay estimate beyond the next station: ${w.mae_b1.toFixed(1)} → ${w.mae_m1.toFixed(1)} min average error over ${w.n.toLocaleString("en-IN")} forecasts. Wilcoxon signed-rank test, p ${w.p_value < 0.001 ? "< 0.001" : "= " + w.p_value.toFixed(3)}.`, true),
          hyp("H2", `The gain is smallest close to the station (${gainFirst.toFixed(1)} min at the next stop) and grows with distance (up to ${maxGain.toFixed(1)} min).`, gainLast > gainFirst),
          hyp("H3", `The likely range held ${(m.test.interval.coverage * 100).toFixed(1)}% of actual arrivals, against a target of 80%.`, Math.abs(m.test.interval.coverage - 0.8) < 0.03),
          hyp("H4", `On unseen trains Kalyon is still better (${m.held_out.m1.mae.toFixed(1)} against ${m.held_out.b1.mae.toFixed(1)} min), but the gain is smaller and the range held ${(m.held_out.interval.coverage * 100).toFixed(0)}% of arrivals. History matters.`, "part"))),
      h("div", { class: "panel span-7 chart" },
        h("div", { class: "panel-title" }, h("h3", {}, "Average error by how far ahead the forecast is"), h("span", { class: "small" }, "Hours of scheduled travel left")),
        h("div", { class: "legend", style: "margin-bottom:6px" },
          h("span", { class: "key" }, h("i", { class: "today" }), "Today’s estimate"), h("span", { class: "key" }, h("i", { class: "kal" }), "Kalyon")),
        h("div", { id: "lab-horizon" })),
      h("div", { class: "panel span-5 chart" },
        h("div", { class: "panel-title" }, h("h3", {}, "Is the range honest?"), h("span", { class: "small" }, "Share of arrivals inside it, by stops ahead")),
        h("div", { id: "lab-cov" })),
      h("div", { class: "panel span-6" },
        h("div", { class: "panel-title" }, h("h3", {}, "What drives the corrections"), h("span", { class: "small" }, "Mean |SHAP|, minutes")),
        h("div", { id: "lab-imp" })),
      h("div", { class: "panel span-6" },
        h("div", { class: "panel-title" }, h("h3", {}, "Intermediate stations"), h("span", { class: "small" }, "Average error, minutes")),
        h("div", { class: "tablewrap" }, h("table", { class: "data" },
          h("thead", {}, h("tr", {}, h("th", {}, "Station"), h("th", {}, "Forecasts"), h("th", {}, "Today"), h("th", {}, "Kalyon"), h("th", {}, "Better by"))),
          h("tbody", {}, ...m.by_station.slice(0, 12).map(r => h("tr", {},
            h("td", {}, app.stations[r.station].name, " ", h("span", { class: "hi faint" }, app.stations[r.station].name_hi)),
            h("td", {}, r.n.toLocaleString("en-IN")), h("td", {}, r.b1.toFixed(1)), h("td", { style: "color:var(--board);font-weight:700" }, r.m1.toFixed(1)),
            h("td", {}, `${Math.round((1 - r.m1 / r.b1) * 100)}%`))))))),
      h("div", { class: "panel span-12" },
        h("p", { class: "small" },
          `Data: ${m.counts.runs.toLocaleString("en-IN")} synthetic train runs, ${m.counts.events.toLocaleString("en-IN")} station events, ${m.counts.rows.toLocaleString("en-IN")} forecast situations. `,
          `Models: LightGBM with ${m.counts.trees.m1} trees (point model) and ${m.counts.trees.q10}, ${m.counts.trees.q50} and ${m.counts.trees.q90} trees (10th, 50th, 90th percentile), early-stopped on the validation period. `,
          `Range widened by a factor of ${m.val_interval_scale.toFixed(2)} on validation data to reach 80% coverage. All of this is produced by the Python pipeline in the repository (python -m kalyon.train).`))));
  table();
  app.on("view", v => { if (v === "lab") { horizon(); coverage(); importance(); } });
}

function hyp(id, text, ok) {
  return h("div", {}, h("b", {}, id), h("span", {}, text),
    h("span", { class: `verdict${ok === "part" ? " part" : ""}` }, ok === "part" ? "Partly" : ok ? "Supported" : "Not supported"));
}

function table() {
  const m = app.metrics[part];
  const names = app.metrics.names;
  const best = Math.min(...Object.keys(names).map(k => m[k].mae));
  clear(tableEl).append(h("table", { class: "data" },
    h("thead", {}, h("tr", {}, h("th", {}, "Method"), h("th", {}, "Avg error"), h("th", {}, "RMSE"), h("th", {}, "Within ±5 min"), h("th", {}, "Within ±15 min"))),
    h("tbody", {}, ...Object.entries(names).map(([k, n]) => h("tr", { class: m[k].mae === best ? "best" : "" },
      h("td", {}, n), h("td", {}, `${m[k].mae.toFixed(1)} min`), h("td", {}, m[k].rmse.toFixed(1)),
      h("td", {}, `${(m[k].within5 * 100).toFixed(0)}%`), h("td", {}, `${(m[k].within15 * 100).toFixed(0)}%`)))),
    h("tfoot", {}, h("tr", {}, h("td", { colspan: 5, class: "small", style: "text-align:left" },
      `Kalyon likely range: holds ${(m.interval.coverage * 100).toFixed(1)}% of arrivals, average width ${m.interval.width.toFixed(0)} min. ${m.b1.n.toLocaleString("en-IN")} forecasts.`)))));
}

function horizon() {
  const rows = app.metrics.by_hours;
  const W = 720, H = 300, L = 44, R = 10, T = 16, B = 40;
  const x = linear(0, rows.length, L, W - R), y = linear(0, Math.max(...rows.map(r => r.b1)) * 1.12, H - B, T);
  const bw = (x(1) - x(0)) * 0.32;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Average error by forecast horizon" });
  niceTicks(0, y.invert(T), 5).forEach(v => svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }),
    s("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: v })));
  rows.forEach((r, i) => {
    const cx = (x(i) + x(i + 1)) / 2;
    const b1 = s("rect", { x: cx - bw - 2, width: bw, y: y(0), height: 0, fill: "var(--today)", rx: 2 });
    const m1 = s("rect", { x: cx + 2, width: bw, y: y(0), height: 0, fill: "var(--kalyon)", rx: 2 });
    const lab = s("text", { x: cx + 2 + bw / 2, y: y(r.m1) - 6, "text-anchor": "middle", fill: "var(--board)", "font-size": 11, "font-weight": 700, text: `−${Math.round((1 - r.m1 / r.b1) * 100)}%`, opacity: 0 });
    svg.append(b1, m1, lab, s("text", { x: cx, y: H - B + 18, "text-anchor": "middle", fill: "var(--muted)", "font-size": 12, text: r.bin }));
    const hit = s("rect", { x: x(i), width: x(1) - x(0), y: T, height: H - B - T, fill: "transparent",
      onmousemove: e => tip(`<b>${r.bin} ahead</b><br>Today’s estimate ${r.b1.toFixed(1)} min<br>Kalyon ${r.m1.toFixed(1)} min<br>${r.n.toLocaleString("en-IN")} forecasts`, e),
      onmouseleave: () => tip(null) });
    svg.append(hit);
    tween(0, 1, 900 + i * 90, p => {
      b1.setAttribute("y", y(r.b1 * p)); b1.setAttribute("height", y(0) - y(r.b1 * p));
      m1.setAttribute("y", y(r.m1 * p)); m1.setAttribute("height", y(0) - y(r.m1 * p));
      lab.setAttribute("opacity", p > 0.9 ? 1 : 0);
    });
  });
  svg.append(s("text", { x: L - 36, y: T - 4, fill: "var(--faint)", "font-size": 11, text: "min" }));
  clear($("#lab-horizon")).append(svg);
}

function coverage() {
  const rows = app.metrics.by_stops;
  const W = 520, H = 300, L = 40, R = 10, T = 16, B = 40;
  const x = linear(0, rows.length, L, W - R), y = linear(0.5, 1, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Interval coverage by stops ahead" });
  [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(v => svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }),
    s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: `${v * 100}%` })));
  svg.append(s("line", { x1: L, x2: W - R, y1: y(0.8), y2: y(0.8), stroke: "var(--chalk)", "stroke-dasharray": "5 4" }),
    s("text", { x: W - R, y: y(0.8) - 6, "text-anchor": "end", fill: "var(--chalk)", "font-size": 11, text: "Target 80%" }));
  rows.forEach((r, i) => {
    const cx = (x(i) + x(i + 1)) / 2, bw = (x(1) - x(0)) * 0.55;
    const bar = s("rect", { x: cx - bw / 2, width: bw, y: y(0.5), height: 0, fill: "var(--band)", stroke: "var(--kalyon)", rx: 2 });
    svg.append(bar, s("text", { x: cx, y: H - B + 18, "text-anchor": "middle", fill: "var(--muted)", "font-size": 12, text: r.bin }),
      s("rect", { x: x(i), width: x(1) - x(0), y: T, height: H - B - T, fill: "transparent",
        onmousemove: e => tip(`<b>${r.bin} stop${r.bin === "1" ? "" : "s"} ahead</b><br>${(r.coverage * 100).toFixed(1)}% inside the range<br>Average width ${r.width.toFixed(0)} min`, e),
        onmouseleave: () => tip(null) }));
    tween(0, 1, 900 + i * 80, p => { const v = 0.5 + (r.coverage - 0.5) * p; bar.setAttribute("y", y(v)); bar.setAttribute("height", y(0.5) - y(v)); });
  });
  svg.append(s("text", { x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle", fill: "var(--faint)", "font-size": 11, text: "Stops ahead" }));
  clear($("#lab-cov")).append(svg);
}

function importance() {
  const rows = app.metrics.importance.slice(0, 10);
  const max = rows[0].mean_abs_shap;
  const el = clear($("#lab-imp"));
  rows.forEach((r, i) => {
    const span = h("span");
    el.append(h("div", { class: "impbar" }, h("span", {}, r.label), h("div", {}, span), h("em", {}, r.mean_abs_shap.toFixed(1))));
    setTimeout(() => { span.style.width = `${(r.mean_abs_shap / max) * 100}%`; }, 60 + i * 60);
  });
  el.append(h("p", { class: "small", style: "margin-top:8px" }, `The signals that move forecasts most: ${rows.slice(0, 3).map(r => r.label.toLowerCase()).join(", ")}. Computed with TreeSHAP on 6,000 test forecasts.`));
}
