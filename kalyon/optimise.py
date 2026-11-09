"""Kalyon optimisation engine: from "when will it arrive" to "what should we do".

Given a snapshot of the corridor (every train's position and Kalyon's median ETA
forecasts), the engine builds a time model of the next few hours, finds the
conflicts the forecasts imply, and chooses the order in which trains use each
contested resource so that the priority-weighted sum of arrival delays is as
small as possible.

Resources and rules (the numbers are assumptions for the demonstrator):
* single-line section: two trains in opposite directions cannot be on it at
  the same time; the second may enter CROSS minutes after the first clears;
* any section: trains in the same direction keep a headway and cannot overtake
  between stations (they can overtake at a station, on a loop line);
* station: at most LINES[code] trains can stand at a station at once;
* a train may not leave a halt before its scheduled departure.

Decisions: crossing order and place on single line, precedence and overtaking,
holding times, and (after the times are fixed) platform-line allocation.

This module is the Python reference. The browser runs the same model in
docs/js/optimise.js with an exact branch-and-bound search; tests/opt_parity.mjs
checks that both reach the optimum that HiGHS proves for the MILP below.
"""
from __future__ import annotations

import math

import numpy as np

from .network import SECTIONS

PRIORITY = {"superfast": 1.5, "express": 1.0, "special": 0.7}
PARAMS = {"cross": 3.0, "head_single": 5.0, "head_double": 4.0, "clear": 2.0,
          "prep": 15.0, "turn": 15.0, "min_run": 0.8}
# Lines (platform lines and loops) available to the corridor's coaching trains, assumed.
LINES = {"DDN": 4, "HW": 4, "LRJ": 3, "NBD": 3, "NGM": 2, "DPR": 2, "MB": 4, "RMU": 2, "BE": 4,
         "SPN": 2, "HRI": 2, "LKO": 6, "RK": 3, "MOZ": 2, "MTC": 3, "GZB": 4, "NDLS": 6}
EPS = 1e-6
BIG = 5000.0


def sec(a, b):
    """(km, single, canonical direction +1 if a->b matches the SECTIONS key)."""
    if (a, b) in SECTIONS:
        return SECTIONS[(a, b)][0], SECTIONS[(a, b)][1], 1
    return SECTIONS[(b, a)][0], SECTIONS[(b, a)][1], -1


