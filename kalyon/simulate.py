"""Calibrated synthetic running data for the Kalyon demonstrator.

Everything produced here is SYNTHETIC. The generator encodes the authors'
assumptions about how delay evolves on Indian corridors, informed by the public
observations reported in the research paper (Section 4):

* delay is not constant along a route: it grows on busy single-line sections and
  is partly recovered where the timetable holds slack (O2);
* many trains start late because their origin departure is rescheduled by hours (O3);
* winter fog, monsoon rain, festival rush and random incidents add delay.

Two services (K131, K141) are calibrated so that their mean delay at each station
approximates the 2026 averages shown on RunningStatus.in for trains 15002 and 13037.
Results obtained on this data validate the software pipeline, not real-world accuracy.
"""
from __future__ import annotations

import datetime as dt

import numpy as np

from .network import SPEED, TRAINS, build_timetable

START = dt.date(2025, 11, 1)
DAYS = 365

# Observed 2026 average delays (minutes) from RunningStatus.in train pages, in route order.
OBSERVED = {
    "15002": {"train": "K131", "label": "15002 Ddn–Mfp Express, departing DDN (32 runs)",
              "stations": ["DDN", "HW", "LRJ", "NBD", "MB", "RMU"], "delay": [52, 73, 83, 91, 73, 82]},
    "13037": {"train": "K141", "label": "13037 Hwh–Ddn Kumbha Express, arriving DDN (108 runs)",
              "stations": ["MB", "LRJ", "HW", "DDN"], "delay": [81, 76, 77, 79]},
}


def in_window(d: dt.date, m1, d1, m2, d2):
    a = dt.date(d.year if (d.month, d.day) >= (m1, d1) or m1 <= m2 else d.year - 1, m1, d1)
    b = dt.date(a.year if (m2, d2) >= (m1, d1) else a.year + 1, m2, d2)
    return a <= d <= b


def is_fog_season(d):
    return in_window(d, 12, 10, 2, 10)


def is_festival(d):
    return in_window(d, 10, 15, 11, 15) or in_window(d, 3, 1, 3, 10)


def is_monsoon(d):
    return in_window(d, 7, 1, 9, 20)


def weather(rng):
    """Daily corridor weather: morning visibility (km), rainfall (mm), fog flag."""
    out = []
    for i in range(DAYS + 2):
        d = START + dt.timedelta(days=i)
        fog_season = is_fog_season(d)
        dense = fog_season and rng.random() < 0.55
        if dense:
            vis = float(np.clip(rng.lognormal(np.log(0.35), 0.6), 0.05, 1.5))
        elif fog_season:
            vis = float(rng.uniform(1.5, 5.0))
        else:
            vis = float(rng.uniform(4.0, 10.0))
        if is_monsoon(d):
            rain = float(rng.exponential(18.0)) if rng.random() < 0.5 else 0.0
        else:
            rain = float(rng.exponential(6.0)) if rng.random() < 0.05 else 0.0
        out.append({"date": d.isoformat(), "visibility": round(vis, 2), "rain": round(rain, 1),
                    "fog_season": int(fog_season), "festival": int(is_festival(d))})
    return out


def hour_mult(hour):
    if 6 <= hour < 10 or 17 <= hour < 22:
        return 1.35
    if hour >= 23 or hour < 5:
        return 0.8
    return 1.0


def runs_on(train, d):
    if is_festival(d) and train.kind == "special":
        return True
    return d.weekday() in train.days


