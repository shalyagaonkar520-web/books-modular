"""Point of Sale: a phone as the counter's barcode scanner."""

import datetime as dt

import pytest

from tests.conftest import auth, invite_and_accept, register_org


@pytest.fixture
def org(client):
    return auth(register_org(client, "PosPhone")["token"])


def _open(client, h):
    res = client.post("/api/pos/scanner-sessions", headers=h)
    assert res.status_code == 201, res.text
    return res.json()


def test_phone_scans_reach_the_counter_in_order(client, org):
    session = _open(client, org)
    sid = session["id"]
    assert session["connected"] is False and session["closed"] is False and session["counterUserName"]

    poll = client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org).json()
    assert poll["scans"] == [] and poll["session"]["connected"] is False

    # The phone (same organization, signed in) opens the link and scans.
    phone = client.post(f"/api/pos/scanner-sessions/{sid}/connect", headers=org)
    assert phone.status_code == 200 and phone.json()["connected"] is True
    for code in (" 8901262150101 ", "8901030865101", "8901262150101"):
        assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": code}).status_code == 201

    poll = client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org).json()
    assert [(s["seq"], s["code"]) for s in poll["scans"]] == [(1, "8901262150101"), (2, "8901030865101"), (3, "8901262150101")]
    assert poll["session"]["connected"] is True and poll["session"]["phoneUserName"]
    # The counter asks only for what it has not seen yet.
    later = client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, params={"after": 2}).json()
    assert [s["seq"] for s in later["scans"]] == [3]


def test_bad_codes_and_closed_sessions_are_refused(client, org):
    sid = _open(client, org)["id"]
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": "   "}).status_code == 422
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": "89 01"}).status_code == 422
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": "9" * 65}).status_code == 422

    closed = client.delete(f"/api/pos/scanner-sessions/{sid}", headers=org)
    assert closed.status_code == 200 and closed.json()["closed"] is True
    gone = client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": "123"})
    assert gone.status_code == 410 and "ended" in gone.json()["detail"]
    assert client.post(f"/api/pos/scanner-sessions/{sid}/connect", headers=org).status_code == 410
    # The counter can still read the last poll (it shows "disconnected").
    assert client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org).json()["session"]["closed"] is True


def test_an_expired_session_takes_no_scans(client, org):
    sid = _open(client, org)["id"]
    from backend.db import SessionLocal
    from backend.models import PosScannerSession

    with SessionLocal() as db:
        db.get(PosScannerSession, sid).expires_at = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)
        db.commit()
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, json={"code": "123"}).status_code == 410


def test_sessions_belong_to_one_organization_and_need_write_access(client, org):
    sid = _open(client, org)["id"]
    other = auth(register_org(client, "PosPhoneOther")["token"])
    assert client.post(f"/api/pos/scanner-sessions/{sid}/connect", headers=other).status_code == 404
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=other, json={"code": "123"}).status_code == 404
    assert client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=other).status_code == 404

    invite_and_accept(client, org, "Viewer", "viewer@posphone.example.com", "viewer", "Str0ngPass!")
    viewer = auth(
        client.post("/api/auth/login", json={"email": "viewer@posphone.example.com", "password": "Str0ngPass!"}).json()["accessToken"]
    )
    assert client.post("/api/pos/scanner-sessions", headers=viewer).status_code == 403
    assert client.post(f"/api/pos/scanner-sessions/{sid}/scans", headers=viewer, json={"code": "123"}).status_code == 403


def test_qr_holds_only_this_sessions_link(client, org):
    sid = _open(client, org)["id"]
    ok = client.get(f"/api/pos/scanner-sessions/{sid}/qr", headers=org, params={"url": f"https://books.example.com/pos/remote/{sid}"})
    assert ok.status_code == 200 and ok.json()["svg"].lstrip().startswith("<?xml")
    for url in ("https://evil.example.com/phish", f"javascript:alert(1)//pos/remote/{sid}"):
        assert client.get(f"/api/pos/scanner-sessions/{sid}/qr", headers=org, params={"url": url}).status_code == 400


def test_opening_a_session_clears_finished_ones(client, org):
    first = _open(client, org)["id"]
    client.post(f"/api/pos/scanner-sessions/{first}/scans", headers=org, json={"code": "123"})
    client.delete(f"/api/pos/scanner-sessions/{first}", headers=org)
    _open(client, org)
    assert client.get(f"/api/pos/scanner-sessions/{first}/scans", headers=org).status_code == 404
