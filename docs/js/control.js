// Control room: 3D tactical map with replayed trains, the replay clock and the live report feed.
import { h, $, clear, hhmm, dayLabel, mins, delayClass } from "./ui.js?v=202611111558";
import { createMap } from "./map3d.js?v=202611111558";
import { webglOK } from "./fx.js?v=202611111558";

let app, map, feedEl, kpi = {}, selPanel, playBtn;
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

export function mount(a) {
  app = a;
  const root = $("#v-control");
  const mapBox = h("div", { class: "panel ops-map", id: "ops-map" });
  const labels = h("div", { class: "ops-labels" });
  mapBox.append(labels,
    h("div", { class: "ops-hud tl" }, h("div", { class: "clock", id: "clock" }, "07:00"), h("div", { class: "clock-date", id: "clock-date" })),
    h("div", { class: "ops-hud tr" }, h("div", { class: "radar", "aria-hidden": "true" }), h("div", { class: "clock-date", style: "margin-top:6px" }, "Corridor scan")),
    h("div", { class: "ops-hud bl" }, h("div", { class: "map-legend" },
      h("span", {}, h("i", { class: "dot", style: "background:var(--green)" }), "Under 15 min late"),
      h("span", {}, h("i", { class: "dot", style: "background:var(--amber)" }), "15–59 min"),
      h("span", {}, h("i", { class: "dot", style: "background:var(--red)" }), "1 hour+"),
      h("span", {}, "Bright track: double line"),
      h("span", {}, "Dim track: single line"))),
    h("div", { class: "map-tools" },
      h("button", { class: "btn small", "aria-label": "Zoom in", onclick: () => map && map.zoom(0.8) }, "+"),
      h("button", { class: "btn small", "aria-label": "Zoom out", onclick: () => map && map.zoom(1.25) }, "−"),
      h("button", { class: "btn small", onclick: () => map && map.reset() }, "Reset view")));
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("span", { class: "kicker" }, "Step 1 of 6"),
        h("h2", {}, "Control room", h("span", { class: "hi" }, "नियंत्रण कक्ष")),
        h("p", { class: "lede" }, "A full day on the Dehradun corridor, replayed. Every time a train departs a station, Kalyon re-forecasts all the stations ahead.")),
      h("div", { class: "seg", role: "group", "aria-label": "Choose a day to replay", id: "replay-seg" },
        ...app.replays.map(r => h("button", { "data-id": r.id, "aria-pressed": "false", onclick: () => app.setReplay(r.id) }, r.title)))),
    help("Press Play, then click any glowing train. Drag the map to rotate, scroll to zoom. The amber dashed line is Kalyon’s projected path, with its ETA at each station ahead."),
    h("div", { class: "ops" },
      h("div", {},
        mapBox,
        h("div", { class: "panel timeline", id: "timeline" },
          playBtn = h("button", { class: "btn primary play-btn", id: "play", "aria-label": "Play", html: PLAY, onclick: () => app.play(!app.playing) }),
          h("input", { type: "range", class: "scrub", id: "scrub", min: 0, max: 1440, step: 1, value: app.t, "aria-label": "Replay time",
            oninput: e => { app.seek(+e.target.value); map && map.resetTrails(); } }),
          h("div", { class: "seg", role: "group", "aria-label": "Replay speed" },
            ...[[1, "1 min/s"], [5, "5 min/s"], [15, "15 min/s"]].map(([v, l]) =>
              h("button", { "data-speed": v, "aria-pressed": String(app.speed === v), onclick: e => {
                app.speed = v;
                e.target.parentNode.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.speed === v)));
              } }, l))),
          h("span", { id: "replay-note", class: "small" }))),
      h("div", { class: "side" },
        h("div", { class: "kpis", id: "kpis" },
          kpiBox("moving", "Trains on the move"), kpiBox("delay", "Average delay now"),
          kpiBox("reports", "Running reports so far"), kpiBox("fc", "Forecasts issued so far")),
        selPanel = h("div", { class: "panel", id: "sel-panel" }),
        h("div", { class: "panel", id: "feed-panel" },
          h("div", { class: "panel-title" }, h("h3", {}, "Report feed"), h("span", { class: "small" }, "Newest first")),
          feedEl = h("ul", { class: "feed", "aria-live": "polite" })))));
  if (webglOK()) {
    try {
      map = createMap(mapBox, labels, app, {
        onSelect: id => app.selectRun(id),
        onStation: code => { app.boardStation = code; app.emit("board-station", code); app.route("board"); },
      });
    } catch (err) { console.error(err); map = null; }
  }
  if (!map) mapBox.append(h("p", { class: "empty", style: "padding:24px" }, "This browser cannot show the 3D map (WebGL is unavailable). The feed, forecasts and other views still work."));
  app.on("tick", onTick);
  app.on("report", onReport);
  app.on("play", on => { playBtn.innerHTML = on ? PAUSE : PLAY; playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); });
  app.on("replay", r => {
    document.querySelectorAll("#replay-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === r.id)));
    $("#replay-note").textContent = `${r.title}, ${dayLabel(r.t0_day * 1440)}. ${r.note}`;
    map && map.clearTrains();
    rebuildFeed();
    renderSel();
  });
  app.on("select", id => { map && map.select(id, app.view === "control"); renderSel(); });
  app.on("view", v => { if (!map) return; if (v === "control") { map.start(); map.update(app.t); } else map.stop(); });
  renderSel();
}