def simulate(seed=7, profile_offsets=None):
    """Return (events, runs, weather). Times are minutes since START 00:00."""
    build_timetable()
    rng = np.random.default_rng(seed)
    wx = weather(rng)
    profile_offsets = profile_offsets or {}
    # Fixed per-train, per-leg habits (some trains reliably lose or gain time on some legs).
    habit = {tr.number: rng.normal(0, 2.5, len(tr.stops)) for tr in TRAINS}
    runs, events = [], []
    run_id = 0
    for day in range(DAYS):
        d = START + dt.timedelta(days=day)
        for tr in TRAINS:
            if not runs_on(tr, d):
                continue
            w0 = wx[day]
            base = day * 1440
            fest = 1.3 if w0["festival"] else 1.0
            dense_fog = w0["visibility"] < 1.0
            p_res = {"express": 0.02, "superfast": 0.01, "special": 0.12}[tr.kind]
            mean0 = {"express": 6.0, "superfast": 3.0, "special": 12.0}[tr.kind]
            if tr.profile == "15002":
                p_res, mean0 = 0.05, 24.0
            elif tr.profile == "13037":
                p_res, mean0 = 0.04, 22.0
            p_res *= (2.5 if dense_fog else 1.0) * (1.5 if w0["festival"] else 1.0)
            if rng.random() < p_res:
                resched = float(min(240 + rng.exponential(200.0), 1066))
                delay = resched
            else:
                resched = 0.0
                delay = float(rng.exponential(mean0))
            offs = profile_offsets.get(tr.number, {})
            delay += offs.get(0, 0.0)
            delay = max(delay, 0.0)
            speed = SPEED[tr.kind]
            rec = []
            stops = tr.stops
            rec.append({"seq": 0, "code": stops[0]["code"], "sched_arr": None,
                        "sched_dep": base + stops[0]["dep"], "arr_delay": None, "dep_delay": round(delay, 1)})
            for i in range(1, len(stops)):
                s = stops[i]
                run_min = s["leg_km"] / speed * 60.0
                t_now = base + stops[i - 1]["dep"] + delay
                hour = (t_now % 1440) / 60.0
                wd = wx[min(int(t_now // 1440), len(wx) - 1)]
                cong = s["leg_cong"] * fest * hour_mult(hour)
                capped = min(delay, 300.0)
                change = 0.04 * cong * run_min                                   # routine losses
                change += s["leg_single"] * cong * 0.12 * capped * (s["leg_km"] / 60.0)  # lost crossings when late
                change += (1 - s["leg_single"]) * max(0.0, cong - 0.85) * 0.06 * capped  # path loss near Delhi
                change -= (1 - s["leg_single"]) * 0.05 * min(delay, 120.0)        # make-up time on double line
                night = hour >= 21 or hour < 10
                if wd["visibility"] < 1.0 and night:
                    change += run_min * (1.0 - wd["visibility"]) * 0.55          # fog-safe speed
                if wd["rain"] > 20:
                    change += run_min * 0.06
                if rng.random() < 0.012:
                    change += rng.exponential(45.0)                               # incident
                change += habit[tr.number][i] + offs.get(i, 0.0)
                change += rng.laplace(0, 2.0 + 0.04 * run_min)
                arr_delay = max(delay + change - s["slack"], -15.0)
                dwell = rng.exponential(1.5 * fest) if s["dep"] is not None else 0.0
                dep_delay = max(arr_delay + dwell, 0.0) if s["dep"] is not None else None
                rec.append({"seq": i, "code": s["code"], "sched_arr": base + s["arr"],
                            "sched_dep": None if s["dep"] is None else base + s["dep"],
                            "arr_delay": round(arr_delay, 1),
                            "dep_delay": None if dep_delay is None else round(dep_delay, 1)})
                if dep_delay is not None:
                    delay = dep_delay
            runs.append({"run": run_id, "train": tr.number, "date": d.isoformat(), "day": day,
                         "resched": round(resched, 1)})
            for r in rec:
                r["run"] = run_id
                events.append(r)
            run_id += 1
    return events, runs, wx


def station_means(events, runs, train):
    """Mean delay at each station for a train (departure delay at origin, arrival delay elsewhere)."""
    ids = {r["run"] for r in runs if r["train"] == train}
    acc = {}
    for e in events:
        if e["run"] in ids:
            v = e["dep_delay"] if e["seq"] == 0 else e["arr_delay"]
            acc.setdefault(e["code"], []).append(v)
    return {k: float(np.mean(v)) for k, v in acc.items()}


def calibrate(seed=7, iters=4):
    """Tune per-leg offsets of the two profile trains so station means approach the observations."""
    build_timetable()
    offsets = {}
    for _ in range(iters):
        events, runs, wx = simulate(seed, offsets)
        for prof in OBSERVED.values():
            tr = next(t for t in TRAINS if t.number == prof["train"])
            codes = [s["code"] for s in tr.stops]
            means = station_means(events, runs, tr.number)
            off = offsets.setdefault(tr.number, {})
            obs = dict(zip(prof["stations"], prof["delay"]))
            # Error at each observed station, attributed to the leg that ends there
            # (or to the origin for the first observed station of a departing profile).
            prev_err = 0.0
            for idx, code in enumerate(codes):
                if code not in obs:
                    continue
                err = obs[code] - means[code]
                off[idx] = off.get(idx, 0.0) + (err - prev_err) * 0.9
                prev_err = err
    return offsets
