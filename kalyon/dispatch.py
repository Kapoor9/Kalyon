"""Train and evaluate Kalyon's AI dispatcher, and export the optimisation engine's data.

Run from the repository root after kalyon.train:  python -m kalyon.dispatch

1. Rebuild the synthetic year (same seed as kalyon.train) and take snapshots of the corridor.
2. For each snapshot, forecast every train with Kalyon's LightGBM median model (exactly as the
   website does), build the optimisation instance and solve it to proven optimality with HiGHS.
3. Learn, from the optimal solutions on training days, which train should go first in a conflict
   (imitation learning: a LightGBM classifier). Its trees are exported for the browser, where they
   guide the exact search and power a fast "AI dispatcher" rule.
4. Evaluate on unseen test days: dispatching rules vs the AI dispatcher vs the proven optimum.

Everything here runs on SYNTHETIC data: the results show that the method works, not how much
delay it would save on the real network.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time

import lightgbm as lgb
import numpy as np

from . import optimise as O
from .features import FEATURES
from .network import TRAINS, build_timetable
from .simulate import START, calibrate, simulate
from .train import DATA, MODELS, ROOT, SEED, TRAIN_END, VAL_END, tree_export

HORIZON = 240.0


def load():
    web = json.load(open(os.path.join(DATA, "trains.json")))
    trains = {t["number"]: t for t in web["trains"]}
    q50 = lgb.Booster(model_file=os.path.join(MODELS, "q50.txt"))
    return trains, q50


def forecast_rows(tr, run, ev, k, depd, wx):
    """Feature rows for every stop after report k (mirror of engine.js buildFeatures)."""
    dk = depd[k]
    report = ev[k]["sched_dep"] + dk
    day = int(report // 1440)
    date = START + dt.timedelta(days=day)
    w = wx[min(day, len(wx) - 1)]
    rows = []
    for s in range(k + 1, len(ev)):
        p = tr["pairs"][f"{k}-{s}"]
        v = {"cur_delay": dk, "dchg1": dk - depd[k - 1] if k >= 1 else 0.0, "dchg3": dk - depd[max(k - 3, 0)],
             "resched": run["resched"], "n_rem": p[0], "dist_rem": p[1], "sched_rem": p[2], "slack_rem": p[3],
             "single_frac": p[4], "cong_rem": p[5], "hist_chg": np.nan if p[6] is None else p[6],
             "hour": (report % 1440) / 60.0, "dow": date.weekday(), "month": date.month,
             "fog_season": w["fog_season"], "visibility": w["visibility"], "rain": w["rain"],
             "festival": w["festival"], "train_type": {"express": 0, "superfast": 1, "special": 2}[tr["kind"]]}
        rows.append([v[f] for f in FEATURES])
    return rows, report


def medians(tr, ev, k, depd, q50pred, report):
    """forecastAll's median path: constant-delay + residual, floor and non-decreasing."""
    dk = depd[k]
    out = [None] * len(ev)
    prev = -np.inf
    for j, s in enumerate(range(k + 1, len(ev))):
        p = tr["pairs"][f"{k}-{s}"]
        b1 = ev[s]["sched_arr"] + dk
        floor = report + 0.8 * (p[2] - p[3])
        m = max(b1 + q50pred[j], floor)
        m = max(m, prev)
        prev = m
        out[s] = float(m)
    return out


def snapshot(T, runs, by_run, trains, q50, wx, rng=None, weights=None):
    """Layer-1 input of the optimiser: the trains on the corridor around time T with their forecasts."""
    weights = weights or O.PRIORITY
    cand = []
    for r in runs:
        ev = by_run[r["run"]]
        start = ev[0]["sched_dep"] + ev[0]["dep_delay"]
        end = ev[-1]["sched_arr"] + ev[-1]["arr_delay"]
        if start <= T + HORIZON and end > T:
            cand.append((r, ev))
    out, rows, meta = [], [], []
    bump = None
    if rng is not None and cand and rng.random() < 0.5:
        bump = (int(rng.integers(len(cand))), float(rng.uniform(10, 60)))
    for ci, (r, ev) in enumerate(cand):
        tr = trains[r["train"]]
        n = len(ev)
        depd = [e["dep_delay"] for e in ev]
        k = -1
        for i in range(n - 1):
            if ev[i]["sched_dep"] + depd[i] <= T:
                k = i
        k0 = max(k, 0)
        arr_next = None
        if k >= 0:
            a = ev[k + 1]["sched_arr"] + ev[k + 1]["arr_delay"]
            if a <= T:
                arr_next = a
        extra = 0.0
        if bump and bump[0] == ci and arr_next is None:
            extra = bump[1]
        depd = list(depd)
        depd[k0] += extra
        fr, report = forecast_rows(tr, r, ev, k0, depd, wx)
        rows.extend(fr)
        meta.append((len(fr), tr, ev, k0, depd, report))
        stops = [{"code": e["code"], "arr": e["sched_arr"], "dep": e["sched_dep"]} for e in ev]
        out.append({"id": r["run"], "number": r["train"], "kind": tr["kind"], "w": weights[tr["kind"]],
                    "line": tr["route"], "stops": stops, "k": k,
                    "dep0": ev[0]["sched_dep"] + depd[0] if k == -1 else None,
                    "dep_k": ev[k]["sched_dep"] + ev[k]["dep_delay"] if k >= 0 else None,
                    "arr_next": arr_next, "bump": extra})
    if not out:
        return []
    pred = q50.predict(np.array(rows, dtype=float))
    o = 0
    for d, (m, tr, ev, k0, depd, report) in zip(out, meta):
        d["fc"] = medians(tr, ev, k0, depd, pred[o:o + m], report)
        o += m
    return out


