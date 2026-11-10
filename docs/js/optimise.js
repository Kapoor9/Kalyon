// Kalyon optimisation engine (browser). Mirror of kalyon/optimise.py, plus an exact
// branch-and-bound search guided by the AI dispatcher. Runs in the browser and in Node
// (tests/opt_parity.mjs checks it against the optimum HiGHS proves in Python).
import { forecastAll, predict } from "./engine.js?v=202611101408";

export const EPS = 1e-6;
export const BIG = 5000;

let SECT = null; // "A|B" -> [km, single, dir]
export function setNetwork(sections) {
  SECT = new Map();
  for (const sc of sections) {
    SECT.set(`${sc.a}|${sc.b}`, [sc.km, sc.single, 1]);
    SECT.set(`${sc.b}|${sc.a}`, [sc.km, sc.single, -1]);
  }
}
const sec = (a, b) => SECT.get(`${a}|${b}`);

// ------------------------------------------------------------------------------------------
// Instance
// ------------------------------------------------------------------------------------------
export function buildInstance(trains, now, D, opt = {}) {
  const P = { ...D.params, ...(opt.params || {}) };
  const LINES = D.lines;
  const blocks = opt.blocks || [];
  const E = { train: [], code: [], type: [], halt: [], sched: [], rel: [], fixed: [], base: [] };
  const arcs = [], usages = [], visits = [], obj = [];
  const ev = (ti, code, typ, halt, sched, base, rel = -Infinity, fixed = false) => {
    E.train.push(ti); E.code.push(code); E.type.push(typ); E.halt.push(halt); E.sched.push(sched);
    E.rel.push(rel); E.fixed.push(fixed); E.base.push(base);
    return E.train.length - 1;
  };
  trains.forEach((tr, ti) => {
    const { stops, line, k } = tr;
    const n = stops.length;
    const pos = stops.map(st => line.indexOf(st.code));
    let kk, D0;
    if (k === -1) {
      kk = 0;
      D0 = ev(ti, stops[0].code, "D", 0, null, tr.dep0, tr.dep0);
      visits.push({ train: ti, code: stops[0].code, s: D0, os: -P.prep, e: D0, oe: 0 });
    } else {
      kk = k;
      D0 = ev(ti, stops[k].code, "D", k, null, tr.dep_k, tr.dep_k, true);
    }
    let prevD = D0;
    for (let h = kk; h < n - 1; h++) {
      const tdep = E.base[prevD];
      const first = h === kk;
      let R, arrived;
      if (first && k >= 0 && tr.arr_next !== null && tr.arr_next !== undefined) { R = tr.arr_next - tdep; arrived = true; }
      else { R = Math.max(tr.fc[h + 1] - tdep, P.min_run * (stops[h + 1].arr - stops[h].dep)); arrived = false; }
      const seg = line.slice(pos[h], pos[h + 1] + 1);
      const kms = [];
      for (let q = 0; q < seg.length - 1; q++) kms.push(sec(seg[q], seg[q + 1])[0]);
      const tot = kms.reduce((a, b) => a + b, 0);
      let cur = prevD, tcur = tdep;
      for (let idx = 0; idx < kms.length; idx++) {
        const a = seg[idx], b = seg[idx + 1];
        const r = R * kms[idx] / tot;
        tcur += r;
        const last = idx === kms.length - 1;
        const fixed = first && k >= 0 && (arrived || (tcur <= now && !last));
        const A = ev(ti, b, "A", last ? h + 1 : -1, last ? stops[h + 1].arr : null, tcur, fixed ? tcur : -Infinity, fixed);
        arcs.push([cur, A, r]);
        const [, single, dirn] = sec(a, b);
        usages.push({ train: ti, a, b, key: dirn === 1 ? `${a}|${b}` : `${b}|${a}`, dir: dirn, single, d: cur, A });
        if (!last) {
          const Dp = ev(ti, b, "D", -1, null, tcur, fixed ? tcur : -Infinity, fixed);
          arcs.push([A, Dp, 0]);
          visits.push({ train: ti, code: b, s: A, os: 0, e: Dp, oe: 0 });
          cur = Dp;
        } else if (h + 1 === n - 1) {
          visits.push({ train: ti, code: b, s: A, os: 0, e: A, oe: P.turn });
          if (!fixed) obj.push([A, stops[h + 1].arr, tr.w]);
        } else {
          const dwell = stops[h + 1].dep - stops[h + 1].arr;
          const Dn = ev(ti, b, "D", h + 1, null, Math.max(tcur + dwell, stops[h + 1].dep), stops[h + 1].dep);
          arcs.push([A, Dn, dwell]);
          visits.push({ train: ti, code: b, s: A, os: 0, e: Dn, oe: 0 });
          if (!fixed) obj.push([A, stops[h + 1].arr, tr.w]);
          prevD = Dn;
        }
      }
    }
  });
  for (let i = 0; i < E.train.length; i++) if (!E.fixed[i]) E.rel[i] = Math.max(E.rel[i], now);
  const blk = blocks.map((b, bi) => {
    const s0 = ev(-1 - bi, b.a, "B", -1, null, b.t1, b.t1, true);
    const e0 = ev(-1 - bi, b.b, "B", -1, null, b.t2, b.t2, true);
    const key = SECT.get(`${b.a}|${b.b}`)[2] === 1 ? `${b.a}|${b.b}` : `${b.b}|${b.a}`;
    return { key, s: s0, e: e0, i: bi, a: b.a, b: b.b };
  });
  const inst = { E, nE: E.train.length, arcs, usages, visits, obj, now, P, blocks: blk, ntrains: trains.length, w: trains.map(t => t.w), trains };
  inst.adj = baseAdj(inst);
  inst.base = propagate(inst, []);
  if (!inst.base) throw new Error("base schedule infeasible");
  const t = inst.base;
  const pairs = [], preexisting = [];
  const byKey = new Map();
  usages.forEach((u, ui) => { if (!byKey.has(u.key)) byKey.set(u.key, []); byKey.get(u.key).push(ui); });
  for (const [key, lst] of byKey) {
    for (let x = 0; x < lst.length; x++) for (let y = x + 1; y < lst.length; y++) {
      let u = usages[lst[x]], v = usages[lst[y]];
      if (u.train === v.train) continue;
      const same = u.dir === v.dir;
      if (!same && !u.single) continue;
      let lu, lv;
      if (t[u.d] > t[v.d] || (t[u.d] === t[v.d] && u.train > v.train)) { lu = lst[y]; lv = lst[x]; } else { lu = lst[x]; lv = lst[y]; }
      u = usages[lu]; v = usages[lv];
      if (E.fixed[u.d] && E.fixed[v.d]) { if (overlapPair(inst, t, u, v, same)) preexisting.push([lu, lv]); continue; }
      const kind = same ? "same" : "opp";
      const lag = same ? (u.single ? P.head_single : P.head_double) : P.cross;
      pairs.push({ u: lu, v: lv, kind, lag });
    }
    for (const b of blk) {
      if (b.key !== key) continue;
      for (const ui of lst) pairs.push({ u: ui, v: null, kind: "block", lag: 0, block: b.i });
    }
  }
  inst.pairs = pairs;
  inst.preexisting = preexisting;
  inst.alts = pairs.map(p => pairAlts(inst, p));
  const cap = {};
  for (const code of new Set(visits.map(v => v.code))) {
    const L = LINES[code] ?? 2;
    let present = 0;
    for (const vv of visits) if (vv.code === code && E.fixed[vv.s] && t[vv.e] + vv.oe + P.clear > now) present++;
    cap[code] = Math.max(L, present);
  }
  inst.cap = cap;
  inst.byStation = new Map();
  visits.forEach((v, vi) => { if (!inst.byStation.has(v.code)) inst.byStation.set(v.code, []); inst.byStation.get(v.code).push(vi); });
  return inst;
}

