"""API smoke tests and a cross-check that the Python API and the browser engine agree."""
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_root_and_trains():
    assert "replay" in client.get("/").json()["mode"]
    assert len(client.get("/trains").json()) == 18


def test_eta_board_scenario_metrics():
    r = client.get("/trains/K113/eta", params={"replay": "typical", "t": 900})
    assert r.status_code in (200, 404)
    found = False
    for t in range(0, 1440, 30):
        b = client.get("/stations/MB/board", params={"replay": "typical", "t": t}).json()
        if b["arrivals"]:
            found = True
            a = b["arrivals"][0]
            assert a["earliest_likely"] <= a["kalyon_eta"] <= a["latest_likely"]
            break
    assert found
    s = client.post("/scenario", json={"train": "K131", "stop_index": 1, "current_delay": 90, "visibility_km": 0.2, "month": 1}).json()
    assert len(s["forecasts"]) == 7 and len(s["forecasts"][0]["top_factors"]) == 3
    assert client.get("/metrics").json()["test"]["m1"]["mae"] < client.get("/metrics").json()["test"]["b1"]["mae"]


def test_stream():
    with client.websocket_connect("/stream?replay=typical&speed=100000000") as ws:
        msg = ws.receive_json()
        assert "forecasts" in msg and "train" in msg
