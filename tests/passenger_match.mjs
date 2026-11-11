// Passenger tab vs Station board: the same journey must show the same numbers in both.
// 144 states = 3 replay days × 6 replay times × 8 trains. For each, the Passenger model (which feeds
// the HTML cards AND every string drawn in the 3D world: LED board, pass, signs, river, dial) is
// compared with the Station board's row for that train at its destination.
//   node tests/passenger_match.mjs            (starts its own static server on port 8799)
// Needs Chrome and puppeteer (PUPPETEER_PATH can point at a node_modules folder that has it).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs");
const req = createRequire(process.env.PUPPETEER_PATH ? path.join(process.env.PUPPETEER_PATH, "x.js") : import.meta.url);
const puppeteer = req("puppeteer");
const PORT = 8799;
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise(r => setTimeout(r, 900));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], protocolTimeout: 300000,
});
let failed = 0, checked = 0, listed = 0;
try {
  const p = await browser.newPage();
  await p.evaluateOnNewDocument(() => sessionStorage.setItem("kalyon-pv-intro", "1"));
  await p.goto(`http://localhost:${PORT}/?view=passenger#passenger`, { waitUntil: "load", timeout: 90000 });
  await p.waitForFunction(() => window.kalyon?.passengerModel && window.kalyon.replays, { timeout: 90000 });
  const out = await p.evaluate(async () => {
    const app = window.kalyon, res = [];
    const hm = v => v; // strings are compared as shown
    for (const rep of app.replays) {
      app.setReplay(rep.id);
      await new Promise(r => setTimeout(r, 50));
      const runs = app.replay.runs.filter(r => r.date === app.replay.date).slice(0, 8);
      for (const t of [120, 300, 480, 660, 840, 1020]) {
        app.seek(t);
        for (const run of runs) {
          const tr = app.trains[run.train], w0 = app.w0(), now = w0 + app.t;
          // destination: the first stop the board would list right now (else the terminus)
          let d = tr.stops.length - 1, inWin = false;
          for (let i = 1; i < tr.stops.length; i++) { const act = w0 + app.arr(run, i), sch = w0 + run.ev[i][1]; if (act >= now - 30 && sch <= now + 600) { d = i; inWin = true; break; } }
          const code = tr.stops[d].code;
          const m = app.passengerModel(run.run, 0, d);
          app.boardStation = code; app.emit("board-station", code);
          const row = inWin && [...document.querySelectorAll("#v-board tbody tr")].find(r => { const c = r.querySelectorAll(".cell"); return c[0]?._text === tr.number && c[1]?._text === m.pass.to.time; });
          const cells = row ? [...row.querySelectorAll(".cell")].map(c => c._text) : null;
          res.push({ rep: rep.id, t, train: tr.number, code, phase: m.phase, pass: m.pass.cells, led: m.led.now, road: m.road[d].main, pick: m.pick, board: cells });
        }
      }
    }
    return res;
  });
  const dash = s => s.replace(/–/g, "-");
  const tmOf = v => { const x = ((Math.round(v) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
  for (const s of out) {
    checked++;
    if (!s.board) continue;                       // the board only lists trains due in its window
    listed++;
    const [, , , bMed, bRange, bReady] = s.board;
    const eta = s.pass[0][1], range = s.pass[1][1];
    const errs = [];
    if (s.phase === "notdeparted") {
      if (bMed !== "--:--" || eta !== "after departure") errs.push(`before departure: board ${bMed}, passenger ${eta}`);
    } else {
      if (eta !== bMed) errs.push(`ETA: board ${bMed}, passenger ${eta}`);
      if (s.phase === "arrived") {
        if (range !== "—" || bRange !== "-----------") errs.push(`arrived range: board ${bRange}, passenger ${range}`);
        if (s.led[0] !== `ARRIVED ${bMed}`) errs.push(`LED: ${s.led[0]} vs ${bMed}`);
        if (s.road !== `Arrived ${bMed}`) errs.push(`road: ${s.road} vs ${bMed}`);
      } else {
        if (dash(range) !== bRange) errs.push(`range: board ${bRange}, passenger ${range}`);
        if (s.led[0] !== `KALYON ETA ${bMed}` || s.led[1] !== `LIKELY ${bRange}`) errs.push(`LED: ${s.led.join(" / ")} vs ${bMed} ${bRange}`);
        if (s.road !== `Kalyon ${bMed}`) errs.push(`road: ${s.road} vs ${bMed}`);
        if (s.pick.state === "fc" && tmOf(s.pick.platform) !== bReady) errs.push(`platform by: board ${bReady}, passenger ${tmOf(s.pick.platform)}`);
      }
    }
    if (errs.length) { failed++; console.error(`MISMATCH ${s.rep} t=${s.t} ${s.train}→${s.code} (${s.phase}):`, errs.join("; ")); }
  }
} finally {
  await browser.close(); srv.kill();
}
console.log(`states=${checked} on the board=${listed} mismatches=${failed}`);
if (checked !== 144 || listed < 80 || failed) { console.error("PASSENGER MATCH FAILED"); process.exit(1); }
console.log("PASSENGER MATCH OK");