function overlapPair(inst, t, u, v, same) {
  const P = inst.P;
  let ok1, ok2;
  if (same) {
    const hd = u.single ? P.head_single : P.head_double;
    ok1 = t[v.d] >= t[u.d] + hd - EPS && t[v.A] >= t[u.A] + hd - EPS;
    ok2 = t[u.d] >= t[v.d] + hd - EPS && t[u.A] >= t[v.A] + hd - EPS;
  } else {
    ok1 = t[v.d] >= t[u.A] + P.cross - EPS;
    ok2 = t[u.d] >= t[v.A] + P.cross - EPS;
  }
  return !(ok1 || ok2);
}

function baseAdj(inst) {
  const adj = Array.from({ length: inst.nE }, () => []);
  for (const [u, v, lag] of inst.arcs) adj[u].push(v, lag);
  return adj;
}

// Earliest times given the train chains plus extra arcs. Starting from `from` (a schedule that already
// satisfies every arc except `seeds`) only the affected part is recomputed. null if infeasible.
export function propagate(inst, extra, from = null, seeds = null) {
  const nE = inst.nE, E = inst.E, adj = inst.adj;
  const ex = new Map();
  for (const [u, v, lag] of extra) { if (!ex.has(u)) ex.set(u, []); ex.get(u).push(v, lag); }
  const t = from ? from.slice() : E.rel.slice();
  const fixed = E.fixed;
  const limit = inst.now + BIG;
  const queue = [];
  const inq = new Uint8Array(nE);
  if (seeds) { for (const [u] of seeds) if (!inq[u]) { inq[u] = 1; queue.push(u); } }
  else for (let i = 0; i < nE; i++) { inq[i] = 1; queue.push(i); }
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    inq[u] = 0;
    const tu = t[u];
    const lists = [adj[u], ex.get(u)];
    for (const L of lists) {
      if (!L) continue;
      for (let q = 0; q < L.length; q += 2) {
        const v = L[q], nv = tu + L[q + 1];
        if (nv > t[v] + EPS) {
          if (fixed[v] || nv > limit) return null;
          t[v] = nv;
          if (!inq[v]) { inq[v] = 1; queue.push(v); }
        }
      }
    }
  }
  return t;
}

