"""End-to-end pipeline: simulate -> features -> train -> evaluate -> export.

Run from the repository root:  python -m kalyon.train
Outputs: models/*.txt (LightGBM), docs/data/*.json (website), reports/metrics.json.
"""
from __future__ import annotations

import datetime as dt
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy import stats

from .features import FEATURES, LABELS, add_history, pair_rows, static_pairs
from .network import HELD_OUT, TRAINS, network_json
from .simulate import OBSERVED, START, calibrate, simulate, station_means

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
MODELS = os.path.join(ROOT, "models")
TRAIN_END, VAL_END = 242, 304  # day indices: train Nov 2025-Jun 2026, val Jul-Aug, test Sep-Oct 2026
QUANTILES = {"q10": 0.1, "q50": 0.5, "q90": 0.9}
SEED = 7

BASE_PARAMS = dict(learning_rate=0.05, num_leaves=31, min_data_in_leaf=60, feature_fraction=0.9,
                   bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=SEED,
                   deterministic=True, force_row_wise=True, num_threads=4)


def fit(params, Xtr, ytr, Xva, yva, rounds=700):
    dtr = lgb.Dataset(Xtr, ytr, free_raw_data=False)
    dva = lgb.Dataset(Xva, yva, reference=dtr)
    return lgb.train({**BASE_PARAMS, **params}, dtr, rounds, valid_sets=[dva],
                     callbacks=[lgb.early_stopping(40, verbose=False)])


def constrain(df, eta_col):
    """Arrival forecasts must be non-decreasing along the route and physically feasible."""
    t_rep = df["sched_arr"] - df["sched_rem"] + 0.0  # scheduled departure from k (absolute minutes)
    report = t_rep + df["cur_delay"]
    floor = report + 0.8 * (df["sched_rem"] - df["slack_rem"])
    eta = np.maximum(df[eta_col], floor)
    eta = eta.groupby([df["run"], df["k"]]).cummax()
    return eta


def metrics(err):
    a = np.abs(err)
    return {"mae": float(a.mean()), "rmse": float(np.sqrt((err ** 2).mean())),
            "within5": float((a <= 5).mean()), "within15": float((a <= 15).mean()), "n": int(len(err))}


def tree_export(booster):
    """Compact JSON trees for in-browser inference and TreeSHAP."""
    dump = booster.dump_model()
    trees = []
    mt = {"None": 0, "Zero": 1, "NaN": 2}
    for t in dump["tree_info"]:
        f, th, l, r, d, m, v, c = [], [], [], [], [], [], [], []

        def walk(node):
            i = len(f)
            for arr in (f, th, l, r, d, m, v, c):
                arr.append(0)
            if "leaf_value" in node:
                f[i], v[i], c[i], l[i], r[i] = -1, node["leaf_value"], node.get("leaf_count", 0), -1, -1
            else:
                f[i], th[i] = node["split_feature"], node["threshold"]
                d[i], m[i], c[i] = int(node["default_left"]), mt[node["missing_type"]], node["internal_count"]
                l[i] = walk(node["left_child"])
                r[i] = walk(node["right_child"])
            return i

        walk(t["tree_structure"])
        trees.append({"f": f, "t": th, "l": l, "r": r, "d": d, "m": m, "v": v, "c": c})
    return trees


