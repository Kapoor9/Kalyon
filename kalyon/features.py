"""Feature construction for dynamic ETA forecasting.

A forecast is issued when a train departs stop k (a running-status report) for
every downstream stop s > k. The target is the residual of the constant-delay
estimate:  residual = arrival_delay(s) - departure_delay(k).

The browser demonstrator (docs/js/engine.js) rebuilds exactly the same features,
so this module is the single definition of each one.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from .network import TRAINS, TYPE_CODE
from .simulate import START

FEATURES = [
    "cur_delay",      # departure delay at the reporting stop, minutes
    "dchg1",          # change in delay since the previous stop
    "dchg3",          # change in delay over the last three stops
    "resched",        # origin rescheduling, minutes (0 if none)
    "n_rem",          # stops remaining to the target stop
    "dist_rem",       # km remaining
    "sched_rem",      # scheduled minutes remaining
    "slack_rem",      # scheduled recovery allowance remaining, minutes
    "single_frac",    # share of remaining km on single line
    "cong_rem",       # mean congestion weight of remaining sections
    "hour",           # actual time of day at the report, hours
    "dow",            # day of week, Monday = 0
    "month",          # 1-12
    "fog_season",     # 1 between 10 Dec and 10 Feb
    "visibility",     # morning visibility, km
    "rain",           # rainfall, mm
    "festival",       # 1 during festival travel periods
    "train_type",     # 0 express, 1 superfast, 2 special
    "hist_chg",       # historical median of the same residual for this train, k and s (training period only)
]

LABELS = {
    "cur_delay": "Current delay", "dchg1": "Delay trend since last stop", "dchg3": "Delay trend over last 3 stops",
    "resched": "Origin rescheduling", "n_rem": "Stops remaining", "dist_rem": "Distance remaining",
    "sched_rem": "Scheduled time remaining", "slack_rem": "Recovery time in timetable",
    "single_frac": "Single-line share ahead", "cong_rem": "Congestion ahead", "hour": "Time of day",
    "dow": "Day of week", "month": "Month", "fog_season": "Fog season", "visibility": "Visibility",
    "rain": "Rainfall", "festival": "Festival rush", "train_type": "Train type",
    "hist_chg": "This train's history on this stretch",
}


def static_pairs():
    """Per (train, k, s) route quantities that depend only on the timetable."""
    out = {}
    for tr in TRAINS:
        st = tr.stops
        for k in range(len(st) - 1):
            for s in range(k + 1, len(st)):
                legs = st[k + 1:s + 1]
                km = sum(l["leg_km"] for l in legs)
                out[(tr.number, k, s)] = {
                    "n_rem": s - k,
                    "dist_rem": round(km, 1),
                    "sched_rem": st[s]["arr"] - st[k]["dep"],
                    "slack_rem": round(sum(l["slack"] for l in legs), 2),
                    "single_frac": round(sum(l["leg_single"] * l["leg_km"] for l in legs) / km, 4),
                    "cong_rem": round(sum(l["leg_cong"] * l["leg_km"] for l in legs) / km, 4),
                }
    return out


def pair_rows(events, runs, wx):
    """One row per (run, report stop k, target stop s) with raw quantities and target."""
    pairs = static_pairs()
    ttype = {t.number: TYPE_CODE[t.kind] for t in TRAINS}
    by_run = {}
    for e in events:
        by_run.setdefault(e["run"], []).append(e)
    rows = []
    for r in runs:
        ev = sorted(by_run[r["run"]], key=lambda e: e["seq"])
        dep = [e["dep_delay"] for e in ev]
        n = len(ev)
        for k in range(n - 1):
            dk = dep[k]
            t_rep = ev[k]["sched_dep"] + dk
            day = int(t_rep // 1440)
            date = START + dt.timedelta(days=day)
            w = wx[min(day, len(wx) - 1)]
            base = {
                "run": r["run"], "train": r["train"], "day": r["day"], "k": k,
                "cur_delay": dk,
                "dchg1": dk - dep[k - 1] if k >= 1 else 0.0,
                "dchg3": dk - dep[max(k - 3, 0)],
                "resched": r["resched"],
                "hour": (t_rep % 1440) / 60.0,
                "dow": date.weekday(), "month": date.month,
                "fog_season": w["fog_season"], "visibility": w["visibility"], "rain": w["rain"],
                "festival": w["festival"], "train_type": ttype[r["train"]],
            }
            for s in range(k + 1, n):
                row = dict(base)
                row.update(pairs[(r["train"], k, s)])
                row["s"] = s
                row["station"] = ev[s]["code"]
                row["sched_arr"] = ev[s]["sched_arr"]
                row["arr_delay"] = ev[s]["arr_delay"]
                row["is_terminal"] = int(s == n - 1)
                row["residual"] = ev[s]["arr_delay"] - dk
                rows.append(row)
    return pd.DataFrame(rows)


def add_history(df: pd.DataFrame, train_mask: pd.Series):
    """hist_chg and B2's mean arrival delay, computed from training rows only (no leakage)."""
    tr = df[train_mask]
    med = tr.groupby(["train", "k", "s"])["residual"].median().rename("hist_chg")
    df = df.drop(columns=["hist_chg"], errors="ignore").join(med, on=["train", "k", "s"])
    mean_arr = tr.drop_duplicates(["run", "s"]).groupby(["train", "s"])["arr_delay"].mean().rename("hist_arr")
    df = df.drop(columns=["hist_arr"], errors="ignore").join(mean_arr, on=["train", "s"])
    return df, med, mean_arr