export function objective(inst, t) {
  let s = 0;
  for (const [a, sc, w] of inst.obj) s += w * Math.max(0, t[a] - sc);
  return s;
}

export function pairAlts(inst, p) {
  const U = inst.usages, u = U[p.u];
  if (p.kind === "block") {
    const b = inst.blocks[p.block];
    return [[[u.A, b.s, 0]], [[b.e, u.d, 0]]];
  }
  const v = U[p.v];
  if (p.kind === "opp") return [[[u.A, v.d, p.lag]], [[v.A, u.d, p.lag]]];
  return [[[u.d, v.d, p.lag], [u.A, v.A, p.lag]], [[v.d, u.d, p.lag], [v.A, u.A, p.lag]]];
}

const altOk = (t, arcs) => arcs.every(([a, b, lag]) => t[b] >= t[a] + lag - EPS);

export function conflicts(inst, t) {
  const out = [];
  const U = inst.usages;
  inst.pairs.forEach((p, pi) => {
    const al = inst.alts[pi];
    if (altOk(t, al[0]) || altOk(t, al[1])) return;
    const u = U[p.u];
    const start = p.kind === "block" ? Math.min(t[u.d], t[inst.blocks[p.block].s]) : Math.min(t[u.d], t[U[p.v].d]);
    out.push({ kind: "pair", pair: pi, start });
  });
  out.push(...stationConflicts(inst, t));
  out.sort((a, b) => a.start - b.start || (a.kind === "pair" ? 0 : 1) - (b.kind === "pair" ? 0 : 1) || (a.pair ?? 0) - (b.pair ?? 0));
  return out;
}

function stationConflicts(inst, t) {
  const P = inst.P, V = inst.visits, out = [];
  for (const [code, lst] of inst.byStation) {
    const L = inst.cap[code];
    if (lst.length <= L) continue;
    const iv = lst.map(vi => [t[V[vi].s] + V[vi].os, t[V[vi].e] + V[vi].oe + P.clear, vi])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    let active = [];
    for (const x of iv) {
      active = active.filter(a => a[1] > x[0] + EPS);
      if (active.length >= L) { out.push({ kind: "station", code, set: [...active, x].map(a => a[2]), start: x[0] }); break; }
      active.push(x);
    }
  }
  return out;
}

