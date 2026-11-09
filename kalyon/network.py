"""Corridor network and synthetic timetable for the Kalyon demonstrator.

The network models the Dehradun corridor of Northern Railway: Dehradun -> Lucknow
via Laksar and Moradabad, and Laksar -> New Delhi via Roorkee and Meerut.
Station coordinates and distances are approximate. Train services are SYNTHETIC:
their names, numbers and timetables are invented for the demonstrator and are not
Indian Railways services. Two services are calibrated to delay profiles observed
on RunningStatus.in for trains 15002 and 13037 (see kalyon/simulate.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field

# code: (English name, Hindi name, lat, lon, major?)
STATIONS = {
    "DDN": ("Dehradun", "देहरादून", 30.3165, 78.0322, True),
    "HW": ("Haridwar", "हरिद्वार", 29.9457, 78.1642, True),
    "LRJ": ("Laksar", "लक्सर", 29.7580, 78.0400, False),
    "NBD": ("Najibabad", "नजीबाबाद", 29.6120, 78.3430, False),
    "NGM": ("Nagina", "नगीना", 29.4440, 78.4330, False),
    "DPR": ("Dhampur", "धामपुर", 29.3090, 78.5110, False),
    "MB": ("Moradabad", "मुरादाबाद", 28.8390, 78.7730, True),
    "RMU": ("Rampur", "रामपुर", 28.8090, 79.0260, False),
    "BE": ("Bareilly", "बरेली", 28.3670, 79.4320, True),
    "SPN": ("Shahjahanpur", "शाहजहाँपुर", 27.8830, 79.9110, False),
    "HRI": ("Hardoi", "हरदोई", 27.3960, 80.1310, False),
    "LKO": ("Lucknow", "लखनऊ", 26.8310, 80.9190, True),
    "RK": ("Roorkee", "रुड़की", 29.8660, 77.8890, True),
    "MOZ": ("Muzaffarnagar", "मुज़फ़्फ़रनगर", 29.4720, 77.7030, False),
    "MTC": ("Meerut City", "मेरठ सिटी", 28.9840, 77.7060, True),
    "GZB": ("Ghaziabad", "ग़ाज़ियाबाद", 28.6680, 77.4320, True),
    "NDLS": ("New Delhi", "नई दिल्ली", 28.6430, 77.2190, True),
}

# Undirected sections between adjacent stations: (a, b): (km, single_line, congestion_weight)
SECTIONS = {
    ("DDN", "HW"): (52, 1, 0.6),
    ("HW", "LRJ"): (27, 1, 0.5),
    ("LRJ", "NBD"): (44, 1, 0.8),
    ("NBD", "NGM"): (24, 1, 0.5),
    ("NGM", "DPR"): (18, 1, 0.5),
    ("DPR", "MB"): (61, 1, 0.6),
    ("MB", "RMU"): (27, 0, 0.8),
    ("RMU", "BE"): (69, 0, 0.8),
    ("BE", "SPN"): (72, 0, 0.9),
    ("SPN", "HRI"): (63, 0, 0.8),
    ("HRI", "LKO"): (100, 0, 0.9),
    ("LRJ", "RK"): (24, 0, 0.6),
    ("RK", "MOZ"): (60, 0, 0.7),
    ("MOZ", "MTC"): (56, 0, 0.9),
    ("MTC", "GZB"): (47, 0, 1.0),
    ("GZB", "NDLS"): (25, 0, 1.2),
}

LINE_A = ["DDN", "HW", "LRJ", "NBD", "NGM", "DPR", "MB", "RMU", "BE", "SPN", "HRI", "LKO"]
LINE_B = ["DDN", "HW", "LRJ", "RK", "MOZ", "MTC", "GZB", "NDLS"]

TYPE_CODE = {"express": 0, "superfast": 1, "special": 2}
SPEED = {"express": 55.0, "superfast": 70.0, "special": 48.0}  # average running speed, km/h
TERMINAL_ALLOWANCE = {"express": 15, "superfast": 10, "special": 20}  # minutes of slack before the terminal


def section(a: str, b: str):
    return SECTIONS.get((a, b)) or SECTIONS[(b, a)]


@dataclass
class Train:
    number: str
    name: str
    name_hi: str
    kind: str
    line: list  # full ordered station list of the route travelled
    halts: list  # stations where the train stops (subset of line, same order)
    depart: int  # origin departure, minutes after midnight
    days: tuple = (0, 1, 2, 3, 4, 5, 6)  # Mon=0
    profile: str | None = None  # calibration profile name
    note: str = ""
    stops: list = field(default_factory=list)  # filled by build_timetable

    def to_json(self):
        return {
            "number": self.number, "name": self.name, "name_hi": self.name_hi,
            "kind": self.kind, "days": list(self.days), "profile": self.profile,
            "note": self.note, "stops": self.stops, "route": self.line,
        }


def _route(line, origin, dest):
    i, j = line.index(origin), line.index(dest)
    return line[i:j + 1] if i < j else list(reversed(line[j:i + 1]))


def _t(number, name, name_hi, kind, line, origin, dest, halts, dep, **kw):
    route = _route(line, origin, dest)
    halts = [s for s in route if s in halts]
    return Train(number, name, name_hi, kind, route, halts, dep, **kw)


MAJOR_A = ["DDN", "HW", "LRJ", "NBD", "MB", "BE", "LKO"]
ALL_A = LINE_A
MAJOR_B = ["DDN", "HW", "RK", "MOZ", "MTC", "GZB", "NDLS"]
ALL_B = LINE_B
SPECIAL_DAYS_1 = (1, 4)  # Tue, Fri
SPECIAL_DAYS_2 = (0, 3)  # Mon, Thu

TRAINS = [
    _t("K101", "Doon–Lucknow Express", "दून–लखनऊ एक्सप्रेस", "express", LINE_A, "DDN", "LKO", ALL_A, 20 * 60 + 30),
    _t("K102", "Lucknow–Doon Express", "लखनऊ–दून एक्सप्रेस", "express", LINE_A, "LKO", "DDN", ALL_A, 21 * 60 + 10),
    _t("K111", "Doon Chair Car Superfast", "दून चेयर कार सुपरफास्ट", "superfast", LINE_B, "DDN", "NDLS", MAJOR_B, 5 * 60),
    _t("K112", "Delhi–Doon Chair Car Superfast", "दिल्ली–दून चेयर कार सुपरफास्ट", "superfast", LINE_B, "NDLS", "DDN", MAJOR_B, 6 * 60 + 45),
    _t("K113", "Doon–Delhi Intercity", "दून–दिल्ली इंटरसिटी", "express", LINE_B, "DDN", "NDLS", ALL_B, 17 * 60 + 10),
    _t("K114", "Delhi–Doon Intercity", "दिल्ली–दून इंटरसिटी", "express", LINE_B, "NDLS", "DDN", ALL_B, 15 * 60 + 20),
    _t("K121", "Doon–Lucknow Superfast", "दून–लखनऊ सुपरफास्ट", "superfast", LINE_A, "DDN", "LKO", MAJOR_A, 10 * 60 + 15),
    _t("K122", "Lucknow–Doon Superfast", "लखनऊ–दून सुपरफास्ट", "superfast", LINE_A, "LKO", "DDN", MAJOR_A, 6 * 60),
    _t("K131", "Doon–Bareilly Express", "दून–बरेली एक्सप्रेस", "express", LINE_A, "DDN", "BE", ALL_A, 21 * 60 + 45,
       profile="15002", note="Delay profile calibrated to train 15002 departing Dehradun (RunningStatus.in, 2026)."),
    _t("K132", "Bareilly–Doon Express", "बरेली–दून एक्सप्रेस", "express", LINE_A, "BE", "DDN", ALL_A, 4 * 60 + 40),
    _t("K141", "Lucknow–Doon Kumbh Link", "लखनऊ–दून कुंभ लिंक", "express", LINE_A, "LKO", "DDN", MAJOR_A + ["RMU"], 13 * 60 + 30,
       profile="13037", note="Delay profile calibrated to train 13037 arriving Dehradun (RunningStatus.in, 2026)."),
    _t("K142", "Doon–Lucknow Kumbh Link", "दून–लखनऊ कुंभ लिंक", "express", LINE_A, "DDN", "LKO", MAJOR_A + ["RMU"], 8 * 60 + 5),
    _t("K151", "Haridwar–Delhi Express", "हरिद्वार–दिल्ली एक्सप्रेस", "express", LINE_B, "HW", "NDLS", ALL_B, 6 * 60 + 30,
       note="Held out of training: used to test forecasts for unseen trains."),
    _t("K152", "Delhi–Haridwar Express", "दिल्ली–हरिद्वार एक्सप्रेस", "express", LINE_B, "NDLS", "HW", ALL_B, 18 * 60,
       note="Held out of training: used to test forecasts for unseen trains."),
    _t("K161", "Doon–Lucknow Festival Special", "दून–लखनऊ त्योहार स्पेशल", "special", LINE_A, "DDN", "LKO", MAJOR_A, 23 * 60 + 30,
       days=SPECIAL_DAYS_1),
    _t("K162", "Lucknow–Doon Festival Special", "लखनऊ–दून त्योहार स्पेशल", "special", LINE_A, "LKO", "DDN", MAJOR_A, 22 * 60 + 15,
       days=SPECIAL_DAYS_1),
    _t("K171", "Doon–Delhi Exam Special", "दून–दिल्ली परीक्षा स्पेशल", "special", LINE_B, "DDN", "NDLS", MAJOR_B, 13 * 60,
       days=SPECIAL_DAYS_2),
    _t("K172", "Delhi–Doon Exam Special", "दिल्ली–दून परीक्षा स्पेशल", "special", LINE_B, "NDLS", "DDN", MAJOR_B, 9 * 60 + 20,
       days=SPECIAL_DAYS_2),
]

HELD_OUT = {"K151", "K152"}


def build_timetable():
    """Fill each train's stops with scheduled times, distances and per-leg slack."""
    for tr in TRAINS:
        speed = SPEED[tr.kind]
        t = tr.depart
        km = 0.0
        stops = []
        for idx, st in enumerate(tr.halts):
            if idx == 0:
                stops.append({"code": st, "arr": None, "dep": t, "km": 0.0,
                              "leg_km": 0.0, "leg_single": 0.0, "leg_cong": 0.0, "slack": 0.0})
                continue
            prev = tr.halts[idx - 1]
            seg = _route(tr.line, prev, st)
            leg_km = single_km = cong = 0.0
            for a, b in zip(seg, seg[1:]):
                d, single, cw = section(a, b)
                leg_km += d
                single_km += d * single
                cong += d * cw
            run = leg_km / speed * 60.0
            slack = 0.04 * run  # recovery allowance built into every leg
            last = idx == len(tr.halts) - 1
            if last:
                slack += TERMINAL_ALLOWANCE[tr.kind]
            arr = t + run + slack
            major = STATIONS[st][4]
            halt = 0 if last else (5 if major else 2)
            km += leg_km
            stops.append({"code": st, "arr": round(arr), "dep": None if last else round(arr + halt),
                          "km": round(km, 1), "leg_km": leg_km, "leg_single": single_km / leg_km,
                          "leg_cong": cong / leg_km, "slack": round(slack, 2)})
            t = arr + halt
        tr.stops = stops
    return TRAINS


def network_json():
    st = [{"code": c, "name": v[0], "name_hi": v[1], "lat": v[2], "lon": v[3], "major": v[4]}
          for c, v in STATIONS.items()]
    sec = [{"a": a, "b": b, "km": v[0], "single": v[1], "cong": v[2]} for (a, b), v in SECTIONS.items()]
    return {"stations": st, "sections": sec,
            "note": "Coordinates and distances are approximate. Train services are synthetic."}
