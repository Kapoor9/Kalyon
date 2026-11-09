// Checks the browser engine against LightGBM: predictions and TreeSHAP must match Python.
import { readFileSync } from "node:fs";
import { predict, shap, buildFeatures, replayState } from "../docs/js/engine.js";
const M = JSON.parse(readFileSync(new URL("../docs/data/model.json", import.meta.url)));
const P = JSON.parse(readFileSync(new URL("./parity_rows.json", import.meta.url)));
const rows = P.pred;
const R = JSON.parse(readFileSync(new URL("../docs/data/replays.json", import.meta.url)));
const T = JSON.parse(readFileSync(new URL("../docs/data/trains.json", import.meta.url)));
const trains = Object.fromEntries(T.trains.map(t => [t.number, t]));
let worstFeat = 0, checked = 0;
for (const f of P.features) {
  for (const rep of R.replays) {
    const run = rep.runs.find(r => r.run === f.run);
    if (!run) continue;
    const st = replayState(rep, run, f.k, R.start_date);
    const x = buildFeatures(M.features, trains[run.train], f.k, f.s, st);
    x.forEach((v, i) => {
      const py = f.x[i] === null ? NaN : f.x[i];
      const d = Number.isNaN(py) && Number.isNaN(v) ? 0 : Math.abs(v - py);
      if (d > worstFeat) worstFeat = d;
      if (d > 1e-2) console.error("feature mismatch", M.features[i], v, py, f);
    });
    checked++; break;
  }
}
console.log(`feature rows=${checked} max|feature diff|=${worstFeat.toExponential(2)}`);
if (worstFeat > 1e-2 || checked < 100) { console.error("FEATURE PARITY FAILED"); process.exit(1); }
const nF = M.features.length;
let worstPred = 0, worstShap = 0;
for (const r of rows) {
  const x = r.x.map(v => (v === null ? NaN : v));
  for (const k of ["m1", "q10", "q50", "q90"]) worstPred = Math.max(worstPred, Math.abs(predict(M.models[k], x) - r[k]));
  const phi = shap(M.models.q50, x, nF);
  phi.forEach((v, i) => { worstShap = Math.max(worstShap, Math.abs(v - r.shap_q50[i])); });
}
console.log(`rows=${rows.length} max|pred diff|=${worstPred.toExponential(2)} max|shap diff|=${worstShap.toExponential(2)}`);
if (worstPred > 1e-6 || worstShap > 1e-6) { console.error("PARITY FAILED"); process.exit(1); }
console.log("PARITY OK");
