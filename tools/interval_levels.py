"""Compare Kalyon's likely range at 80%, 90% and 95%, and summarise the synthetic data.

Run from the repository root after kalyon.train:  python tools/interval_levels.py
Rebuilds the same synthetic year and split as kalyon/train.py (same seed), reuses the saved
q10/q50/q90 models for the 80% range, trains extra quantile models at 0.05/0.95 and 0.025/0.975
with the same settings, rescales each range on the validation period to its target coverage,
and reports coverage and width on the test period. Also writes the descriptive statistics used
in the research paper's Data Description section. Output: reports/interval_levels.json.
Everything here is SYNTHETIC data: it validates the pipeline, not real-world accuracy."""
import json, os, sys, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import numpy as np, pandas as pd, lightgbm as lgb
from kalyon.features import FEATURES, add_history, pair_rows
from kalyon.network import HELD_OUT, TRAINS, STATIONS, SECTIONS
from kalyon.simulate import calibrate, simulate, START
from kalyon.train import TRAIN_END, VAL_END, SEED, fit, constrain, MODELS

OUT = os.path.join(ROOT, "reports", "interval_levels.json")
offsets = calibrate(SEED)
events, runs, wx = simulate(SEED, offsets)
df = pair_rows(events, runs, wx)
held = df["train"].isin(HELD_OUT)
tr_mask = (df["day"] < TRAIN_END) & ~held
va_mask = (df["day"] >= TRAIN_END) & (df["day"] < VAL_END) & ~held
te_mask = (df["day"] >= VAL_END) & ~held
te_held = (df["day"] >= VAL_END) & held
df, _, _ = add_history(df, tr_mask)
X = df[FEATURES].astype(float); y = df["residual"].astype(float)

# Saved production models (reproduce the published 80% band exactly)
saved = {k: lgb.Booster(model_file=os.path.join(MODELS, f"{k}.txt")) for k in ("q10", "q50", "q90")}
for k, b in saved.items():
    df[f"p_{k}"] = b.predict(X, num_iteration=b.best_iteration or None)
# Extra quantile models trained exactly like the production ones
extra = {"q05": 0.05, "q95": 0.95, "q025": 0.025, "q975": 0.975}
trees = {}
for k, q in extra.items():
    b = fit({"objective": "quantile", "alpha": q}, X[tr_mask], y[tr_mask], X[va_mask], y[va_mask])
    df[f"p_{k}"] = b.predict(X, num_iteration=b.best_iteration); trees[k] = b.best_iteration

base = df["sched_arr"] + df["cur_delay"]
df["actual"] = df["sched_arr"] + df["arr_delay"]
levels = {"80%": ("q10", "q90", 0.80), "90%": ("q05", "q95", 0.90), "95%": ("q025", "q975", 0.95)}
va = df[va_mask]
res = {"trees_extra": trees}
for name, (lo, hi, target) in levels.items():
    lw, hw = va["p_q50"] - va[f"p_{lo}"], va[f"p_{hi}"] - va["p_q50"]
    grid = np.linspace(0.6, 3.0, 241)
    cov = [float(((va["residual"] >= va["p_q50"] - c * lw) & (va["residual"] <= va["p_q50"] + c * hw)).mean()) for c in grid]
    c = float(grid[int(np.argmin([abs(v - target) for v in cov]))])
    df[f"lo_{name}"] = base + df["p_q50"] - c * (df["p_q50"] - df[f"p_{lo}"])
    df[f"hi_{name}"] = base + df["p_q50"] + c * (df[f"p_{hi}"] - df["p_q50"])
    r = {"target": target, "scale": c}
    for part_name, m in [("test", te_mask), ("intermediate", te_mask & (df["is_terminal"] == 0)), ("held_out", te_held)]:
        p = df[m]
        inside = (p["actual"] >= p[f"lo_{name}"]) & (p["actual"] <= p[f"hi_{name}"])
        w = p[f"hi_{name}"] - p[f"lo_{name}"]
        r[part_name] = {"coverage": float(inside.mean()), "width_mean": float(w.mean()), "width_median": float(w.median()), "n": int(len(p))}
    # by horizon on test
    p = df[te_mask]; hrs = p["sched_rem"] / 60
    cut = pd.cut(hrs, [0, 1, 2, 4, 6, 9, 99], labels=["<1 h", "1-2 h", "2-4 h", "4-6 h", "6-9 h", "9 h+"], right=False)
    r["by_hours"] = {str(l): {"coverage": float(((g["actual"] >= g[f"lo_{name}"]) & (g["actual"] <= g[f"hi_{name}"])).mean()),
                              "width": float((g[f"hi_{name}"] - g[f"lo_{name}"]).mean()), "n": int(len(g))}
                     for l, g in p.groupby(cut, observed=True)}
    res[name] = r

# ---------- data description ----------
ev = pd.DataFrame(events); ru = pd.DataFrame(runs); w = pd.DataFrame(wx[:365])
ev = ev.merge(ru[["run", "train", "date"]], on="run")
arr = ev[ev["seq"] > 0]
term = ev.loc[ev.groupby("run")["seq"].idxmax()]
desc = {
    "period": f"{START} to {(START + dt.timedelta(days=364))}",
    "stations": len(STATIONS), "sections": len(SECTIONS), "route_km": sum(v[0] for v in SECTIONS.values()),
    "single_line_km": sum(v[0] for v in SECTIONS.values() if v[1]),
    "services": len(TRAINS), "held_out": sorted(HELD_OUT),
    "kinds": pd.Series([t.kind for t in TRAINS]).value_counts().to_dict(),
    "runs": len(ru), "events": len(ev), "arrival_events": len(arr), "pair_rows": len(df),
    "runs_per_train_mean": float(ru.groupby("train").size().mean()),
    "resched_share": float((ru["resched"] > 0).mean()), "resched_mean_when": float(ru.loc[ru["resched"] > 0, "resched"].mean()),
    "resched_max": float(ru["resched"].max()),
    "arr_delay": {k: float(v) for k, v in arr["arr_delay"].describe(percentiles=[.1, .25, .5, .75, .9, .95, .99]).items()},
    "terminal_delay": {k: float(v) for k, v in term["arr_delay"].describe(percentiles=[.5, .9]).items()},
    "share_arr_gt15": float((arr["arr_delay"] > 15).mean()), "share_arr_gt60": float((arr["arr_delay"] > 60).mean()),
    "share_arr_le5": float((arr["arr_delay"] <= 5).mean()),
    "fog_season_days": int(w["fog_season"].sum()), "dense_fog_days": int((w["visibility"] < 1).sum()),
    "rain_days": int((w["rain"] > 0).sum()), "heavy_rain_days": int((w["rain"] > 20).sum()), "festival_days": int(w["festival"].sum()),
    "by_month_mean_arr": {str(k): float(v) for k, v in arr.assign(m=pd.to_datetime(arr["date"]).dt.strftime("%Y-%m")).groupby("m")["arr_delay"].mean().items()},
    "splits": {"train": int(tr_mask.sum()), "val": int(va_mask.sum()), "test": int(te_mask.sum()), "held_out_test": int(te_held.sum())},
    "sample_events": ev[ev["run"] == ev[ev["train"] == "K131"]["run"].iloc[40]].to_dict("records"),
    "sample_weather": wx[45],
}
res["data"] = desc
json.dump(res, open(OUT, "w"), indent=1, default=str)
print(json.dumps({k: res[k] for k in ("80%", "90%", "95%")}, indent=1, default=str)[:4000])
