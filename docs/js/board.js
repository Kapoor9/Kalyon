// Station board: a split-flap arrivals board comparing today's estimate with Kalyon's forecast.
import { h, $, clear, hhmm, mins } from "./ui.js?v=202611091943";

let app, tbody, nameEl, clockEl, selEl, lastT = -999, rowsEl = new Map();

export function mount(a) {
  app = a;
  app.boardStation = "DDN";
  const root = $("#v-board");
  root.append(
    h("div", { class: "view-head" },
      h("div", {},
        h("h2", {}, "Station board"),
        h("p", { class: "lede" }, "What a station display could show. Each column answers a different person: passengers read the Kalyon ETA, platform staff the time to be ready by.")),
      selEl = h("select", { "aria-label": "Station", onchange: e => { app.boardStation = e.target.value; rowsEl.clear(); clear(tbody); render(true); } },
        ...app.net.stations.map(st => h("option", { value: st.code }, `${st.name} (${st.code})`)))),
    h("div", { class: "board-wrap" },
      h("div", { class: "board-title" },
        nameEl = h("div", { class: "stn-name" }),
        h("div", { style: "text-align:right" }, clockEl = h("div", { class: "clock num" }), h("div", { class: "clock-date" }, "Replay time"))),
      h("table", { class: "flap" },
        h("thead", {}, h("tr", {}, ...["Train", "Scheduled", "Today’s estimate", "Kalyon ETA", "Likely range", "Platform ready by", "Status"].map(t => h("th", {}, t)))),
        tbody = h("tbody"))),
    h("p", { class: "small", style: "margin-top:12px" },
      "Today’s estimate is the timetable plus the current delay. Kalyon’s range holds the actual arrival about 80% of the time. Data: replay of synthetic runs, not live."));
  selEl.value = "DDN";
  app.on("board-station", c => { selEl.value = c; rowsEl.clear(); clear(tbody); render(true); });
  app.on("tick", ({ t, jumped }) => { if (app.view === "board" && (jumped || Math.abs(t - lastT) >= 3)) render(false); });
  app.on("report", () => { if (app.view === "board") render(false); });
  app.on("replay", () => { rowsEl.clear(); clear(tbody); });
  app.on("view", v => { if (v === "board") render(true); });
}

function flapCell(cls = "") { return h("div", { class: `cell ${cls}` }); }

function setFlap(cell, text, cls, animate) {
  cell.className = `cell ${cls || ""}`;
  const old = cell._text || "";
  if (old === text) return;
  const chars = [...text];
  while (cell.children.length > chars.length) cell.lastChild.remove();
  chars.forEach((c, i) => {
    let span = cell.children[i];
    if (!span) { span = h("span", { class: "ch" }); cell.append(span); }
    if (span.textContent !== c) {
      span.textContent = c === " " ? " " : c;
      if (animate) { span.classList.remove("flip"); void span.offsetWidth; span.style.animationDelay = `${i * 28}ms`; span.classList.add("flip"); }
    }
  });
  cell._text = text;
}

function render(fresh) {
  lastT = app.t;
  const code = app.boardStation;
  const st = app.stations[code];
  clear(nameEl).append(st.name, h("span", { class: "hi" }, st.name_hi));
  clockEl.textContent = hhmm(app.abs(app.t));
  const w0 = app.w0();
  const items = [];
  for (const run of app.replay.runs) {
    const train = app.trains[run.train];
    const i = train.stops.findIndex(x => x.code === code);
    if (i <= 0) continue;
    const sched = w0 + run.ev[i][1];
    const actual = w0 + app.arr(run, i);
    const now = w0 + app.t;
    if (actual < now - 30 || sched > now + 600) continue;
    const k = app.lastDeparted(run, app.t);
    let row;
    if (actual <= now) {
      row = { train, sched, today: null, med: actual, lo: null, hi: null, ready: null, status: `Arrived ${hhmm(actual)}`, cls: "grn", sortT: actual };
    } else if (k < 0) {
      row = { train, sched, today: sched, med: null, lo: null, hi: null, ready: null, status: "Not yet departed", cls: "dim", sortT: sched };
    } else {
      const f = app.forecast(run, k).find(x => x.s === i);
      const late = f.med - sched;
      row = { train, sched, today: f.b1, med: f.med, lo: f.lo, hi: f.hi, ready: f.lo,
        status: late < 5 ? "On time" : `${mins(late)} late`, cls: late >= 60 ? "red" : late >= 15 ? "yel" : "grn", sortT: f.med };
    }
    row.key = run.run;
    items.push(row);
  }
  items.sort((a, b) => a.sortT - b.sortT);
  const keep = new Set(items.map(x => x.key));
  rowsEl.forEach((tr, key) => { if (!keep.has(key)) { tr.remove(); rowsEl.delete(key); } });
  if (!items.length) {
    if (!tbody.querySelector(".none")) tbody.append(h("tr", { class: "none" }, h("td", { colspan: 7, class: "empty", style: "padding:18px" }, "No arrivals in the next 10 hours of the replay. Move the replay clock in the control room, or pick a busier station such as Moradabad.")));
    return;
  }
  tbody.querySelector(".none")?.remove();
  items.forEach(it => {
    let tr = rowsEl.get(it.key);
    if (!tr) {
      tr = h("tr", {},
        h("td", {}, flapCell(), h("div", { class: "trn-name" }, it.train.name, " ", h("span", { class: "hi" }, it.train.name_hi))),
        ...Array.from({ length: 6 }, () => h("td", {}, flapCell())));
      rowsEl.set(it.key, tr);
    }
    tbody.append(tr); // keeps rows in forecast order
    const cells = [...tr.querySelectorAll(".cell")];
    const fmt = v => (v === null ? "--:--" : hhmm(v));
    setFlap(cells[0], it.train.number, "", fresh || true);
    setFlap(cells[1], hhmm(it.sched), "dim", true);
    setFlap(cells[2], fmt(it.today), "", true);
    setFlap(cells[3], fmt(it.med), "yel", true);
    setFlap(cells[4], it.lo === null ? "-----------" : `${hhmm(it.lo)}-${hhmm(it.hi)}`, "", true);
    setFlap(cells[5], fmt(it.ready), "", true);
    setFlap(cells[6], it.status.toUpperCase().slice(0, 18), it.cls, true);
  });
}
