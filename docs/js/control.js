// Control room: corridor map with replayed trains, the replay clock and the live report feed.
import { h, s, $, clear, hhmm, dayLabel, mins, delayClass, delayColor, tip } from "./ui.js";

const LABEL = { // dx, dy, anchor for station labels on the map
  DDN: [12, -6, "start"], HW: [12, 4, "start"], LRJ: [-12, 16, "end"], RK: [-12, -4, "end"],
  NBD: [12, -2, "start"], NGM: [12, 2, "start"], DPR: [12, 4, "start"], MB: [-12, 14, "end"],
  RMU: [0, -16, "middle"], BE: [12, -6, "start"], SPN: [12, -4, "start"], HRI: [12, 2, "start"],
  LKO: [0, 24, "middle"], MOZ: [-12, 2, "end"], MTC: [-12, 2, "end"], GZB: [12, 4, "start"], NDLS: [-12, 18, "end"],
};
const LINE_A = ["DDN", "HW", "LRJ", "NBD", "NGM", "DPR", "MB", "RMU", "BE", "SPN", "HRI", "LKO"];
const LINE_B = ["LRJ", "RK", "MOZ", "MTC", "GZB", "NDLS"];

let app, P, W, H, tagLayer, tags = new Map(), feedEl, kpi = {}, selPanel;

export function mount(a) {
  app = a;
  const root = $("#v-control");
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Control room"),
        h("p", { class: "lede" }, "A full day on the Dehradun corridor, replayed. Every time a train departs a station, Kalyon re-forecasts all the stations ahead. Click a train to follow it.")),
      h("div", { class: "seg", role: "group", "aria-label": "Choose a day to replay", id: "replay-seg" },
        ...app.replays.map(r => h("button", { "data-id": r.id, "aria-pressed": "false", onclick: () => app.setReplay(r.id) }, r.title)))),
    h("div", { class: "control" },
      h("div", { class: "panel mapwrap" },
        h("div", { class: "map-toolbar" },
          h("button", { class: "btn primary", id: "play", onclick: () => app.play(!app.playing) }, "Play"),
          h("div", {}, h("div", { class: "clock num", id: "clock" }, "07:00"), h("div", { class: "clock-date", id: "clock-date" })),
          h("input", { type: "range", class: "scrub", id: "scrub", min: 0, max: 1440, step: 1, value: app.t, "aria-label": "Replay time",
            oninput: e => app.seek(+e.target.value) }),
          h("div", { class: "seg", role: "group", "aria-label": "Replay speed" },
            ...[[1, "1 min/s"], [5, "5 min/s"], [15, "15 min/s"]].map(([v, l]) =>
              h("button", { "data-speed": v, "aria-pressed": String(app.speed === v), onclick: e => {
                app.speed = v;
                e.target.parentNode.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.speed === v)));
              } }, l)))),
        h("div", { class: "map", id: "map" }),
        h("div", { class: "map-legend" },
          h("span", {}, h("i", { class: "dot", style: "background:var(--go)" }), "Under 15 min late"),
          h("span", {}, h("i", { class: "dot", style: "background:var(--warn)" }), "15–59 min late"),
          h("span", {}, h("i", { class: "dot", style: "background:var(--stop)" }), "1 hour or more"),
          h("span", {}, "Dashed track: single line"),
          h("span", { id: "replay-note", class: "faint" }))),
      h("div", { class: "side" },
        h("div", { class: "kpis" },
          kpiBox("moving", "Trains on the move"), kpiBox("delay", "Average delay now"),
          kpiBox("reports", "Running reports so far"), kpiBox("fc", "Forecasts issued so far")),
        selPanel = h("div", { class: "panel", id: "sel-panel" },
          h("p", { class: "empty" }, "Select a train on the map to see its forecasts.")),
        h("div", { class: "panel" },
          h("div", { class: "panel-title" }, h("h3", {}, "Report feed"), h("span", { class: "small" }, "Newest first")),
          feedEl = h("ul", { class: "feed", "aria-live": "polite" })))));
  drawMap();
  app.on("tick", onTick);
  app.on("report", onReport);
  app.on("play", on => { $("#play").textContent = on ? "Pause" : "Play"; });
  app.on("replay", r => {
    document.querySelectorAll("#replay-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === r.id)));
    $("#replay-note").textContent = `${r.title}, ${dayLabel(r.t0_day * 1440)}. ${r.note}`;
    tags.forEach(g => g.remove()); tags.clear();
    rebuildFeed();
    renderSel();
  });
  app.on("select", () => { tags.forEach((g, id) => g.classList.toggle("sel", id === app.selectedRun)); renderSel(); });
}