def labelled(inst, sol):
    """(features, label) for every pair that is in conflict in Kalyon's unconstrained forecast."""
    t = inst["base"]
    confs = O.conflicts(inst, t)
    cnt = O.conflict_counts(inst, t, confs)
    X, y = [], []
    for c in confs:
        if c["kind"] != "pair":
            continue
        p = inst["pairs"][c["pair"]]
        X.append(O.pair_features(inst, t, p, cnt))
        y.append(1 if sol["orders"][c["pair"]] == 1 else 0)
    return X, y


def main():
    t0 = time.time()
    trains, q50 = load()
    print("1/5 rebuilding the synthetic year ...")
    offsets = calibrate(SEED)
    events, runs, wx = simulate(SEED, offsets)
    by_run = {}
    for e in events:
        by_run.setdefault(e["run"], []).append(e)
    for v in by_run.values():
        v.sort(key=lambda e: e["seq"])
    rng = np.random.default_rng(11)

    def run_set(days, per_day, perturb, jitter):
        data = []
        for d in days:
            for T in sorted(rng.uniform(0, 1440, per_day)):
                T = float(d * 1440 + round(T))
                w = dict(O.PRIORITY)
                if jitter:
                    w = {"superfast": float(rng.uniform(1.1, 2.2)), "express": 1.0, "special": float(rng.uniform(0.4, 1.0))}
                tr = snapshot(T, runs, by_run, trains, q50, wx, rng if perturb else None, w)
                if len(tr) < 2:
                    continue
                inst = O.build_instance(tr, T)
                nconf = len(O.conflicts(inst, inst["base"]))
                if nconf == 0:
                    continue
                sol = O.milp(inst, time_limit=20)
                if sol is None or not sol["verified"] or not sol["optimal"]:
                    print("  skipped (no verified optimum)", d, T)
                    continue
                data.append((tr, T, inst, sol, nconf))
        return data

    print("2/5 solving training snapshots to optimality (HiGHS) ...")
    smoke = os.environ.get("KALYON_SMOKE")
    train_days = list(range(0, TRAIN_END, 40 if smoke else 1))
    val_days = list(range(TRAIN_END, VAL_END, 20 if smoke else 1))
    test_days = list(range(VAL_END, 365, 15 if smoke else 1))
    tr_set = run_set(train_days, 3, True, True)
    va_set = run_set(val_days, 2, True, True)
    print(f"   {len(tr_set)} training and {len(va_set)} validation snapshots ({time.time() - t0:.0f}s)")

    def xy(data):
        X, Y = [], []
        for _, _, inst, sol, _ in data:
            a, b = labelled(inst, sol)
            X += a
            Y += b
        return np.array(X, dtype=float), np.array(Y)

    Xtr, ytr = xy(tr_set)
    Xva, yva = xy(va_set)
    print(f"3/5 training the AI dispatcher on {len(ytr)} decisions ({ytr.mean():.2f} first-come-first-served) ...")
    params = dict(objective="binary", learning_rate=0.05, num_leaves=15, min_data_in_leaf=20,
                  feature_fraction=0.9, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0,
                  verbose=-1, seed=SEED, deterministic=True, force_row_wise=True, num_threads=4)
    dtr = lgb.Dataset(Xtr, ytr, feature_name=O.FEATS)
    dva = lgb.Dataset(Xva, yva, reference=dtr)
    clf = lgb.train(params, dtr, 600, valid_sets=[dva], callbacks=[lgb.early_stopping(40, verbose=False)])
    clf.save_model(os.path.join(MODELS, "dispatch.txt"))
    nt = clf.best_iteration

    def model_fn(f):
        z = clf.predict(np.array([f], dtype=float), num_iteration=nt, raw_score=True)[0]
        return 1.0 / (1.0 + np.exp(-z))

    print("4/5 evaluating on unseen test days ...")
    te_set = run_set(test_days, 3, True, False)
    rules = ["fcfs", "priority", "ai"]
    res = {r: [] for r in rules + ["opt", "base"]}
    agree = {r: [] for r in rules}
    Xte, yte = xy(te_set)
    pte = clf.predict(Xte, num_iteration=nt)
    agree_ai = float(((pte >= 0.5).astype(int) == yte).mean()) if len(yte) else 0.0
    fcfs_agree = float((yte == 1).mean()) if len(yte) else 0.0
    # priority rule agreement on labelled decisions
    pri_pred = np.where(Xte[:, O.FEATS.index("w_second")] > Xte[:, O.FEATS.index("w_first")] + 1e-9, 0, 1) if len(yte) else []
    pri_agree = float((pri_pred == yte).mean()) if len(yte) else 0.0
    cases = []
    for idx, (trs, T, inst, sol, nconf) in enumerate(te_set):
        row = {"opt": sol["obj"], "base": O.objective(inst, inst["base"]), "nconf": nconf}
        for r in rules:
            g = O.greedy(inst, r, model_fn if r == "ai" else None)
            row[r] = None if g is None else g["obj"]
        if any(row[r] is None for r in rules):
            continue
        for kk in res:
            res[kk].append(row[kk])
        if idx % 4 == 0 and len(cases) < 30:
            cases.append({"trains": trs, "now": T, "opt": sol["obj"], "fcfs": row["fcfs"], "priority": row["priority"],
                          "ai": row["ai"], "nE": inst["nE"], "npairs": len(inst["pairs"]), "base": inst["base"]})
    arr = {k: np.array(v) for k, v in res.items()}
    tot = {k: float(v.sum()) for k, v in arr.items()}

    def red(k):
        return float(1 - tot[k] / tot["fcfs"]) if tot["fcfs"] > 0 else 0.0

    opt_gap = {r: float(np.mean((arr[r] - arr["opt"]) / np.maximum(arr["opt"], 1.0))) for r in rules}
    ai_is_opt = float(np.mean(np.abs(arr["ai"] - arr["opt"]) < 0.01))
    fcfs_is_opt = float(np.mean(np.abs(arr["fcfs"] - arr["opt"]) < 0.01))
    pri_is_opt = float(np.mean(np.abs(arr["priority"] - arr["opt"]) < 0.01))
    gi = clf.feature_importance("gain", iteration=nt)
    metrics = {
        "note": "Synthetic corridor data. Savings are measured inside the optimisation model, against first-come-first-served dispatching using the same Kalyon forecasts; they are not a measurement of real operations.",
        "snapshots": {"train": len(tr_set), "val": len(va_set), "test": len(arr["opt"])},
        "decisions": {"train": int(len(ytr)), "val": int(len(yva)), "test": int(len(yte))},
        "horizon_min": HORIZON,
        "agreement_with_optimum": {"fcfs": fcfs_agree, "priority": pri_agree, "ai": agree_ai},
        "total_weighted_delay": tot,
        "reduction_vs_fcfs": {"priority": red("priority"), "ai": red("ai"), "opt": red("opt")},
        "mean_gap_to_optimum": opt_gap,
        "share_reaching_optimum": {"fcfs": fcfs_is_opt, "priority": pri_is_opt, "ai": ai_is_opt},
        "mean_per_snapshot": {k: float(v.mean()) for k, v in arr.items()},
        "mean_conflicts": float(np.mean([c for *_, c in te_set])) if te_set else 0.0,
        "trees": int(nt),
        "importance": sorted([{"feature": f, "gain": float(g)} for f, g in zip(O.FEATS, gi)], key=lambda r: -r["gain"]),
        "periods": {"train": "1 Nov 2025 – 30 Jun 2026", "val": "1 Jul – 31 Aug 2026", "test": "1 Sep – 31 Oct 2026"},
    }
    print(json.dumps({k: metrics[k] for k in ("snapshots", "decisions", "agreement_with_optimum", "reduction_vs_fcfs", "share_reaching_optimum", "mean_gap_to_optimum")}, indent=1))

    print("5/5 exporting ...")
    trees = tree_export(clf)[:nt]
    out = {"features": O.FEATS, "params": O.PARAMS, "priority": O.PRIORITY, "lines": O.LINES,
           "horizon": HORIZON, "model": {"trees": trees}, "metrics": metrics}
    with open(os.path.join(DATA, "dispatch.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    with open(os.path.join(ROOT, "reports", "dispatch_metrics.json"), "w") as fh:
        json.dump(metrics, fh, indent=1)
    # Parity cases for tests/opt_parity.mjs: layer-1 input, the base schedule, every rule and the optimum.
    pf = []
    for c in cases:
        pf.append({k: c[k] for k in ("trains", "now", "opt", "fcfs", "priority", "ai", "nE", "npairs")} | {"base": c["base"]})
    rows = []
    for x in Xte[:300]:
        rows.append({"x": [float(v) for v in x], "p": float(clf.predict(np.array([x]), num_iteration=nt)[0])})
    with open(os.path.join(ROOT, "tests", "opt_parity.json"), "w") as fh:
        json.dump({"cases": pf, "clf": rows}, fh)
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