# --------------------------------------------------------------------------------------------
# Instance
# --------------------------------------------------------------------------------------------
def build_instance(trains, now, params=None, blocks=()):
    """trains: list of dicts with
         id, number, kind, w (priority weight), line (physical route), stops [{code, arr, dep}] (absolute
         scheduled minutes), k (last departed halt, -1 if not yet departed), dep0 (origin departure, actual or
         announced, if k == -1), dep_k (actual departure at k), arr_next (actual arrival at k+1 if already
         arrived, else None), fc (median ETA per halt, None up to k).
       blocks: [{a, b, t1, t2}] engineering blocks on a section (both directions closed).
    """
    P = {**PARAMS, **(params or {})}
    E = {"train": [], "code": [], "type": [], "halt": [], "sched": [], "rel": [], "fixed": [], "base": []}
    arcs, usages, visits, obj = [], [], [], []

    def ev(ti, code, typ, halt, sched, base, rel=-math.inf, fixed=False):
        for kk, v in zip(E, (ti, code, typ, halt, sched, rel, fixed, base)):
            E[kk].append(v)
        return len(E["train"]) - 1

    for ti, tr in enumerate(trains):
        stops, line, k = tr["stops"], tr["line"], tr["k"]
        n = len(stops)
        pos = [line.index(s["code"]) for s in stops]
        if k == -1:
            kk, d0 = 0, tr["dep0"]
            D = ev(ti, stops[0]["code"], "D", 0, None, d0, rel=d0)
            visits.append({"train": ti, "code": stops[0]["code"], "s": D, "os": -P["prep"], "e": D, "oe": 0.0})
        else:
            kk, d0 = k, tr["dep_k"]
            D = ev(ti, stops[k]["code"], "D", k, None, d0, rel=d0, fixed=True)
        prevD = D
        for h in range(kk, n - 1):
            tdep = E["base"][prevD]
            first = h == kk
            if first and k >= 0 and tr.get("arr_next") is not None:
                R, arrived = tr["arr_next"] - tdep, True
            else:
                R = max(tr["fc"][h + 1] - tdep, P["min_run"] * (stops[h + 1]["arr"] - stops[h]["dep"]))
                arrived = False
            seg = line[pos[h]:pos[h + 1] + 1]
            kms = [sec(a, b)[0] for a, b in zip(seg, seg[1:])]
            tot = sum(kms)
            cur, tcur = prevD, tdep
            for idx, (a, b) in enumerate(zip(seg, seg[1:])):
                r = R * kms[idx] / tot
                tcur += r
                last = idx == len(kms) - 1
                # Events on the leg being run now are in the past if their time has gone.
                fixed = first and k >= 0 and (arrived or (tcur <= now and not last))
                A = ev(ti, b, "A", h + 1 if last else -1, stops[h + 1]["arr"] if last else None, tcur,
                       rel=tcur if fixed else -math.inf, fixed=fixed)
                arcs.append((cur, A, r))
                km, single, dirn = sec(a, b)
                usages.append({"train": ti, "a": a, "b": b, "key": (a, b) if dirn == 1 else (b, a),
                               "dir": dirn, "single": single, "d": cur, "A": A})
                if not last:
                    Dp = ev(ti, b, "D", -1, None, tcur, rel=tcur if fixed else -math.inf, fixed=fixed)
                    arcs.append((A, Dp, 0.0))
                    visits.append({"train": ti, "code": b, "s": A, "os": 0.0, "e": Dp, "oe": 0.0})
                    cur = Dp
                elif h + 1 == n - 1:
                    visits.append({"train": ti, "code": b, "s": A, "os": 0.0, "e": A, "oe": P["turn"]})
                    if not fixed:
                        obj.append((A, stops[h + 1]["arr"], tr["w"]))
                else:
                    dwell = stops[h + 1]["dep"] - stops[h + 1]["arr"]
                    Dn = ev(ti, b, "D", h + 1, None, max(tcur + dwell, stops[h + 1]["dep"]), rel=stops[h + 1]["dep"])
                    arcs.append((A, Dn, float(dwell)))
                    visits.append({"train": ti, "code": b, "s": A, "os": 0.0, "e": Dn, "oe": 0.0})
                    if not fixed:
                        obj.append((A, stops[h + 1]["arr"], tr["w"]))
                    prevD = Dn
    nE = len(E["train"])
    # Releases: nothing that has not happened can happen before now.
    for i in range(nE):
        if not E["fixed"][i]:
            E["rel"][i] = max(E["rel"][i], now)
    # Engineering blocks: a pseudo train holding a section in both directions between two fixed times.
    blk = []
    for bi, b in enumerate(blocks):
        s = ev(-1 - bi, b["a"], "B", -1, None, b["t1"], rel=b["t1"], fixed=True)
        e = ev(-1 - bi, b["b"], "B", -1, None, b["t2"], rel=b["t2"], fixed=True)
        key = (b["a"], b["b"]) if (b["a"], b["b"]) in SECTIONS else (b["b"], b["a"])
        blk.append({"key": key, "s": s, "e": e, "i": bi})
    nE = len(E["train"])

    inst = {"E": E, "nE": nE, "arcs": arcs, "usages": usages, "visits": visits, "obj": obj, "now": now,
            "P": P, "blocks": blk, "ntrains": len(trains), "w": [tr["w"] for tr in trains]}
    inst["base"] = propagate(inst, [])
    if inst["base"] is None:
        raise ValueError("base schedule infeasible")

    # Candidate pairs on sections.
    pairs, preexisting = [], []
    by_key = {}
    for ui, u in enumerate(usages):
        by_key.setdefault(u["key"], []).append(ui)
    t = inst["base"]
    for key, lst in by_key.items():
        for x in range(len(lst)):
            for y in range(x + 1, len(lst)):
                u, v = usages[lst[x]], usages[lst[y]]
                if u["train"] == v["train"]:
                    continue
                same = u["dir"] == v["dir"]
                if not same and not u["single"]:
                    continue
                if t[u["d"]] > t[v["d"]] or (t[u["d"]] == t[v["d"]] and u["train"] > v["train"]):
                    lst_u, lst_v = lst[y], lst[x]
                else:
                    lst_u, lst_v = lst[x], lst[y]
                u, v = usages[lst_u], usages[lst_v]
                if E["fixed"][u["d"]] and E["fixed"][v["d"]]:
                    if overlap_pair(inst, t, u, v, same):
                        preexisting.append((lst_u, lst_v))
                    continue
                kind = "same" if same else "opp"
                lag = (P["head_single"] if u["single"] else P["head_double"]) if same else P["cross"]
                pairs.append({"u": lst_u, "v": lst_v, "kind": kind, "lag": lag})
        for b in blk:
            if b["key"] != key:
                continue
            for ui in lst:
                pairs.append({"u": ui, "v": None, "kind": "block", "lag": 0.0, "block": b["i"]})
    inst["pairs"] = pairs
    inst["preexisting"] = preexisting

    # Effective station capacity: never below the number of trains already standing there.
    cap = {}
    for code in set(vv["code"] for vv in visits):
        L = LINES.get(code, 2)
        present = 0
        for vv in visits:
            if vv["code"] == code and E["fixed"][vv["s"]] and t[vv["e"]] + vv["oe"] + P["clear"] > now:
                present += 1
        cap[code] = max(L, present)
    inst["cap"] = cap
    return inst


