"""Kalyon forecasting API (FastAPI).

Serves dynamic ETA forecasts from the trained LightGBM models over REST and a
WebSocket stream, as specified in Section 6 of the research paper.

    uvicorn api.main:app --reload        # from the repository root
    open http://127.0.0.1:8000/docs      # interactive API documentation

Data mode: REPLAY of synthetic runs (docs/data/replays.json). This is not live
railway tracking. A live adapter would feed authorised NTES/RTIS running events
into the same `forecast()` function.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import math
import os

import lightgbm as lgb
import numpy as np
from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")


def _load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


MODEL_META = _load("model.json")
FEATURES = MODEL_META["features"]
SCALE = MODEL_META["interval_scale"]
BOOSTERS = {k: lgb.Booster(model_file=os.path.join(ROOT, "models", f"{k}.txt")) for k in ("m1", "q10", "q50", "q90")}
TRAINS = {t["number"]: t for t in _load("trains.json")["trains"]}
REPLAYS_FILE = _load("replays.json")
REPLAYS = {r["id"]: r for r in REPLAYS_FILE["replays"]}
START = dt.date.fromisoformat(REPLAYS_FILE["start_date"])
STATIONS = {s["code"]: s for s in _load("network.json")["stations"]}
TYPE = {"express": 0, "superfast": 1, "special": 2}

app = FastAPI(title="Kalyon ETA API", version="1.0",
              description="Dynamic, uncertainty-aware ETA forecasts for coaching trains (replay of synthetic data).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def hhmm(abs_min: float) -> str:
    day = int(abs_min // 1440)
    m = abs_min - day * 1440
    d = START + dt.timedelta(days=day)
    return f"{d.isoformat()} {int(m // 60):02d}:{int(m % 60):02d}"


def features(train, k, s, dep_delays, resched, report_abs, weather, overrides=None):
    p = train["pairs"][f"{k}-{s}"]
    d = START + dt.timedelta(days=int(report_abs // 1440))
    dk = dep_delays[k]
    v = {
        "cur_delay": dk, "dchg1": dk - dep_delays[k - 1] if k >= 1 else 0.0,
        "dchg3": dk - dep_delays[max(k - 3, 0)], "resched": resched,
        "n_rem": p[0], "dist_rem": p[1], "sched_rem": p[2], "slack_rem": p[3], "single_frac": p[4], "cong_rem": p[5],
        "hist_chg": math.nan if p[6] is None else p[6],
        "hour": (report_abs % 1440) / 60.0, "dow": d.weekday(), "month": d.month,
        "fog_season": weather["fog_season"], "visibility": weather["visibility"], "rain": weather["rain"],
        "festival": weather["festival"], "train_type": TYPE[train["kind"]],
    }
    v.update(overrides or {})
    return [v[f] for f in FEATURES]


def forecast(train, k, dep_delays, resched, sched_dep_k_abs, sched_arr_abs, weather, overrides=None, explain=False):
    """Median ETA, 80% interval and constant-delay estimate for every stop after k."""
    rows = list(range(k + 1, len(train["stops"])))
    dk = dep_delays[k] if not overrides or "cur_delay" not in overrides else overrides["cur_delay"]
    report = sched_dep_k_abs + dk
    X = np.array([features(train, k, s, dep_delays, resched, report, weather, overrides) for s in rows], dtype=float)
    pr = {name: b.predict(X) for name, b in BOOSTERS.items()}
    contrib = BOOSTERS["q50"].predict(X, pred_contrib=True) if explain else None
    out, prev_med, prev_m1 = [], -math.inf, -math.inf
    for i, s in enumerate(rows):
        p = train["pairs"][f"{k}-{s}"]
        sa = sched_arr_abs(s)
        b1 = sa + dk
        floor = report + 0.8 * (p[2] - p[3])
        q10, q50, q90 = pr["q10"][i], pr["q50"][i], pr["q90"][i]
        med = max(b1 + q50, floor, prev_med)
        m1 = max(b1 + pr["m1"][i], floor, prev_m1)
        prev_med, prev_m1 = med, m1
        lo = min(max(b1 + q50 - SCALE * (q50 - q10), report), med)
        hi = max(b1 + q50 + SCALE * (q90 - q50), med)
        code = train["stops"][s]["code"]
        row = {"stop": code, "station": STATIONS[code]["name"], "scheduled": hhmm(sa),
               "constant_delay_eta": hhmm(b1), "kalyon_eta": hhmm(med), "earliest_likely": hhmm(lo),
               "latest_likely": hhmm(hi), "minutes_vs_constant_delay": round(med - b1, 1)}
        if explain:
            c = contrib[i][:-1]
            top = sorted(zip(FEATURES, c), key=lambda t: -abs(t[1]))[:3]
            row["top_factors"] = [{"feature": MODEL_META["labels"][f], "minutes": round(float(v), 1)} for f, v in top]
        out.append(row)
    return out


def replay_or_404(replay):
    if replay not in REPLAYS:
        raise HTTPException(404, f"Unknown replay '{replay}'. Use one of: {', '.join(REPLAYS)}")
    return REPLAYS[replay]


def run_state(rep, run, t):
    """Last stop departed by replay minute t, or None if the run has not started or has finished."""
    k = None
    for i, e in enumerate(run["ev"]):
        if e[2] is not None and e[2] + e[4] <= t:
            k = i
    last = run["ev"][-1]
    if k is None or last[1] + last[3] <= t:
        return None
    return k


def run_forecast(rep, run, k, explain=False):
    train = TRAINS[run["train"]]
    w0 = rep["t0_day"] * 1440 + 240
    dep = [e[4] for e in run["ev"]]
    report_abs = w0 + run["ev"][k][2] + dep[k]
    weather = rep["weather"][str(int(report_abs // 1440) - rep["t0_day"])]
    return forecast(train, k, dep, run["resched"], w0 + run["ev"][k][2], lambda s: w0 + run["ev"][s][1], weather,
                    explain=explain)


@app.get("/")
def root():
    return {"name": "Kalyon (काल + नियोजन)", "mode": "replay of synthetic data — not live railway tracking",
            "replays": {k: {"title": v["title"], "date": v["date"], "note": v["note"]} for k, v in REPLAYS.items()},
            "endpoints": ["/trains", "/trains/{number}/eta", "/stations/{code}/board", "/scenario", "/metrics", "/stream (WebSocket)"]}


@app.get("/trains")
def trains():
    return [{"number": t["number"], "name": t["name"], "name_hi": t["name_hi"], "kind": t["kind"],
             "from": t["stops"][0]["code"], "to": t["stops"][-1]["code"], "held_out": t["held_out"]} for t in TRAINS.values()]


@app.get("/trains/{number}/eta")
def train_eta(number: str, replay: str = "typical", t: float = Query(720, description="Replay minute after 04:00")):
    rep = replay_or_404(replay)
    for run in rep["runs"]:
        if run["train"] == number:
            k = run_state(rep, run, t)
            if k is None:
                continue
            return {"train": number, "replay": replay, "last_report": TRAINS[number]["stops"][k]["code"],
                    "current_delay_min": run["ev"][k][4], "forecasts": run_forecast(rep, run, k, explain=True)}
    raise HTTPException(404, f"Train {number} is not running at minute {t} of replay '{replay}'.")


@app.get("/stations/{code}/board")
def station_board(code: str, replay: str = "typical", t: float = 720):
    rep = replay_or_404(replay)
    if code not in STATIONS:
        raise HTTPException(404, f"Unknown station code '{code}'.")
    rows = []
    for run in rep["runs"]:
        k = run_state(rep, run, t)
        if k is None:
            continue
        for f in run_forecast(rep, run, k):
            if f["stop"] == code:
                rows.append({"train": run["train"], "name": TRAINS[run["train"]]["name"], **f})
    return {"station": STATIONS[code]["name"], "station_hi": STATIONS[code]["name_hi"], "arrivals": sorted(rows, key=lambda r: r["kalyon_eta"])}


class Scenario(BaseModel):
    train: str = "K131"
    stop_index: int = 1
    current_delay: float = 60
    rescheduled_min: float = 0
    visibility_km: float = 6
    rain_mm: float = 0
    festival: int = 0
    hour: float | None = None
    month: int = 1


@app.post("/scenario")
def scenario(sc: Scenario):
    train = TRAINS.get(sc.train) or (_ for _ in ()).throw(HTTPException(404, "Unknown train"))
    if not 0 <= sc.stop_index < len(train["stops"]) - 1:
        raise HTTPException(422, "stop_index must be a stop the train departs from.")
    k = sc.stop_index
    dep = [sc.current_delay] * (k + 1)
    sched_dep = train["stops"][k]["dep"]
    hour = sc.hour if sc.hour is not None else ((sched_dep + sc.current_delay) % 1440) / 60
    weather = {"fog_season": int(sc.month in (12, 1, 2)), "visibility": sc.visibility_km, "rain": sc.rain_mm, "festival": sc.festival}
    over = {"hour": hour, "month": sc.month, "resched": sc.rescheduled_min}
    return {"train": sc.train, "from_stop": train["stops"][k]["code"],
            "forecasts": forecast(train, k, dep, sc.rescheduled_min, sched_dep, lambda s: train["stops"][s]["arr"], weather, over, explain=True)}


@app.get("/metrics")
def metrics():
    return _load("metrics.json")


@app.websocket("/stream")
async def stream(ws: WebSocket, replay: str = "typical", speed: float = 600):
    """Pushes every running report in the replay with fresh forecasts. speed = replay minutes per real minute."""
    await ws.accept()
    rep = REPLAYS.get(replay)
    if rep is None:
        await ws.send_json({"error": f"Unknown replay '{replay}'."})
        await ws.close()
        return
    reports = sorted(((e[2] + e[4], ri, i) for ri, run in enumerate(rep["runs"]) for i, e in enumerate(run["ev"]) if e[2] is not None),
                     key=lambda x: x[0])
    t_prev = 0.0
    for t, ri, k in reports:
        if t < 0 or t > 1440:
            continue
        await asyncio.sleep(max(0.0, (t - t_prev) / speed * 60.0))
        t_prev = t
        run = rep["runs"][ri]
        await ws.send_json({"replay_minute": round(t, 1), "train": run["train"], "departed": TRAINS[run["train"]]["stops"][k]["code"],
                            "delay_min": run["ev"][k][4], "forecasts": run_forecast(rep, run, k)})
    await ws.close()