export function stationAlts(inst, t, c) {
  const P = inst.P, E = inst.E, V = inst.visits, S = c.set, alts = [];
  for (const j of S) {
    const vj = V[j];
    if (E.fixed[vj.s]) continue;
    for (const i of S) {
      if (i === j) continue;
      const vi = V[i];
      const push = (t[vi.e] + vi.oe + P.clear) - (t[vj.s] + vj.os);
      alts.push([j === S[S.length - 1] ? 0 : 1, push, i, j, [[vi.e, vj.s, vi.oe + P.clear - vj.os]]]);
    }
  }
  alts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return alts;
}

// ------------------------------------------------------------------------------------------
// AI dispatcher features (identical to kalyon/optimise.py pair_features)
// ------------------------------------------------------------------------------------------
function holdCost(inst, t, ti, from, delta) {
  if (delta <= 0) return 0;
  let c = 0;
  for (const [a, sc, w] of inst.obj) if (inst.E.train[a] === ti && a >= from) c += w * (Math.max(0, t[a] + delta - sc) - Math.max(0, t[a] - sc));
  return c;
}
function late(inst, t, ti, from) {
  for (const [a, sc] of inst.obj) if (inst.E.train[a] === ti && a >= from) return t[a] - sc;
  return 0;
}
function downstream(inst, ti, from) {
  let s = 0;
  for (const [a, , w] of inst.obj) if (inst.E.train[a] === ti && a >= from) s += w;
  return s;
}
export function conflictCounts(inst, confs) {
  const cnt = {};
  for (const c of confs) {
    if (c.kind !== "pair") continue;
    const p = inst.pairs[c.pair];
    for (const ui of [p.u, p.v]) if (ui !== null) { const tr = inst.usages[ui].train; cnt[tr] = (cnt[tr] || 0) + 1; }
  }
  return cnt;
}
export function pairFeatures(inst, t, p, nconf = {}) {
  const U = inst.usages, u = U[p.u], ti = u.train, wi = inst.w[ti];
  let v;
  if (p.kind === "block") {
    const b = inst.blocks[p.block];
    const needSecond = t[b.e] - t[u.d];
    v = { kind: 3, w_first: wi, w_second: 0, gap: t[b.s] - t[u.d], occ_first: t[u.A] - t[u.d], occ_second: t[b.e] - t[b.s],
      late_first: late(inst, t, ti, u.A), late_second: 0, cost_first_waits: holdCost(inst, t, ti, u.A, needSecond), cost_second_waits: 0,
      down_first: downstream(inst, ti, u.A), down_second: 0 };
  } else {
    const w2 = U[p.v], tj = w2.train, wj = inst.w[tj];
    let nu, nv;
    if (p.kind === "opp") { nu = t[w2.A] + p.lag - t[u.d]; nv = t[u.A] + p.lag - t[w2.d]; }
    else { nu = Math.max(t[w2.d] + p.lag - t[u.d], t[w2.A] + p.lag - t[u.A]); nv = Math.max(t[u.d] + p.lag - t[w2.d], t[u.A] + p.lag - t[w2.A]); }
    v = { kind: p.kind === "opp" ? 0 : 1, w_first: wi, w_second: wj, gap: t[w2.d] - t[u.d], occ_first: t[u.A] - t[u.d], occ_second: t[w2.A] - t[w2.d],
      late_first: late(inst, t, ti, u.A), late_second: late(inst, t, tj, w2.A),
      cost_first_waits: holdCost(inst, t, ti, u.A, nu), cost_second_waits: holdCost(inst, t, tj, w2.A, nv),
      down_first: downstream(inst, ti, u.A), down_second: downstream(inst, tj, w2.A) };
  }
  v.w_diff = v.w_first - v.w_second;
  v.cost_diff = v.cost_second_waits - v.cost_first_waits;
  v.nconf_first = nconf[u.train] || 0;
  v.nconf_second = p.v !== null ? (nconf[U[p.v].train] || 0) : 0;
  v.hour = (((t[u.d] % 1440) + 1440) % 1440) / 60;
  v.single = u.single;
  return FEATS.map(f => v[f]);
}
export const FEATS = ["kind", "w_first", "w_second", "w_diff", "gap", "occ_first", "occ_second",
  "late_first", "late_second", "cost_first_waits", "cost_second_waits", "cost_diff",
  "down_first", "down_second", "nconf_first", "nconf_second", "hour", "single"];