function kpiBox(id, label) {
  return h("div", { class: "kpi" }, kpi[id] = h("b", { class: "num" }, "0"), h("span", {}, label));
}

function drawMap() {
  const st = app.net.stations;
  const lat0 = 28.9 * Math.PI / 180;
  const minLon = Math.min(...st.map(v => v.lon)), maxLon = Math.max(...st.map(v => v.lon));
  const minLat = Math.min(...st.map(v => v.lat)), maxLat = Math.max(...st.map(v => v.lat));
  W = 1000;
  const pad = 56;
  const sx = (W - 2 * pad) / ((maxLon - minLon) * Math.cos(lat0));
  H = Math.round((maxLat - minLat) * sx + 2 * pad);
  P = {};
  st.forEach(v => { P[v.code] = [pad + (v.lon - minLon) * Math.cos(lat0) * sx, pad + (maxLat - v.lat) * sx]; });
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Map of the Dehradun corridor with trains" });
  // faint graticule
  for (let lon = Math.ceil(minLon); lon <= maxLon; lon++) {
    const x = pad + (lon - minLon) * Math.cos(lat0) * sx;
    svg.append(s("line", { x1: x, x2: x, y1: 0, y2: H, stroke: "rgba(255,255,255,0.04)" }),
      s("text", { x: x + 4, y: H - 8, fill: "var(--faint)", "font-size": 10, text: `${lon}°E` }));
  }
  for (let lat = Math.ceil(minLat); lat <= maxLat; lat++) {
    const y = pad + (maxLat - lat) * sx;
    svg.append(s("line", { x1: 0, x2: W, y1: y, y2: y, stroke: "rgba(255,255,255,0.04)" }),
      s("text", { x: 6, y: y - 4, fill: "var(--faint)", "font-size": 10, text: `${lat}°N` }));
  }
  const secs = app.net.sections;
  secs.forEach(sec => svg.append(s("path", { class: `track${sec.single ? " single" : ""}`, d: `M${P[sec.a]}L${P[sec.b]}` })));
  [LINE_A, LINE_B].forEach(line => svg.append(s("path", { class: "track-lit", d: `M${line.map(c => P[c]).join("L")}` })));
  st.forEach(v => {
    const [dx, dy, anchor] = LABEL[v.code] || [10, 0, "start"];
    const g = s("g", { class: `stn${v.major ? " major" : ""}`, tabindex: 0, role: "button", "aria-label": `${v.name} station board`,
      onclick: () => { app.boardStation = v.code; app.emit("board-station", v.code); app.route("board"); },
      onkeydown: e => { if (e.key === "Enter") e.currentTarget.dispatchEvent(new Event("click")); } });
    g.append(s("circle", { cx: P[v.code][0], cy: P[v.code][1], r: v.major ? 6.5 : 4.5 }),
      s("text", { x: P[v.code][0] + dx, y: P[v.code][1] + dy, "text-anchor": anchor, text: v.name }),
      s("text", { class: "hi", x: P[v.code][0] + dx, y: P[v.code][1] + dy + 13, "text-anchor": anchor, text: v.name_hi }));
    svg.append(g);
  });
  tagLayer = s("g");
  svg.append(tagLayer);
  $("#map").append(svg);
}

// Position along a train's route at km distance from its origin.
function routeXY(train, km) {
  const r = train.route;
  let acc = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const sec = app.net.sections.find(x => (x.a === r[i] && x.b === r[i + 1]) || (x.b === r[i] && x.a === r[i + 1]));
    if (km <= acc + sec.km || i === r.length - 2) {
      const f = Math.max(0, Math.min(1, (km - acc) / sec.km));
      const a = P[r[i]], b = P[r[i + 1]];
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
    }
    acc += sec.km;
  }
  return { x: P[r[0]][0], y: P[r[0]][1], dx: 1, dy: 0 };
}

