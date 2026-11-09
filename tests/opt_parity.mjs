// Checks the browser optimiser (docs/js/optimise.js) against the Python reference (kalyon/optimise.py):
// the same instance, the same dispatching rules, the same AI dispatcher, and the optimum HiGHS proves.
// Run from the repository root:  node tests/opt_parity.mjs
import { readFileSync } from "node:fs";
import * as O from "../docs/js/optimise.js";

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const net = read("../docs/data/network.json");
const D = read("../docs/data/dispatch.json");
const cases = read("./opt_parity.json");
O.setNetwork(net.sections);

let maxBase = 0, maxRule = 0, maxOpt = 0, maxP = 0, notOpt = 0, nodes = 0, ms = 0, nodesF = 0;
for (const r of cases.clf) maxP = Math.max(maxP, Math.abs(O.aiProb(D, r.x) - r.p));
for (const c of cases.cases) {
  const inst = O.buildInstance(c.trains, c.now, D);
  if (inst.nE !== c.nE || inst.pairs.length !== c.npairs) throw new Error(`instance size differs: ${inst.nE}/${c.nE} events, ${inst.pairs.length}/${c.npairs} pairs`);
  inst.base.forEach((v, i) => { maxBase = Math.max(maxBase, Math.abs(v - c.base[i])); });
  for (const rule of ["fcfs", "priority", "ai"]) {
    const g = O.greedy(inst, rule, D);
    maxRule = Math.max(maxRule, Math.abs(g.obj - c[rule]));
  }
  const res = O.runToEnd(O.branchAndBound(inst, D, { nodeLimit: 200000 }));
  const res2 = O.runToEnd(O.branchAndBound(inst, D, { nodeLimit: 200000, guide: "fcfs" }));
  if (!res.optimal) notOpt++;
  nodes += res.nodes; nodesF += res2.nodes; ms += res.ms;
  maxOpt = Math.max(maxOpt, Math.abs(res.obj - c.opt));
}
const n = cases.cases.length;
console.log(`${n} snapshots. base schedule max diff ${maxBase.toExponential(2)} min; rules max diff ${maxRule.toExponential(2)};`
  + ` branch-and-bound vs HiGHS max diff ${maxOpt.toExponential(2)} (searches not finished: ${notOpt});`
  + ` AI dispatcher probability max diff ${maxP.toExponential(2)}.`);
console.log(`Search effort: ${Math.round(nodes / n)} nodes per snapshot with AI-ordered branching, ${Math.round(nodesF / n)} with first-come ordering; ${(ms / n).toFixed(0)} ms average.`);
const ok = maxBase < 1e-6 && maxRule < 1e-4 && maxOpt < 0.05 && maxP < 1e-9 && notOpt === 0;
console.log(ok ? "OPTIMISER PARITY OK" : "OPTIMISER PARITY FAILED");
if (!ok) process.exit(1);
