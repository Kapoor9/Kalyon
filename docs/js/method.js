// Method & data: the Python pipeline, what is real and what is synthetic, and data-quality rules.
import { h, s, $, clear, linear } from "./ui.js?v=202611130818";

const DQ = [
  ["Summary contradicts records", "Train 13037 labelled “100% on time, 0 min average delay”, while its own station table shows a 79 min average at Dehradun over 108 records.",
    "Ignore summary fields; recompute from station-level records.", "79 min average delay at Dehradun"],
  ["Blank delay read as on time", "Run history rows for 13037 with the delay field left empty.",
    "A missing delay is missing, never zero.", "Rows marked missing and left out of averages"],
  ["Two pages, two answers", "13037 at Dehradun: 1 h 37 min average on the station page, 1 h 19 min on the train page.",
    "Recompute every statistic from one raw source.", "One figure, with its source and sample size"],
  ["Name does not match route", "04009 named as a Delhi Sarai Rohilla–Bhatinda service but listed as running Sitamarhi to Delhi.",
    "Key trains on number plus run date; flag name–route mismatches.", "Record kept, flagged for review"],
  ["Extreme outlier", "One run of 15002 recorded 845 min late, inflating its average.",
    "Keep for evaluation; train with a robust (Huber) loss.", "Outlier no longer dominates the model"],
  ["Tiny sample ranked top", "04321 ranked “most delayed” at Dehradun on 3 of its 15 recorded runs.",
    "Require a minimum sample before ranking.", "Shown as indicative only"],
];

export function mount(app) {
  const root = $("#v-method");
  const c = app.metrics.calibration;
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Method and data"),
        h("p", { class: "lede" }, "How Kalyon is built, what is real and what is synthetic, and the cleaning rules real data would need."))),
    h("h3", { style: "margin-bottom:12px" }, "The Python pipeline"),
    h("div", { class: "pipeline" },
      pipe("Simulate", "A year of calibrated train runs on 17 stations and 18 services: fog, rain, festivals, rescheduling, single-line crossings.", "kalyon/simulate.py"),
      pipe("Build features", "19 signals for every report and every station ahead, with history computed from past data only.", "kalyon/features.py"),
      pipe("Train", "LightGBM learns the correction to the constant-delay estimate; three quantile models learn the range.", "kalyon/train.py"),
      pipe("Evaluate", "Chronological split, three baselines, horizon analysis, paired Wilcoxon test, unseen trains.", "reports/metrics.json"),
      pipe("Serve", "FastAPI serves forecasts over REST and WebSocket; this page runs the same trees in JavaScript.", "api/main.py")),
    h("div", { class: "grid", style: "grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-top:16px" },
      h("div", {},
        h("p", { class: "small", style: "margin-bottom:6px" }, "The core idea, simplified from kalyon/train.py and kalyon/features.py"),
        h("pre", { class: "code", html: CODE })),
      h("div", { class: "panel" },
        h("h3", {}, "Proof that the browser and Python agree"),
        h("p", { class: "small", style: "margin:6px 0 10px" }, "tests/parity.mjs replays 300 forecasts and 400 feature rows through this page’s engine and compares them with LightGBM in Python."),
        h("pre", { class: "code" }, "$ node tests/parity.mjs\nfeature rows=400 max|feature diff|=1.7e-14\nrows=300 max|pred diff|=0.0e+0 max|shap diff|=7.1e-15\nPARITY OK\n\n$ python -m pytest tests/test_api.py\n3 passed"),
        h("p", { class: "small", style: "margin-top:10px" }, "Run it yourself: pip install -r requirements.txt, python -m kalyon.train, uvicorn api.main:app, then open http://127.0.0.1:8000/docs."))),
    h("h3", { style: "margin:34px 0 12px" }, "Real data that shaped the design"),
    h("div", { class: "obs" },
      obs("Public ETAs assume the delay stays constant", "On the Dehradun live-trains board on 9 Nov 2026, every expected arrival equalled timetable plus current delay: 12092 due 12:30, 45 min late, expected 13:15."),
      obs("Delay changes along the route", "Train 15002’s average delay grows from 52 min at Dehradun to 91 min at Najibabad, then falls to 73 at Moradabad (32 runs in 2026)."),
      obs("Many trains start hours late", "Runs dated 7–8 Nov 2026 included dozens of services rescheduled at origin by about 4 hours to 17 h 46 min, many of them festival, exam and Holi specials."),
      obs("Aggregator data needs cleaning", "Summaries contradict records, blanks are read as on time, and averages hide outliers. See the cleaning rules below.")),
    h("p", { class: "small", style: "margin-top:8px" }, "Source: RunningStatus.in station history, train history, live-trains and rescheduled-trains pages, viewed 8–9 Nov 2026. Third-party aggregator data, not official Indian Railways statistics."),
    h("div", { class: "grid", style: "grid-template-columns:repeat(auto-fit,minmax(340px,1fr));margin-top:24px" },
      ...c.map(calib)),
    h("div", { class: "panel", style: "margin-top:24px" },
      h("div", { class: "panel-title" }, h("h3", {}, "Data-quality inspector"),
        h("label", { class: "toggle" }, "Apply cleaning rules", h("input", { type: "checkbox", class: "switch", id: "dq-toggle", onchange: e => dq(e.target.checked) }))),
      h("div", { class: "tablewrap" }, h("table", { class: "data dq-table", id: "dq" }))),
    h("div", { class: "grid", style: "grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:24px" },
      h("div", { class: "panel" },
        h("h3", {}, "What is real"),
        h("p", { class: "small", style: "margin-top:6px" }, "The problem, the observations above, the corridor’s stations and approximate geography, the methods (LightGBM, quantile regression, TreeSHAP), and the evaluation design from the research paper.")),
      h("div", { class: "panel" },
        h("h3", {}, "What is synthetic"),
        h("p", { class: "small", style: "margin-top:6px" }, "The 18 train services (numbered K101–K172), their timetables and every replayed run. Two services are calibrated to the observed averages of 15002 and 13037. Results show the pipeline works, not real-world accuracy.")),
      h("div", { class: "panel" },
        h("h3", {}, "What a pilot would need"),
        h("p", { class: "small", style: "margin-top:6px" }, "Authorised access to NTES or RTIS running events and per-station history. The live adapter would feed the same forecast function the replay uses."))));
  dq(false);
}

