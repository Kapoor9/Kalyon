// Kalyon inference engine: LightGBM tree evaluation, TreeSHAP and feature building.
// Runs in the browser and in Node (tests/parity.mjs checks it against Python/LightGBM).

const ZERO = 1e-35;

function goLeft(tree, i, x) {
  let v = x[tree.f[i]];
  const mt = tree.m[i];
  if (v === null || v === undefined) v = NaN;
  if (Number.isNaN(v) && mt !== 2) v = 0;
  if ((mt === 1 && Math.abs(v) <= ZERO) || (mt === 2 && Number.isNaN(v))) return tree.d[i] === 1;
  return v <= tree.t[i];
}

export function predictTree(tree, x) {
  let i = 0;
  while (tree.f[i] !== -1) i = goLeft(tree, i, x) ? tree.l[i] : tree.r[i];
  return tree.v[i];
}

export function predict(model, x) {
  let s = 0;
  for (const t of model.trees) s += predictTree(t, x);
  return s;
}

// ---- TreeSHAP (Lundberg, Erion & Lee, Algorithm 2), path-dependent, using node counts as cover ----
function extend(m, pz, po, pi) {
  const l = m.length;
  const out = m.map(e => ({ ...e }));
  out.push({ d: pi, z: pz, o: po, w: l === 0 ? 1 : 0 });
  for (let i = l - 1; i >= 0; i--) {
    out[i + 1].w += po * out[i].w * (i + 1) / (l + 1);
    out[i].w = pz * out[i].w * (l - i) / (l + 1);
  }
  return out;
}

function unwind(m, i) {
  const l = m.length - 1;
  let n = m[l].w;
  const out = m.slice(0, l).map(e => ({ ...e }));
  const o = m[i].o, z = m[i].z;
  for (let j = l - 1; j >= 0; j--) {
    if (o !== 0) {
      const t = out[j].w;
      out[j].w = n * (l + 1) / ((j + 1) * o);
      n = t - out[j].w * z * (l - j) / (l + 1);
    } else {
      out[j].w = (out[j].w * (l + 1)) / (z * (l - j));
    }
  }
  for (let j = i; j < l; j++) {
    out[j].d = m[j + 1].d; out[j].z = m[j + 1].z; out[j].o = m[j + 1].o;
  }
  return out;
}

function unwoundSum(m, i) {
  return unwind(m, i).reduce((a, e) => a + e.w, 0);
}

function shapTree(tree, x, phi) {
  const recurse = (j, m, pz, po, pi) => {
    m = extend(m, pz, po, pi);
    if (tree.f[j] === -1) {
      for (let i = 1; i < m.length; i++) {
        phi[m[i].d] += unwoundSum(m, i) * (m[i].o - m[i].z) * tree.v[j];
      }
      return;
    }
    const left = goLeft(tree, j, x);
    const h = left ? tree.l[j] : tree.r[j];
    const c = left ? tree.r[j] : tree.l[j];
    let iz = 1, io = 1;
    const dj = tree.f[j];
    let k = -1;
    for (let q = 1; q < m.length; q++) if (m[q].d === dj) { k = q; break; }
    if (k !== -1) { iz = m[k].z; io = m[k].o; m = unwind(m, k); }
    const rj = tree.c[j];
    recurse(h, m, iz * tree.c[h] / rj, io, dj);
    recurse(c, m, iz * tree.c[c] / rj, 0, dj);
  };
  recurse(0, [], 1, 1, -1);
}

function expectedTree(tree) {
  const rec = i => (tree.f[i] === -1 ? tree.v[i]
    : (tree.c[tree.l[i]] * rec(tree.l[i]) + tree.c[tree.r[i]] * rec(tree.r[i])) / tree.c[i]);
  return rec(0);
}