def overlap_pair(inst, t, u, v, same):
    P = inst["P"]
    if same:
        h = P["head_single"] if u["single"] else P["head_double"]
        ok1 = t[v["d"]] >= t[u["d"]] + h - EPS and t[v["A"]] >= t[u["A"]] + h - EPS
        ok2 = t[u["d"]] >= t[v["d"]] + h - EPS and t[u["A"]] >= t[v["A"]] + h - EPS
    else:
        ok1 = t[v["d"]] >= t[u["A"]] + P["cross"] - EPS
        ok2 = t[u["d"]] >= t[v["A"]] + P["cross"] - EPS
    return not (ok1 or ok2)


def propagate(inst, extra):
    """Earliest event times given the train chains plus extra precedence arcs. None if infeasible."""
    nE = inst["nE"]
    E = inst["E"]
    adj = [[] for _ in range(nE)]
    for u, v, lag in inst["arcs"]:
        adj[u].append((v, lag))
    for u, v, lag in extra:
        adj[u].append((v, lag))
    t = list(E["rel"])
    fixed = E["fixed"]
    limit = inst["now"] + BIG
    queue = list(range(nE))
    inq = [True] * nE
    head = 0
    while head < len(queue):
        u = queue[head]
        head += 1
        inq[u] = False
        tu = t[u]
        for v, lag in adj[u]:
            nv = tu + lag
            if nv > t[v] + EPS:
                if fixed[v] or nv > limit:
                    return None
                t[v] = nv
                if not inq[v]:
                    inq[v] = True
                    queue.append(v)
    return t


def objective(inst, t):
    return sum(w * max(0.0, t[a] - s) for a, s, w in inst["obj"])


def pair_alts(inst, p):
    """Alternative arc sets for a pair: [first-comer goes first, second goes first]."""
    U = inst["usages"]
    u = U[p["u"]]
    if p["kind"] == "block":
        b = inst["blocks"][p["block"]]
        return [[(u["A"], b["s"], 0.0)], [(b["e"], u["d"], 0.0)]]
    v = U[p["v"]]
    if p["kind"] == "opp":
        return [[(u["A"], v["d"], p["lag"])], [(v["A"], u["d"], p["lag"])]]
    return [[(u["d"], v["d"], p["lag"]), (u["A"], v["A"], p["lag"])],
            [(v["d"], u["d"], p["lag"]), (v["A"], u["A"], p["lag"])]]


def pair_ok(inst, t, p, alt):
    return all(t[b] >= t[a] + lag - EPS for a, b, lag in pair_alts(inst, p)[alt])


def conflicts(inst, t):
    """Every violated conflict at times t, earliest first."""
    out = []
    U = inst["usages"]
    for pi, p in enumerate(inst["pairs"]):
        if pair_ok(inst, t, p, 0) or pair_ok(inst, t, p, 1):
            continue
        u = U[p["u"]]
        if p["kind"] == "block":
            b = inst["blocks"][p["block"]]
            start = min(t[u["d"]], t[b["s"]])
        else:
            start = min(t[u["d"]], t[U[p["v"]]["d"]])
        out.append({"kind": "pair", "pair": pi, "start": start})
    out.extend(station_conflicts(inst, t))
    out.sort(key=lambda c: (c["start"], 0 if c["kind"] == "pair" else 1, c.get("pair", 0)))
    return out


