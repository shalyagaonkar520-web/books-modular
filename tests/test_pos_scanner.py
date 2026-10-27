"""Point of Sale: a phone as the counter's barcode scanner, opened from a QR code without signing in."""

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


def _item(client, h, name="Butter", barcode="8901262150101", price=100):
    body = {"name": name, "sku": name.upper()[:8], "type": "goods", "sellingPrice": price, "taxRate": 5, "barcode": barcode}
    res = client.post("/api/items", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_the_phone_needs_no_sign_in_and_its_scans_reach_the_counter(client, org):
    _item(client, org)
    session = _open(client, org)
    sid, key = session["id"], session["token"]
    assert session["connected"] is False and session["closed"] is False and len(key) >= 40

    # No Authorization header anywhere on the phone's side.
    opened = client.get(f"/api/pos-scan/{key}")
    assert opened.status_code == 200 and opened.json()["organizationName"] and opened.json()["counterUserName"]
    found = client.get(f"/api/pos-scan/{key}/lookup", params={"code": "8901262150101"})
    assert found.status_code == 200 and found.json()["name"] == "Butter" and found.json()["sellingPrice"] == 100
    assert client.get(f"/api/pos-scan/{key}/lookup", params={"code": "000"}).status_code == 404
    assert client.post(f"/api/pos-scan/{key}/scans", json={"code": "8901262150101", "quantity": 3}).status_code == 201
    assert client.post(f"/api/pos-scan/{key}/scans", json={"code": " 8901262150101 "}).status_code == 201

    poll = client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org).json()
    assert [(s["seq"], s["code"], s["quantity"]) for s in poll["scans"]] == [(1, "8901262150101", 3), (2, "8901262150101", 1)]
    assert poll["session"]["connected"] is True
    later = client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org, params={"after": 1}).json()
    assert [s["seq"] for s in later["scans"]] == [2]


def test_a_new_barcode_becomes_an_item_from_the_phone(client, org):
    key = _open(client, org)["token"]
    res = client.post(
        f"/api/pos-scan/{key}/items",
        json={"barcode": "8906001234567", "name": "  Masala Chips 50g ", "sellingPrice": 20, "taxRate": 12, "unit": "pcs"},
    )
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["name"] == "Masala Chips 50g" and item["barcode"] == "8906001234567" and item["sku"] == "8906001234567"
    assert item["sellingPrice"] == 20 and item["taxRate"] == 12 and item["trackInventory"] is False
    # It is a normal item now: the counter finds it and can sell it.
    assert client.get("/api/pos/lookup", headers=org, params={"code": "8906001234567"}).json()["id"] == item["id"]
    # The same barcode again is refused, not a second item.
    again = client.post(f"/api/pos-scan/{key}/items", json={"barcode": "8906001234567", "name": "Other", "sellingPrice": 5})
    assert again.status_code == 409
    # A code that is already some item's SKU finds that item: no second item is made.
    pen = _item(client, org, "Pen", "111")
    client.put(f"/api/items/{pen['id']}", headers=org, json={"sku": "8906009999999"})
    twin = client.post(f"/api/pos-scan/{key}/items", json={"barcode": "8906009999999", "name": "Twin", "sellingPrice": 5})
    assert twin.status_code == 409 and "Pen" in twin.json()["detail"]
    for bad in (
        {"barcode": "89 06", "name": "x", "sellingPrice": 1},
        {"barcode": "123", "name": "   ", "sellingPrice": 1},
        {"barcode": "123", "name": "x", "sellingPrice": -1},
        {"barcode": "123", "name": "x", "sellingPrice": 1, "taxRate": 101},
    ):
        assert client.post(f"/api/pos-scan/{key}/items", json=bad).status_code == 422