function onTick({ t, jumped }) {
  if (app.view !== "control" && !jumped) { updateKpis(t); return; }
  $("#clock").textContent = hhmm(app.abs(t));
  $("#clock-date").textContent = dayLabel(app.abs(t));
  const sc = $("#scrub"); if (+sc.value !== Math.round(t)) sc.value = Math.round(t);
  const seen = new Set();
  for (const run of app.replay.runs) {
    const stt = app.status(run, t);
    const train = stt.train;
    let visible = true, opacity = 1, km;
    if (stt.state === "waiting") {
      const until = app.dep(run, 0) - t;
      visible = until <= 25; opacity = 0.45; km = 0;
    } else if (stt.state === "done") {
      visible = stt.since <= 20; opacity = 0.35; km = train.stops[train.stops.length - 1].km;
    } else if (stt.state === "running") {
      const k0 = train.stops[stt.from].km, k1 = train.stops[stt.to].km;
      km = k0 + (k1 - k0) * Math.min(1, Math.max(0, stt.p));
    } else km = train.stops[stt.at].km;
    if (!visible) continue;
    seen.add(run.run);
    let g = tags.get(run.run);
    if (!g) {
      g = s("g", { class: "trn", tabindex: 0, role: "button", "aria-label": `${train.number} ${train.name}` });
      g.append(s("circle", { class: "halo", r: 6 }), s("rect", { x: -21, y: -9, width: 42, height: 18 }), s("text", { "text-anchor": "middle", y: 4, text: train.number }));
      g.addEventListener("click", () => app.selectRun(run.run));
      g.addEventListener("keydown", e => { if (e.key === "Enter") app.selectRun(run.run); });
      g.addEventListener("mousemove", e => {
        const st2 = app.status(run, app.t);
        tip(`<b>${train.number}</b> ${train.name}<br>${st2.state === "waiting" ? "Not yet departed" : mins(st2.delay) + " late"}<br><span class="faint">Click to follow</span>`, e);
      });
      g.addEventListener("mouseleave", () => tip(null));
      tagLayer.append(g);
      tags.set(run.run, g);
    }
    const pos = routeXY(train, km);
    const len = Math.hypot(pos.dx, pos.dy) || 1;
    // The normal flips with the direction of travel, so opposite-direction trains sit on opposite sides.
    const nx = -pos.dy / len * 16, ny = pos.dx / len * 16;
    g.setAttribute("transform", `translate(${(pos.x + nx).toFixed(1)},${(pos.y + ny).toFixed(1)})`);
    g.style.opacity = opacity;
    const col = delayColor(stt.delay);
    g.querySelector("rect").setAttribute("fill", col);
    g.querySelector("rect").setAttribute("stroke", "rgba(0,0,0,0.5)");
    g.querySelector(".halo").setAttribute("stroke", col);
    g.classList.toggle("sel", run.run === app.selectedRun);
  }
  tags.forEach((g, id) => { if (!seen.has(id)) { g.remove(); tags.delete(id); } });
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
  const li = h("li", { class: delayClass(delay), onclick: () => app.selectRun(run.run) },
    h("div", { class: "t" }, `${hhmm(app.abs(app.dep(run, k)))} · ${train.number}`),
    h("div", {}, `${train.name} left ${app.stations[train.stops[k].code].name} `, h("b", {}, delay < 1 ? "on time" : `${mins(delay)} late`), "."),
    h("div", {}, `${app.stations[dest.code].name}: Kalyon ${hhmm(dest.med)} (${hhmm(dest.lo)}–${hhmm(dest.hi)}), `,
      h("span", { class: "gain" }, Math.abs(diff) < 1 ? "same as today’s estimate" : `${mins(Math.abs(diff))} ${diff > 0 ? "later" : "earlier"} than today’s estimate`), "."));
  return li;
}

function onReport({ run, k }) {
  const g = tags.get(run.run);
  if (g) { g.classList.remove("pulse"); void g.getBBox(); g.classList.add("pulse"); }
  feedEl.prepend(feedItem(run, k));
  while (feedEl.children.length > 40) feedEl.lastChild.remove();
  if (run.run === app.selectedRun) renderSel();
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
  const run = app.replay.runs.find(r => r.run === app.selectedRun);
  if (!run) { selPanel.append(h("p", { class: "empty" }, "Select a train on the map to see its forecasts.")); return; }
  const train = app.trains[run.train];
  const stt = app.status(run, app.t);
  selPanel.append(h("div", { class: "trainplate" }, h("span", { class: "no" }, train.number),
    h("span", { class: "nm" }, train.name, h("span", { class: "hi" }, train.name_hi))));
  if (stt.k < 0 || stt.state === "done") {
    selPanel.append(h("p", { class: "small", style: "margin-top:10px" }, stt.state === "done" ? "Journey complete." : `Departs ${app.stations[train.stops[0].code].name} at ${hhmm(app.abs(app.dep(run, 0)))}.`));
  } else {
    const fc = app.forecast(run, stt.k).slice(0, 4);
    selPanel.append(h("table", { class: "data", style: "margin-top:10px" },
      h("thead", {}, h("tr", {}, h("th", {}, "Next stops"), h("th", {}, "Today"), h("th", {}, "Kalyon"))),
      h("tbody", {}, ...fc.map(f => h("tr", {}, h("td", {}, app.stations[f.code].name), h("td", {}, hhmm(f.b1)),
        h("td", { style: "color:var(--board);font-weight:700" }, hhmm(f.med)))))));
  }
  selPanel.append(h("button", { class: "btn", style: "margin-top:12px", onclick: () => app.route("journey") }, "Open full journey"));
}