def station_conflicts(inst, t):
    P, E = inst["P"], inst["E"]
    by = {}
    for vi, v in enumerate(inst["visits"]):
        by.setdefault(v["code"], []).append(vi)
    out = []
    for code, lst in by.items():
        L = inst["cap"][code]
        if len(lst) <= L:
            continue
        iv = sorted(((t[inst["visits"][vi]["s"]] + inst["visits"][vi]["os"],
                      t[inst["visits"][vi]["e"]] + inst["visits"][vi]["oe"] + P["clear"], vi) for vi in lst))
        active = []
        for lo, hi, vi in iv:
            active = [a for a in active if a[1] > lo + EPS]
            if len(active) >= L:
                S = active + [(lo, hi, vi)]
                out.append({"kind": "station", "code": code, "set": [s[2] for s in S], "start": lo})
                break
            active.append((lo, hi, vi))
    return out


def station_alts(inst, t, c):
    """Arcs 'j arrives after i has left', for j whose arrival is not fixed; cheapest push first."""
    P, E, V = inst["P"], inst["E"], inst["visits"]
    S = c["set"]
    alts = []
    for j in S:
        vj = V[j]
        if E["fixed"][vj["s"]]:
            continue
        for i in S:
            if i == j:
                continue
            vi = V[i]
            push = (t[vi["e"]] + vi["oe"] + P["clear"]) - (t[vj["s"]] + vj["os"])
            newcomer = 0 if j == S[-1] else 1
            alts.append((newcomer, push, i, j, [(vi["e"], vj["s"], vi["oe"] + P["clear"] - vj["os"])]))
    alts.sort(key=lambda a: (a[0], a[1], a[2], a[3]))
    return alts


# --------------------------------------------------------------------------------------------
# Decision features for the AI dispatcher (mirrored in docs/js/optimise.js)
# --------------------------------------------------------------------------------------------
FEATS = ["kind", "w_first", "w_second", "w_diff", "gap", "occ_first", "occ_second",
         "late_first", "late_second", "cost_first_waits", "cost_second_waits", "cost_diff",
         "down_first", "down_second", "nconf_first", "nconf_second", "hour", "single"]


def hold_cost(inst, t, ti, from_event, delta):
    """Weighted delay added if train ti is pushed by delta from event from_event onwards (no recovery)."""
    if delta <= 0:
        return 0.0
    c = 0.0
    for a, s, w in inst["obj"]:
        if inst["E"]["train"][a] == ti and a >= from_event:
            c += w * (max(0.0, t[a] + delta - s) - max(0.0, t[a] - s))
    return c


def pair_features(inst, t, p, nconf=None):
    U, E = inst["usages"], inst["E"]
    u = U[p["u"]]
    ti = u["train"]
    wi = inst["w"][ti]
    if p["kind"] == "block":
        b = inst["blocks"][p["block"]]
        need_first = t[u["A"]] - t[b["s"]]  # how far the train would have to be ahead
        need_second = t[b["e"]] - t[u["d"]]
        vals = {"kind": 3, "w_first": wi, "w_second": 0.0, "gap": t[b["s"]] - t[u["d"]],
                "occ_first": t[u["A"]] - t[u["d"]], "occ_second": t[b["e"]] - t[b["s"]],
                "late_first": late(inst, t, ti, u["A"]), "late_second": 0.0,
                "cost_first_waits": hold_cost(inst, t, ti, u["A"], need_second), "cost_second_waits": 0.0,
                "down_first": downstream(inst, ti, u["A"]), "down_second": 0.0}
    else:
        v = U[p["v"]]
        tj = v["train"]
        wj = inst["w"][tj]
        if p["kind"] == "opp":
            need_u = t[v["A"]] + p["lag"] - t[u["d"]]   # first-comer waits for the other to clear
            need_v = t[u["A"]] + p["lag"] - t[v["d"]]
        else:
            need_u = max(t[v["d"]] + p["lag"] - t[u["d"]], t[v["A"]] + p["lag"] - t[u["A"]])
            need_v = max(t[u["d"]] + p["lag"] - t[v["d"]], t[u["A"]] + p["lag"] - t[v["A"]])
        vals = {"kind": 0 if p["kind"] == "opp" else 1, "w_first": wi, "w_second": wj,
                "gap": t[v["d"]] - t[u["d"]], "occ_first": t[u["A"]] - t[u["d"]], "occ_second": t[v["A"]] - t[v["d"]],
                "late_first": late(inst, t, ti, u["A"]), "late_second": late(inst, t, tj, v["A"]),
                "cost_first_waits": hold_cost(inst, t, ti, u["A"], need_u),
                "cost_second_waits": hold_cost(inst, t, tj, v["A"], need_v),
                "down_first": downstream(inst, ti, u["A"]), "down_second": downstream(inst, tj, v["A"])}
    vals["w_diff"] = vals["w_first"] - vals["w_second"]
    vals["cost_diff"] = vals["cost_second_waits"] - vals["cost_first_waits"]
    nconf = nconf or {}
    vals["nconf_first"] = nconf.get(u["train"], 0)
    vals["nconf_second"] = nconf.get(U[p["v"]]["train"], 0) if p["v"] is not None else 0
    vals["hour"] = ((t[u["d"]] % 1440) + 1440) % 1440 / 60.0
    vals["single"] = u["single"]
    return [float(vals[f]) for f in FEATS]