export function help(text) {
  return h("div", { class: "help-line", role: "note" },
    h("span", { html: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>' }), h("span", {}, text));
}

function kpiBox(id, label) {
  return h("div", { class: "kpi" }, kpi[id] = h("b", {}, "0"), h("span", {}, label));
}

function onTick({ t, jumped }) {
  if (app.view !== "control" && !jumped) return;
  $("#clock").textContent = hhmm(app.abs(t));
  $("#clock-date").textContent = dayLabel(app.abs(t));
  const sc = $("#scrub");
  if (+sc.value !== Math.round(t)) sc.value = Math.round(t);
  sc.style.setProperty("--p", `${(t / 1440) * 100}%`);
  map && map.update(t);
  updateKpis(t);
  if (jumped) { rebuildFeed(); renderSel(); }
}

let lastKpi = -1;
function updateKpis(t) {
  if (Math.abs(t - lastKpi) < 1 && t !== 0) return;
  lastKpi = t;
  let moving = 0, delaySum = 0, nd = 0, reports = 0, fc = 0;
  for (const run of app.replay.runs) {
    const stt = app.status(run, t);
    if (stt.state === "running" || stt.state === "dwell") { moving++; delaySum += stt.delay; nd++; }
    for (let i = 0; i < run.ev.length - 1; i++) {
      const d = app.dep(run, i);
      if (d <= t && d >= 0) { reports++; fc += run.ev.length - 1 - i; }
    }
  }
  kpi.moving.textContent = moving;
  kpi.delay.textContent = nd ? `${Math.round(delaySum / nd)} min` : "–";
  kpi.reports.textContent = reports;
  kpi.fc.textContent = fc.toLocaleString("en-IN");
}

function feedItem(run, k) {
  const train = app.trains[run.train];
  const fc = app.forecast(run, k);
  const dest = fc[fc.length - 1];
  const delay = run.ev[k][4];
  const diff = dest.med - dest.b1;
  return h("li", { class: delayClass(delay), onclick: () => app.selectRun(run.run) },
    h("div", { class: "t" }, `${hhmm(app.abs(app.dep(run, k)))}  ${train.number}`),
    h("div", {}, `${train.name} left ${app.stations[train.stops[k].code].name} `, h("b", {}, delay < 1 ? "on time" : `${mins(delay)} late`), "."),
    h("div", {}, `${app.stations[dest.code].name}: Kalyon ${hhmm(dest.med)} (${hhmm(dest.lo)}–${hhmm(dest.hi)}), `,
      h("span", { class: "gain" }, Math.abs(diff) < 1 ? "same as today’s estimate" : `${mins(Math.abs(diff))} ${diff > 0 ? "later" : "earlier"} than today’s estimate`), "."));
}

function onReport({ run, k }) {
  feedEl.querySelector(".empty")?.remove();
  feedEl.prepend(feedItem(run, k));
  while (feedEl.children.length > 40) feedEl.lastChild.remove();
  if (run.run === app.selectedRun) { renderSel(); map && map.select(run.run); }
}

function rebuildFeed() {
  clear(feedEl);
  const evs = [];
  for (const run of app.replay.runs) for (let i = 0; i < run.ev.length - 1; i++) {
    const d = app.dep(run, i);
    if (d <= app.t && d >= 0) evs.push([d, run, i]);
  }
  evs.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(([, run, i]) => feedEl.append(feedItem(run, i)));
  if (!evs.length) feedEl.append(h("li", { class: "empty", style: "border:0;background:none" }, "No reports yet. Press Play to start the day."));
}

function renderSel() {
  clear(selPanel);
  selPanel.append(h("div", { class: "panel-title" }, h("h3", {}, "Selected train")));
  const run = app.replay.runs.find(r => r.run === app.selectedRun);
  if (!run) { selPanel.append(h("p", { class: "empty" }, "Click a glowing train on the map, or a report in the feed.")); return; }
  const train = app.trains[run.train];
  const stt = app.status(run, app.t);
  selPanel.append(h("div", { class: "trainplate" }, h("span", { class: "no" }, train.number),
    h("span", { class: "nm" }, train.name, h("span", { class: "hi" }, train.name_hi))));
  if (stt.k < 0 || stt.state === "done") {
    selPanel.append(h("p", { class: "small", style: "margin-top:10px" }, stt.state === "done" ? "Journey complete." : `Departs ${app.stations[train.stops[0].code].name} at ${hhmm(app.abs(app.dep(run, 0)))}.`));
  } else {
    const fc = app.forecast(run, stt.k).slice(0, 4);
    selPanel.append(h("table", { class: "data", style: "margin-top:10px" },
      h("thead", {}, h("tr", {}, h("th", {}, "Next stops"), h("th", {}, "Today"), h("th", {}, "Kalyon"), h("th", {}, "Likely"))),
      h("tbody", {}, ...fc.map(f => h("tr", {}, h("td", {}, app.stations[f.code].name), h("td", {}, hhmm(f.b1)),
        h("td", { style: "color:var(--amber);font-weight:600" }, hhmm(f.med)), h("td", {}, `${hhmm(f.lo)}–${hhmm(f.hi)}`))))));
  }
  selPanel.append(h("button", { class: "btn small", style: "margin-top:12px", onclick: () => app.route("journey") }, "Open full journey ", h("span", { class: "arr" }, "→")));
}