export function aiProb(D, f) {
  const z = predict(D.model, f);
  return 1 / (1 + Math.exp(-z));
}

// ------------------------------------------------------------------------------------------
// Dispatching rules
// ------------------------------------------------------------------------------------------
export function greedy(inst, rule, D, maxSteps = 600) {
  let extra = [], t = inst.base;
  const decisions = [];
  for (let step = 0; step < maxSteps; step++) {
    const confs = conflicts(inst, t);
    if (!confs.length) return { t, obj: objective(inst, t), extra, decisions };
    const c = confs[0];
    if (c.kind === "pair") {
      const p = inst.pairs[c.pair], alts = inst.alts[c.pair];
      let order;
      if (rule === "fcfs") order = [0, 1];
      else if (rule === "priority") {
        if (p.kind === "block") order = [0, 1];
        else {
          const wu = inst.w[inst.usages[p.u].train], wv = inst.w[inst.usages[p.v].train];
          order = wv > wu + EPS ? [1, 0] : [0, 1];
        }
      } else {
        const prob = aiProb(D, pairFeatures(inst, t, p, conflictCounts(inst, confs)));
        order = prob >= 0.5 ? [0, 1] : [1, 0];
      }
      let done = false;
      for (const a of order) {
        const nt = propagate(inst, extra.concat(alts[a]), t, alts[a]);
        if (nt) { extra = extra.concat(alts[a]); t = nt; decisions.push({ pair: c.pair, alt: a, t: c.start }); done = true; break; }
      }
      if (!done) return null;
    } else {
      let done = false;
      for (const alt of stationAlts(inst, t, c)) {
        const nt = propagate(inst, extra.concat(alt[4]), t, alt[4]);
        if (nt) { extra = extra.concat(alt[4]); t = nt; decisions.push({ station: c.code, i: alt[2], j: alt[3], t: c.start }); done = true; break; }
      }
      if (!done) return null;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------
// Exact branch and bound (depth first, earliest conflict first, AI-ordered branches)
// ------------------------------------------------------------------------------------------
// A generator: yields progress objects so the page can animate the search; returns the result.
export function* branchAndBound(inst, D, opt = {}) {
  const nodeLimit = opt.nodeLimit ?? 60000;
  const guide = opt.guide ?? "ai";
  const yieldEvery = opt.yieldEvery ?? 250;
  const forced = opt.forced || [];
  const t0 = (typeof performance !== "undefined" ? performance : Date).now();
  let best = Infinity, bestT = null, bestDec = null, bestExtra = null;
  const seeds = [];
  for (const rule of ["fcfs", "priority", "ai"]) {
    if (forced.length) break;
    const g = greedy(inst, rule, D);
    if (g && g.obj < best - 1e-9) { best = g.obj; bestT = g.t; bestDec = g.decisions; bestExtra = g.extra; }
    if (g) seeds.push({ rule, obj: g.obj });
  }
  let root = inst.base, rootExtra = [];
  if (forced.length) {
    root = propagate(inst, forced);
    rootExtra = forced.slice();
    if (!root) return { obj: Infinity, infeasible: true };
  }
  const trace = [{ nodes: 0, best }];
  let nodes = 0, pruned = 0, leaves = 0, lbMax = objective(inst, root);
  // Explicit stack of nodes: {t, extra, dec, depth}
  const stack = [{ t: root, extra: rootExtra, dec: [] }];
  let complete = true;
  while (stack.length) {
    if (nodes >= nodeLimit) { complete = false; break; }
    const node = stack.pop();
    nodes++;
    const ob = objective(inst, node.t);
    if (ob >= best - 1e-9) { pruned++; continue; }
    const confs = conflicts(inst, node.t);
    if (!confs.length) {
      leaves++;
      best = ob; bestT = node.t; bestDec = node.dec; bestExtra = node.extra;
      trace.push({ nodes, best });
      continue;
    }
    // Children for the earliest conflict.
    const c = confs[0];
    let kids = [];
    if (c.kind === "pair") {
      const p = inst.pairs[c.pair], alts = inst.alts[c.pair];
      let order = [0, 1];
      if (guide === "ai") {
        const prob = aiProb(D, pairFeatures(inst, node.t, p, conflictCounts(inst, confs)));
        order = prob >= 0.5 ? [0, 1] : [1, 0];
      }
      for (const a of order) {
        const nt = propagate(inst, node.extra.concat(alts[a]), node.t, alts[a]);
        if (nt) kids.push({ t: nt, extra: node.extra.concat(alts[a]), dec: node.dec.concat([{ pair: c.pair, alt: a, t: c.start }]) });
      }
    } else {
      for (const alt of stationAlts(inst, node.t, c)) {
        const nt = propagate(inst, node.extra.concat(alt[4]), node.t, alt[4]);
        if (nt) kids.push({ t: nt, extra: node.extra.concat(alt[4]), dec: node.dec.concat([{ station: c.code, i: alt[2], j: alt[3], t: c.start }]) });
      }
    }
    // Bound: any completion must also settle the next few conflicts, each at least as costly as its cheapest option.
    kids = kids.filter(k => {
      const ob2 = objective(inst, k.t);
      if (ob2 >= best - 1e-9) { pruned++; return false; }
      return true;
    });
    for (let q = kids.length - 1; q >= 0; q--) stack.push(kids[q]);
    if (nodes % yieldEvery === 0) yield { nodes, best, pruned, leaves, open: stack.length, ms: now() - t0, trace };
  }
  const res = { obj: best, t: bestT, decisions: bestDec, extra: bestExtra, nodes, pruned, leaves, optimal: complete, ms: now() - t0, trace, seeds };
  return res;
  function now() { return (typeof performance !== "undefined" ? performance : Date).now(); }
}

export function runToEnd(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

// ------------------------------------------------------------------------------------------
// Snapshot of a replay (layer-1 input) using Kalyon's ETA forecasts
// ------------------------------------------------------------------------------------------
// rep: replay, tRel: replay minute, opt: {horizon, weights, bumps: {run: min}, fog: bool}
export function snapshotFromReplay(app, rep, tRel, D, opt = {}) {
  const H = opt.horizon ?? D.horizon;
  const weights = opt.weights || D.priority;
  const w0 = rep.t0_day * 1440 + 240;
  const T = w0 + tRel;
  const out = [];
  for (const run of rep.runs) {
    const ev = run.ev, n = ev.length;
    const depA = i => (ev[i][2] === null ? null : ev[i][2] + ev[i][4]);
    const arrA = i => (ev[i][1] === null ? null : ev[i][1] + ev[i][3]);
    const start = w0 + depA(0), end = w0 + arrA(n - 1);
    if (!(start <= T + H && end > T)) continue;
    const tr = app.trains[run.train];
    let k = -1;
    for (let i = 0; i < n - 1; i++) if (w0 + depA(i) <= T) k = i;
    const k0 = Math.max(k, 0);
    let arrNext = null;
    if (k >= 0) { const a = w0 + arrA(k + 1); if (a <= T) arrNext = a; }
    const bump = arrNext === null ? (opt.bumps?.[run.run] || 0) : 0;
    const depDelays = ev.map(e => e[4]);
    depDelays[k0] += bump;
    const reportAbs = w0 + ev[k0][2] + depDelays[k0];
    const day = Math.floor(reportAbs / 1440);
    const date = new Date(Date.parse(app.startDate + "T00:00:00Z") + day * 86400000);
    const weather = { ...rep.weather[String(day - rep.t0_day)] };
    const st = { depDelays, resched: run.resched, reportTime: reportAbs, date, weather, overrides: opt.fog ? { visibility: 0.3, fog_season: 1 } : null };
    const fcRows = forecastAll(app.M, tr, k0, st, i => w0 + ev[i][1], w0 + ev[k0][2]);
    const fc = new Array(n).fill(null);
    for (const r of fcRows) fc[r.s] = r.med;
    out.push({
      id: run.run, number: run.train, kind: tr.kind, w: weights[tr.kind], line: tr.route,
      stops: ev.map((e, i) => ({ code: tr.stops[i].code, arr: e[1] === null ? null : w0 + e[1], dep: e[2] === null ? null : w0 + e[2] })),
      k, dep0: k === -1 ? w0 + ev[0][2] + depDelays[0] : null, dep_k: k >= 0 ? w0 + depA(k) : null, arr_next: arrNext, fc, bump,
    });
  }
  return { trains: out, now: T };
}

// ------------------------------------------------------------------------------------------
// Reading a solution: holds, decisions, platforms, per-train impact
// ------------------------------------------------------------------------------------------
// The minimum time each event could take given its own train only; a hold is any wait beyond it.
export function holds(inst, t) {
  const E = inst.E, out = [];
  const pred = new Map();
  for (const [u, v, lag] of inst.arcs) pred.set(v, [u, lag]);
  for (let i = 0; i < inst.nE; i++) {
    if (E.type[i] !== "D" || E.fixed[i] || E.train[i] < 0) continue;
    const p = pred.get(i);
    const earliest = Math.max(E.rel[i], p ? t[p[0]] + p[1] : -Infinity);
    const wait = t[i] - earliest;
    if (wait > 0.5) out.push({ e: i, train: E.train[i], code: E.code[i], wait, at: t[i] });
  }
  return out;
}

export function trainImpact(inst, tBefore, tAfter) {
  return inst.trains.map((tr, ti) => {
    const terms = inst.obj.filter(([a]) => inst.E.train[a] === ti);
    const cost = t => terms.reduce((s, [a, sc, w]) => s + w * Math.max(0, t[a] - sc), 0);
    const mins = t => terms.reduce((s, [a, sc]) => s + Math.max(0, t[a] - sc), 0);
    const last = terms.length ? terms[terms.length - 1] : null;
    return {
      ti, number: tr.number, kind: tr.kind, w: tr.w,
      before: cost(tBefore), after: cost(tAfter), minsBefore: mins(tBefore), minsAfter: mins(tAfter),
      lastCode: last ? inst.E.code[last[0]] : null,
      lastBefore: last ? tBefore[last[0]] - last[1] : null, lastAfter: last ? tAfter[last[0]] - last[1] : null,
      stops: terms.length,
    };
  });
}

export function totalMinutes(inst, t) {
  let s = 0;
  for (const [a, sc] of inst.obj) s += Math.max(0, t[a] - sc);
  return s;
}

// Line allocation once the times are fixed: interval colouring by arrival time, preferring a train's
// usual line (line 1 for trains running away from Dehradun, line 2 towards it).
export function platforms(inst, t, code) {
  const V = inst.visits, P = inst.P, L = inst.cap[code];
  const lst = (inst.byStation.get(code) || []).map(vi => {
    const v = V[vi];
    const u = inst.usages.find(us => us.train === v.train && (us.d === v.e || us.A === v.s));
    const dir = u ? u.dir : 1;
    return { vi, train: v.train, lo: t[v.s] + v.os, hi: t[v.e] + v.oe, hiC: t[v.e] + v.oe + P.clear, pref: dir === 1 ? 0 : Math.min(1, L - 1) };
  }).sort((a, b) => a.lo - b.lo || a.vi - b.vi);
  const free = new Array(L).fill(-Infinity);
  let moved = 0;
  for (const x of lst) {
    let line = free[x.pref] <= x.lo + EPS ? x.pref : -1;
    if (line < 0) for (let l = 0; l < L; l++) if (free[l] <= x.lo + EPS) { line = l; break; }
    if (line < 0) { line = free.indexOf(Math.min(...free)); x.over = true; }
    if (line !== x.pref) moved++;
    x.line = line;
    free[line] = x.hiC;
  }
  return { L, items: lst, moved };
}