def late(inst, t, ti, from_event):
    for a, s, w in inst["obj"]:
        if inst["E"]["train"][a] == ti and a >= from_event:
            return t[a] - s
    return 0.0


def downstream(inst, ti, from_event):
    return float(sum(w for a, s, w in inst["obj"] if inst["E"]["train"][a] == ti and a >= from_event))


def conflict_counts(inst, t, confs):
    cnt = {}
    U = inst["usages"]
    for c in confs:
        if c["kind"] != "pair":
            continue
        p = inst["pairs"][c["pair"]]
        for ui in (p["u"], p["v"]):
            if ui is not None:
                cnt[U[ui]["train"]] = cnt.get(U[ui]["train"], 0) + 1
    return cnt


# --------------------------------------------------------------------------------------------
# Dispatching rules (greedy) and the exact MILP
# --------------------------------------------------------------------------------------------
def greedy(inst, rule="fcfs", model=None, max_steps=600):
    """Resolve conflicts one at a time, earliest first. rule: fcfs | priority | ai."""
    extra = []
    t = inst["base"]
    decisions = []
    for _ in range(max_steps):
        confs = conflicts(inst, t)
        if not confs:
            return {"t": t, "obj": objective(inst, t), "extra": extra, "decisions": decisions}
        c = confs[0]
        if c["kind"] == "pair":
            p = inst["pairs"][c["pair"]]
            alts = pair_alts(inst, p)
            if rule == "fcfs":
                order = [0, 1]
            elif rule == "priority":
                if p["kind"] == "block":
                    order = [0, 1]
                else:
                    wu = inst["w"][inst["usages"][p["u"]]["train"]]
                    wv = inst["w"][inst["usages"][p["v"]]["train"]]
                    order = [1, 0] if wv > wu + EPS else [0, 1]
            else:
                f = pair_features(inst, t, p, conflict_counts(inst, t, confs))
                prob = model(f)
                order = [0, 1] if prob >= 0.5 else [1, 0]
            done = False
            for a in order:
                nt = propagate(inst, extra + alts[a])
                if nt is not None:
                    extra = extra + alts[a]
                    t = nt
                    decisions.append((c["pair"], a))
                    done = True
                    break
            if not done:
                return None
        else:
            done = False
            for alt in station_alts(inst, t, c):
                nt = propagate(inst, extra + alt[4])
                if nt is not None:
                    extra = extra + alt[4]
                    t = nt
                    done = True
                    break
            if not done:
                return None
    return None