def main():
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "reports"), exist_ok=True)

    print("1/6 calibrating and simulating ...")
    offsets = calibrate(SEED)
    events, runs, wx = simulate(SEED, offsets)

    print("2/6 building features ...")
    df = pair_rows(events, runs, wx)
    held = df["train"].isin(HELD_OUT)
    tr_mask = (df["day"] < TRAIN_END) & ~held
    va_mask = (df["day"] >= TRAIN_END) & (df["day"] < VAL_END) & ~held
    te_mask = (df["day"] >= VAL_END) & ~held
    te_held = (df["day"] >= VAL_END) & held
    df, hist_med, hist_arr = add_history(df, tr_mask)
    X = df[FEATURES].astype(float)
    y = df["residual"].astype(float)

    print("3/6 training models ...")
    models = {"m1": fit({"objective": "huber", "alpha": 20.0}, X[tr_mask], y[tr_mask], X[va_mask], y[va_mask])}
    for name, q in QUANTILES.items():
        models[name] = fit({"objective": "quantile", "alpha": q}, X[tr_mask], y[tr_mask], X[va_mask], y[va_mask])
    for name, b in models.items():
        b.save_model(os.path.join(MODELS, f"{name}.txt"))
        df[f"p_{name}"] = b.predict(X, num_iteration=b.best_iteration)

    # Interval calibration on the validation period: scale the 10-90 band to reach 80% coverage.
    va = df[va_mask]
    lo_w, hi_w = va["p_q50"] - va["p_q10"], va["p_q90"] - va["p_q50"]
    grid = np.linspace(0.6, 3.0, 241)
    cov = [float(((va["residual"] >= va["p_q50"] - c * lo_w) & (va["residual"] <= va["p_q50"] + c * hi_w)).mean()) for c in grid]
    c_scale = float(grid[int(np.argmin([abs(v - 0.80) for v in cov]))])

    print("4/6 evaluating ...")
    sched = df["sched_arr"]
    df["eta_b0"] = sched
    df["eta_b1"] = sched + df["cur_delay"]
    df["eta_b2"] = sched + df["hist_arr"].fillna(df["cur_delay"])
    df["eta_m1"] = sched + df["cur_delay"] + df["p_m1"]
    df["eta_m2"] = sched + df["cur_delay"] + df["p_q50"]
    for col in ("eta_m1", "eta_m2"):
        df[col] = constrain(df, col)
    df["lo"] = sched + df["cur_delay"] + df["p_q50"] - c_scale * (df["p_q50"] - df["p_q10"])
    df["hi"] = sched + df["cur_delay"] + df["p_q50"] + c_scale * (df["p_q90"] - df["p_q50"])
    df["actual"] = sched + df["arr_delay"]
    names = {"b0": "B0 Timetable", "b1": "B1 Constant delay", "b2": "B2 Historical average",
             "m1": "M1 Kalyon point model", "m2": "M2 Kalyon median (quantile)"}

    def evaluate(part):
        out = {k: metrics(part[f"eta_{k}"] - part["actual"]) for k in names}
        inside = (part["actual"] >= part["lo"]) & (part["actual"] <= part["hi"])
        out["interval"] = {"coverage": float(inside.mean()), "width": float((part["hi"] - part["lo"]).mean())}
        return out

    test = df[te_mask]
    held_test = df[te_held]
    seen_test = test
    rep = {"names": names, "test": evaluate(test), "held_out": evaluate(held_test), "val_interval_scale": c_scale}
    # Intermediate stations only (exclude terminals), as the PAC recommends monitoring en route.
    rep["intermediate"] = evaluate(test[test["is_terminal"] == 0])

    def bins(part, col, edges, labels):
        cut = pd.cut(part[col], edges, labels=labels, right=False)
        res = []
        for lab in labels:
            p = part[cut == lab]
            if len(p) < 30:
                continue
            row = {"bin": lab, "n": int(len(p))}
            for k in names:
                row[k] = float(np.abs(p[f"eta_{k}"] - p["actual"]).mean())
            row["coverage"] = float(((p["actual"] >= p["lo"]) & (p["actual"] <= p["hi"])).mean())
            row["width"] = float((p["hi"] - p["lo"]).mean())
            res.append(row)
        return res

    rep["by_stops"] = bins(test, "n_rem", [1, 2, 3, 4, 5, 6, 8, 99], ["1", "2", "3", "4", "5", "6-7", "8+"])
    rep["by_hours"] = bins(test.assign(h=test["sched_rem"] / 60), "h", [0, 1, 2, 4, 6, 9, 99],
                           ["<1 h", "1-2 h", "2-4 h", "4-6 h", "6-9 h", "9 h+"])
    st_rows = []
    for code, p in test[test["is_terminal"] == 0].groupby("station"):
        st_rows.append({"station": code, "n": int(len(p)),
                        "b1": float(np.abs(p["eta_b1"] - p["actual"]).mean()),
                        "m1": float(np.abs(p["eta_m1"] - p["actual"]).mean())})
    rep["by_station"] = sorted(st_rows, key=lambda r: -r["n"])

    # H1/H2: paired Wilcoxon signed-rank test on absolute errors, beyond the next stop.
    beyond = test[test["n_rem"] >= 2]
    e1 = np.abs(beyond["eta_b1"] - beyond["actual"])
    em = np.abs(beyond["eta_m1"] - beyond["actual"])
    w = stats.wilcoxon(e1, em, alternative="greater")
    rep["wilcoxon"] = {"n": int(len(beyond)), "statistic": float(w.statistic), "p_value": float(w.pvalue),
                       "median_paired_gain_min": float(np.median(e1 - em)),
                       "mae_b1": float(e1.mean()), "mae_m1": float(em.mean())}

    # Feature attributions (TreeSHAP, LightGBM pred_contrib) on a test sample.
    sample = test.sample(min(6000, len(test)), random_state=SEED)
    contrib = models["q50"].predict(sample[FEATURES].astype(float), pred_contrib=True,
                                    num_iteration=models["q50"].best_iteration)
    imp = np.abs(contrib[:, :-1]).mean(axis=0)
    rep["importance"] = sorted([{"feature": f, "label": LABELS[f], "mean_abs_shap": float(v)}
                                for f, v in zip(FEATURES, imp)], key=lambda r: -r["mean_abs_shap"])
    rep["counts"] = {"runs": len(runs), "events": len(events), "rows": int(len(df)),
                     "train_rows": int(tr_mask.sum()), "val_rows": int(va_mask.sum()),
                     "test_rows": int(te_mask.sum()), "held_out_rows": int(te_held.sum()),
                     "trees": {k: int(b.best_iteration) for k, b in models.items()}}
    rep["periods"] = {"train": "1 Nov 2025 – 30 Jun 2026", "val": "1 Jul – 31 Aug 2026", "test": "1 Sep – 31 Oct 2026"}

    # Calibration check against the observed RunningStatus.in averages.
    calib = []
    for key, prof in OBSERVED.items():
        m = station_means(events, runs, prof["train"])
        calib.append({"observed_train": key, "label": prof["label"], "synthetic_train": prof["train"],
                      "stations": prof["stations"], "observed": prof["delay"],
                      "synthetic": [round(m[c], 1) for c in prof["stations"]]})
    rep["calibration"] = calib

    print("5/6 exporting ...")
    with open(os.path.join(ROOT, "reports", "metrics.json"), "w") as fh:
        json.dump(rep, fh, indent=1)
    json.dump(rep, open(os.path.join(DATA, "metrics.json"), "w"))
    json.dump(network_json(), open(os.path.join(DATA, "network.json"), "w"), ensure_ascii=False)

    pairs = static_pairs()
    trains_out = []
    for t in TRAINS:
        tj = t.to_json()
        tj["held_out"] = t.number in HELD_OUT
        pj = {}
        for (num, k, s), v in pairs.items():
            if num != t.number:
                continue
            h = hist_med.get((num, k, s), np.nan)
            pj[f"{k}-{s}"] = [v["n_rem"], v["dist_rem"], v["sched_rem"], v["slack_rem"], v["single_frac"],
                              v["cong_rem"], None if pd.isna(h) else round(float(h), 3)]
        tj["pairs"] = pj
        tj["hist_arr"] = [None if pd.isna(hist_arr.get((t.number, s), np.nan)) else round(float(hist_arr[(t.number, s)]), 2)
                          for s in range(len(t.stops))]
        trains_out.append(tj)
    json.dump({"trains": trains_out, "pair_fields": ["n_rem", "dist_rem", "sched_rem", "slack_rem", "single_frac", "cong_rem", "hist_chg"]},
              open(os.path.join(DATA, "trains.json"), "w"), ensure_ascii=False)

    model_json = {"features": FEATURES, "labels": LABELS, "interval_scale": c_scale,
                  "models": {k: {"trees": tree_export(b), "best_iteration": int(b.best_iteration)} for k, b in models.items()}}
    # Keep only the trees used at the best iteration.
    for k, b in models.items():
        model_json["models"][k]["trees"] = model_json["models"][k]["trees"][:b.best_iteration]
    with open(os.path.join(DATA, "model.json"), "w") as fh:
        json.dump(model_json, fh, separators=(",", ":"))

    replay_runs = export_replays(events, runs, wx)
    export_parity(df, models, X, replay_runs)
    print("6/6 done.")
    print(json.dumps({k: rep["test"][k]["mae"] for k in names}, indent=1), rep["test"]["interval"], rep["held_out"]["m1"]["mae"], rep["held_out"]["b1"]["mae"])
    print("wilcoxon", rep["wilcoxon"])