function pipe(title, body, file) {
  return h("div", { class: "pipe" }, h("h3", {}, title), h("p", {}, body), h("p", { style: "margin-top:8px" }, h("code", {}, file)));
}
function obs(title, body) { return h("div", { class: "panel" }, h("h3", {}, title), h("p", {}, body)); }

function calib(c) {
  const W = 460, H = 220, L = 40, R = 12, T = 18, B = 34;
  const vals = [...c.observed, ...c.synthetic];
  const x = linear(0, c.stations.length - 1, L + 16, W - R - 16), y = linear(Math.min(...vals) - 10, Math.max(...vals) + 10, H - B, T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Observed and synthetic average delays for ${c.observed_train}` });
  [Math.min(...vals) - 10, Math.max(...vals) + 10].forEach(v => svg.append(s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 11, text: Math.round(v) })));
  c.stations.forEach((code, i) => svg.append(s("text", { x: x(i), y: H - B + 18, "text-anchor": "middle", fill: "var(--muted)", "font-size": 12, text: code })));
  const path = arr => `M${arr.map((v, i) => `${x(i)},${y(v)}`).join("L")}`;
  svg.append(s("path", { d: path(c.observed), stroke: "var(--chalk)", "stroke-width": 7, "stroke-opacity": 0.25, fill: "none", "stroke-linecap": "round" }),
    s("path", { d: path(c.synthetic), stroke: "var(--kalyon)", "stroke-width": 2.5, fill: "none", "stroke-dasharray": "6 4" }));
  c.observed.forEach((v, i) => svg.append(s("text", { x: x(i), y: y(v) - 10, "text-anchor": "middle", fill: "var(--chalk)", "font-size": 12, "font-weight": 700, text: v })));
  return h("div", { class: "panel chart" },
    h("div", { class: "panel-title" }, h("h3", {}, `Calibration: ${c.synthetic_train} matches ${c.observed_train}`)),
    h("div", { class: "legend", style: "margin-bottom:6px" },
      h("span", { class: "key" }, h("i", { style: "background:var(--chalk);opacity:.4;height:6px" }), "Observed average delay, min"),
      h("span", { class: "key" }, h("i", { class: "kal" }), "Synthetic average")),
    svg, h("p", { class: "small" }, c.label));
}

function dq(on) {
  const t = clear($("#dq"));
  t.append(h("thead", {}, h("tr", {}, h("th", {}, "Issue"), h("th", {}, "Observed example"), h("th", {}, on ? "Rule applied" : "Status"), h("th", {}, on ? "After cleaning" : ""))),
    h("tbody", {}, ...DQ.map(([issue, ex, rule, after], i) => h("tr", { class: on ? "fixed" : "", style: `animation:feedIn .4s ${i * 70}ms both` },
      h("td", {}, h("b", {}, issue)), h("td", { class: "small" }, ex),
      on ? h("td", { class: "ok" }, rule) : h("td", { class: "flag" }, "Flagged"),
      h("td", { class: "small" }, on ? after : "")))));
}

const CODE = `<span class="c"># The target is the error of today's estimate, not the arrival time itself.</span>
<span class="c"># ETA_CD(s) = scheduled_arrival(s) + current_delay(k)</span>
row[<span class="s">"residual"</span>] = arr_delay[s] - dep_delay[k]

<span class="c"># Point model: robust to rare extreme delays.</span>
models[<span class="s">"m1"</span>] = fit({<span class="s">"objective"</span>: <span class="s">"huber"</span>, <span class="s">"alpha"</span>: <span class="k">20.0</span>}, X_train, y_train, X_val, y_val)

<span class="c"># Range: 10th, 50th and 90th percentile models (pinball loss).</span>
<span class="k">for</span> name, q <span class="k">in</span> {<span class="s">"q10"</span>: <span class="k">0.1</span>, <span class="s">"q50"</span>: <span class="k">0.5</span>, <span class="s">"q90"</span>: <span class="k">0.9</span>}.items():
    models[name] = fit({<span class="s">"objective"</span>: <span class="s">"quantile"</span>, <span class="s">"alpha"</span>: q}, ...)

<span class="c"># Kalyon ETA = today's estimate + learned correction.</span>
eta = sched_arr + cur_delay + models[<span class="s">"q50"</span>].predict(X)`;