def milp(inst, time_limit=30.0, window=240.0):
    """Exact optimum with HiGHS (scipy.optimize.milp). Station-line constraints are modelled with line
    assignment for visit pairs whose base times are within `window`; the solution is then checked against
    every constraint, so a returned optimum is the optimum of the full problem."""
    from scipy.optimize import Bounds, LinearConstraint, milp as smilp
    from scipy.sparse import lil_matrix

    E, P, nE = inst["E"], inst["P"], inst["nE"]
    base = inst["base"]
    obj = inst["obj"]
    nO = len(obj)
    pairs = inst["pairs"]
    nY = len(pairs)
    # Station assignment variables only where more visits than lines exist.
    V = inst["visits"]
    by = {}
    for vi, v in enumerate(V):
        by.setdefault(v["code"], []).append(vi)
    xs, os_ = {}, []
    nv = nE + nO + nY
    for code, lst in by.items():
        L = inst["cap"][code]
        if len(lst) <= L:
            continue
        for vi in lst:
            for l in range(L):
                xs[(vi, l)] = nv
                nv += 1
        for a in range(len(lst)):
            for b in range(a + 1, len(lst)):
                ia, ib = lst[a], lst[b]
                va, vb = V[ia], V[ib]
                if abs(base[va["s"]] - base[vb["s"]]) > window:
                    continue
                os_.append((ia, ib, code, nv))
                nv += 1
    cons = []

    def add(coefs, lb, ub):
        cons.append((coefs, lb, ub))

    for u, v, lag in inst["arcs"]:
        add({v: 1.0, u: -1.0}, lag, np.inf)
    now = inst["now"]
    for oi, (a, s, w) in enumerate(obj):
        add({nE + oi: 1.0, a: -1.0}, -(s - now), np.inf)
    M = 3 * BIG
    for yi, p in enumerate(pairs):
        y = nE + nO + yi
        alts = pair_alts(inst, p)
        for a, b, lag in alts[0]:  # y = 1: alt 0
            add({b: 1.0, a: -1.0, y: -M}, lag - M, np.inf)
        for a, b, lag in alts[1]:  # y = 0: alt 1
            add({b: 1.0, a: -1.0, y: M}, lag, np.inf)
    for code, lst in by.items():
        L = inst["cap"][code]
        if len(lst) <= L:
            continue
        for vi in lst:
            add({xs[(vi, l)]: 1.0 for l in range(L)}, 1.0, 1.0)
        # symmetry breaking: the first visit uses line 0
        add({xs[(lst[0], 0)]: 1.0}, 1.0, 1.0)
    for ia, ib, code, o in os_:
        L = inst["cap"][code]
        va, vb = V[ia], V[ib]
        for l in range(L):
            xa, xb = xs[(ia, l)], xs[(ib, l)]
            # o = 1: b arrives after a leaves; o = 0: a arrives after b leaves (when both on line l)
            c1 = {vb["s"]: 1.0, va["e"]: -1.0, o: -M, xa: -M, xb: -M}
            add(c1, va["oe"] + P["clear"] - vb["os"] - 3 * M, np.inf)
            c2 = {va["s"]: 1.0, vb["e"]: -1.0, o: M, xa: -M, xb: -M}
            add(c2, vb["oe"] + P["clear"] - va["os"] - 2 * M, np.inf)
    A = lil_matrix((len(cons), nv))
    lb = np.empty(len(cons))
    ub = np.empty(len(cons))
    for r, (coefs, l_, u_) in enumerate(cons):
        for j, c in coefs.items():
            A[r, j] += c
        lb[r], ub[r] = l_, u_
    c = np.zeros(nv)
    for oi, (a, s, w) in enumerate(obj):
        c[nE + oi] = w
    # tiny tie-break: prefer earlier times (no needless holding)
    for i in range(nE):
        if not E["fixed"][i]:
            c[i] += 1e-6
    lbv = np.full(nv, -np.inf)
    ubv = np.full(nv, np.inf)
    for i in range(nE):  # times are shifted by `now` for numerical stability
        lbv[i] = E["rel"][i] - now
        ubv[i] = E["rel"][i] - now if E["fixed"][i] else BIG
    lbv[nE:nE + nO] = 0
    integ = np.zeros(nv)
    integ[nE + nO:] = 1
    lbv[nE + nO:] = 0
    ubv[nE + nO:] = 1
    res = smilp(c, constraints=LinearConstraint(A.tocsr(), lb, ub), integrality=integ,
                bounds=Bounds(lbv, ubv), options={"time_limit": time_limit, "disp": False})
    if res.x is None:
        return None
    x = res.x
    # Re-time exactly from the chosen orders (removes solver tolerance) and check feasibility.
    extra = []
    for yi, p in enumerate(pairs):
        extra += pair_alts(inst, p)[0 if x[nE + nO + yi] > 0.5 else 1]
    for ia, ib, code, o in os_:
        L = inst["cap"][code]
        la = next(l for l in range(L) if x[xs[(ia, l)]] > 0.5)
        lb_ = next(l for l in range(L) if x[xs[(ib, l)]] > 0.5)
        if la != lb_:
            continue
        va, vb = V[ia], V[ib]
        if x[o] > 0.5:
            extra.append((va["e"], vb["s"], va["oe"] + P["clear"] - vb["os"]))
        else:
            extra.append((vb["e"], va["s"], vb["oe"] + P["clear"] - va["os"]))
    t2 = propagate(inst, extra)
    if t2 is None:
        return None
    ok = not conflicts(inst, t2)
    return {"t": t2, "obj": objective(inst, t2), "status": int(res.status), "optimal": res.status == 0,
            "verified": ok, "orders": [int(x[nE + nO + yi] > 0.5) for yi in range(nY)], "mip_obj": float(res.fun)}