def export_replays(events, runs, wx):
    by_run = {}
    for e in events:
        by_run.setdefault(e["run"], []).append(e)
    fog_day = next(i for i in range(60, 100) if wx[i]["visibility"] < 0.45)
    days = [
        {"id": "typical", "title": "Typical day", "day": (dt.date(2026, 9, 15) - START).days,
         "note": "Test period: the models never saw this day."},
        {"id": "festive", "title": "Festive rush", "day": (dt.date(2026, 10, 28) - START).days,
         "note": "Test period, festival travel season: the models never saw this day."},
        {"id": "fog", "title": "Winter fog", "day": fog_day,
         "note": "Training period (in-sample): included to show fog behaviour, which the Sep–Oct test period lacks."},
    ]
    out = []
    for spec in days:
        w0 = spec["day"] * 1440 + 4 * 60
        w1 = w0 + 24 * 60
        rr = []
        for r in runs:
            ev = sorted(by_run[r["run"]], key=lambda e: e["seq"])
            start = ev[0]["sched_dep"] + ev[0]["dep_delay"]
            end = ev[-1]["sched_arr"] + ev[-1]["arr_delay"]
            if end < w0 or start > w1:
                continue
            rr.append({"run": r["run"], "train": r["train"], "date": r["date"], "resched": r["resched"],
                       "ev": [[e["seq"], None if e["sched_arr"] is None else e["sched_arr"] - w0,
                               None if e["sched_dep"] is None else e["sched_dep"] - w0,
                               e["arr_delay"], e["dep_delay"]] for e in ev]})
        dd = spec["day"]
        out.append({**spec, "date": (START + dt.timedelta(days=dd)).isoformat(), "t0_day": dd,
                    "weather": {str(i - dd): wx[i] for i in range(max(dd - 2, 0), min(dd + 3, len(wx)))},
                    "runs": rr})
    json.dump({"fields": ["seq", "sched_arr", "sched_dep", "arr_delay", "dep_delay"], "replays": out,
               "start_date": START.isoformat()},
              open(os.path.join(DATA, "replays.json"), "w"), separators=(",", ":"))
    return {r["run"] for rep in out for r in rep["runs"]}


def export_parity(df, models, X, replay_runs):
    s = df.sample(300, random_state=1)
    rows = []
    for idx, r in s.iterrows():
        x = [None if pd.isna(v) else float(v) for v in X.loc[idx].tolist()]
        xr = X.loc[[idx]]
        rows.append({"x": x, **{k: float(b.predict(xr, num_iteration=b.best_iteration)[0]) for k, b in models.items()},
                     "shap_q50": [float(v) for v in models["q50"].predict(xr, pred_contrib=True, num_iteration=models["q50"].best_iteration)[0]]})
    feat = df[df["run"].isin(replay_runs)].sample(400, random_state=2)
    frows = [{"run": int(r["run"]), "k": int(r["k"]), "s": int(r["s"]),
              "x": [None if pd.isna(r[f]) else float(r[f]) for f in FEATURES]} for _, r in feat.iterrows()]
    json.dump({"pred": rows, "features": frows}, open(os.path.join(ROOT, "tests", "parity_rows.json"), "w"))


if __name__ == "__main__":
    main()