def test_wrong_ended_or_expired_keys_are_refused(client, org):
    session = _open(client, org)
    sid, key = session["id"], session["token"]
    assert client.get("/api/pos-scan/not-a-real-key").status_code == 404
    assert client.post("/api/pos-scan/not-a-real-key/scans", json={"code": "1"}).status_code == 404
    assert client.post(f"/api/pos-scan/{key}/scans", json={"code": "89 01"}).status_code == 422
    assert client.post(f"/api/pos-scan/{key}/scans", json={"code": "1", "quantity": 0}).status_code == 422

    closed = client.delete(f"/api/pos/scanner-sessions/{sid}", headers=org)
    assert closed.status_code == 200 and closed.json()["closed"] is True
    gone = client.post(f"/api/pos-scan/{key}/scans", json={"code": "123"})
    assert gone.status_code == 410 and "ended" in gone.json()["detail"]
    assert client.get(f"/api/pos-scan/{key}").status_code == 410
    assert client.post(f"/api/pos-scan/{key}/items", json={"barcode": "1", "name": "x", "sellingPrice": 1}).status_code == 410
    # The counter can still read the last poll (it shows "disconnected").
    assert client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=org).json()["session"]["closed"] is True

    # After 12 hours the key stops working by itself.
    later = _open(client, org)
    from backend.db import SessionLocal
    from backend.models import PosScannerSession

    with SessionLocal() as db:
        db.get(PosScannerSession, later["id"]).expires_at = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)
        db.commit()
    assert client.post(f"/api/pos-scan/{later['token']}/scans", json={"code": "123"}).status_code == 410


def test_sessions_last_twelve_hours_and_only_the_key_is_kept(client, org):
    session = _open(client, org)
    expires = dt.datetime.fromisoformat(session["expiresAt"].replace("Z", "+00:00"))
    expires = expires if expires.tzinfo else expires.replace(tzinfo=dt.UTC)
    assert dt.timedelta(hours=11, minutes=59) < expires - dt.datetime.now(dt.UTC) <= dt.timedelta(hours=12)
    from backend.db import SessionLocal
    from backend.models import PosScannerSession

    with SessionLocal() as db:
        stored = db.get(PosScannerSession, session["id"])
        assert stored.token_hash and stored.token_hash != session["token"] and session["token"] not in stored.token_hash
    # The key is shown only when the session opens.
    poll = client.get(f"/api/pos/scanner-sessions/{session['id']}/scans", headers=org).json()
    assert "token" not in poll["session"]


def test_a_key_only_reaches_its_own_organization_and_opening_needs_write_access(client, org):
    _item(client, org, "Their butter", "5555555555555")
    other = auth(register_org(client, "PosPhoneOther")["token"])
    other_key = _open(client, other)["token"]
    # The other organization's key cannot see or add to this organization's items.
    assert client.get(f"/api/pos-scan/{other_key}/lookup", params={"code": "5555555555555"}).status_code == 404
    sid = _open(client, org)["id"]
    assert client.get(f"/api/pos/scanner-sessions/{sid}/scans", headers=other).status_code == 404

    invite_and_accept(client, org, "Viewer", "viewer@posphone.example.com", "viewer", "Str0ngPass!")
    viewer = auth(
        client.post("/api/auth/login", json={"email": "viewer@posphone.example.com", "password": "Str0ngPass!"}).json()["accessToken"]
    )
    assert client.post("/api/pos/scanner-sessions", headers=viewer).status_code == 403
    assert client.delete(f"/api/pos/scanner-sessions/{sid}", headers=viewer).status_code == 403


def test_qr_holds_only_this_sessions_link(client, org):
    session = _open(client, org)
    sid, key = session["id"], session["token"]
    ok = client.get(f"/api/pos/scanner-sessions/{sid}/qr", headers=org, params={"url": f"https://books.example.com/scan/{key}"})
    assert ok.status_code == 200 and ok.json()["svg"].lstrip().startswith("<?xml")
    for url in ("https://evil.example.com/phish", f"https://books.example.com/scan/{key}x", f"javascript:alert(1)//scan/{key}"):
        assert client.get(f"/api/pos/scanner-sessions/{sid}/qr", headers=org, params={"url": url}).status_code == 400


def test_opening_a_session_clears_finished_ones(client, org):
    first = _open(client, org)
    client.post(f"/api/pos-scan/{first['token']}/scans", json={"code": "123"})
    client.delete(f"/api/pos/scanner-sessions/{first['id']}", headers=org)
    _open(client, org)
    assert client.get(f"/api/pos/scanner-sessions/{first['id']}/scans", headers=org).status_code == 404
    assert client.get(f"/api/pos-scan/{first['token']}").status_code == 404