// Returns an array of length nFeatures + 1; the last entry is the expected value (base).
export function shap(model, x, nFeatures) {
  const phi = new Array(nFeatures + 1).fill(0);
  for (const t of model.trees) {
    shapTree(t, x, phi);
    if (t._ev === undefined) t._ev = expectedTree(t);
    phi[nFeatures] += t._ev;
  }
  return phi;
}

// ---- Features (mirror of kalyon/features.py) ----
export const PAIR_FIELDS = ["n_rem", "dist_rem", "sched_rem", "slack_rem", "single_frac", "cong_rem", "hist_chg"];

export function buildFeatures(features, train, k, s, st) {
  // st: {depDelays: [...dep delays up to k], resched, reportTime (abs minutes), date (Date), weather, overrides}
  const p = train.pairs[`${k}-${s}`];
  const dk = st.depDelays[k];
  const v = {
    cur_delay: dk,
    dchg1: k >= 1 ? dk - st.depDelays[k - 1] : 0,
    dchg3: dk - st.depDelays[Math.max(k - 3, 0)],
    resched: st.resched,
    n_rem: p[0], dist_rem: p[1], sched_rem: p[2], slack_rem: p[3], single_frac: p[4], cong_rem: p[5],
    hist_chg: p[6] === null ? NaN : p[6],
    hour: (((st.reportTime % 1440) + 1440) % 1440) / 60,
    dow: (st.date.getUTCDay() + 6) % 7,
    month: st.date.getUTCMonth() + 1,
    fog_season: st.weather.fog_season,
    visibility: st.weather.visibility,
    rain: st.weather.rain,
    festival: st.weather.festival,
    train_type: { express: 0, superfast: 1, special: 2 }[train.kind],
  };
  if (st.overrides) Object.assign(v, st.overrides);
  return features.map(f => v[f]);
}

// Forecast every downstream stop after a report at stop k.
// schedArr(s) gives the scheduled arrival (abs minutes) at stop s; schedDepK the scheduled departure at k.
export function forecastAll(M, train, k, st, schedArr, schedDepK, withShap = false) {
  const nF = M.features.length;
  const out = [];
  const dk = st.depDelays[k];
  const report = schedDepK + dk;
  let prevMed = -Infinity, prevM1 = -Infinity;
  for (let s = k + 1; s < train.stops.length; s++) {
    const x = buildFeatures(M.features, train, k, s, st);
    const sa = schedArr(s);
    const b1 = sa + dk;
    const q10 = predict(M.models.q10, x), q50 = predict(M.models.q50, x), q90 = predict(M.models.q90, x);
    const m1r = predict(M.models.m1, x);
    const p = train.pairs[`${k}-${s}`];
    const floor = report + 0.8 * (p[2] - p[3]);
    let med = Math.max(b1 + q50, floor), m1 = Math.max(b1 + m1r, floor);
    med = Math.max(med, prevMed); m1 = Math.max(m1, prevM1);
    prevMed = med; prevM1 = m1;
    const c = M.interval_scale;
    const lo = Math.max(b1 + q50 - c * (q50 - q10), report);
    const hi = Math.max(b1 + q50 + c * (q90 - q50), med);
    const row = { s, code: train.stops[s].code, sched: sa, b0: sa, b1, m1, med, lo: Math.min(lo, med), hi, x };
    if (withShap) row.shap = shap(M.models.q50, x, nF);
    out.push(row);
  }
  return out;
}

// Report state for run `run` of a replay, after it departs stop k (k ≤ last departed stop).
export function replayState(replay, run, k, startDate) {
  const w0 = replay.t0_day * 1440 + 240;
  const depDelays = run.ev.map(e => e[4]);
  const reportAbs = w0 + run.ev[k][2] + run.ev[k][4];
  const day = Math.floor(reportAbs / 1440);
  const date = new Date(Date.parse(startDate + "T00:00:00Z") + day * 86400000);
  const weather = replay.weather[String(day - replay.t0_day)];
  return { depDelays, resched: run.resched, reportTime: reportAbs, date, weather, w0 };
}
