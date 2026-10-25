"""Pre-production hardening: workflow webhooks, fixed-asset permissions, spreadsheet
formula injection, outbound message limits, import size and Tally XML safety."""

import io
import json
import xml.etree.ElementTree as ET
from datetime import date

import openpyxl
import pytest

from backend.config import get_settings
from backend.services import ratelimit, whatsapp, workflows
from tests.conftest import auth, invite_and_accept, register_org

D = date.today().isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "Sec")
    h = auth(ctx["token"])
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "accounts": accounts}


def _staff(client, h, email):
    invite_and_accept(client, h, "Staff", email, "staff", "Staff1Pass!")
    return auth(client.post("/api/auth/login", json={"email": email, "password": "Staff1Pass!"}).json()["accessToken"])


def test_workflow_webhook_refuses_redirects_and_signs_with_a_server_secret(client, books, monkeypatch):
    h = books["h"]
    rule = client.post(
        "/api/workflow-rules",
        headers=h,
        json={"name": "Hook", "event": "invoice.created", "actions": [{"type": "webhook", "url": "https://hooks.example.com/in"}]},
    ).json()
    sent = []

    def fake_post(url, body, headers):
        sent.append((url, body, headers))
        return 302  # what a redirect to an internal address looks like with redirects disabled

    monkeypatch.setattr("backend.services.webhook_dispatcher._post", fake_post)
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Hook Co"}).json()
    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"],
            "date": D,
            "status": "sent",
            "lines": [{"description": "x", "quantity": 1, "rate": 100, "taxRate": 0}],
        },
    )
    client.post("/api/workflow-rules/process", headers=h)
    runs = client.get(f"/api/workflow-rules/{rule['id']}/runs", headers=h).json()
    assert sent and runs[0]["error"] == "Webhook answered 302"
    # The signing key is not the guessable rule id + org id, and only admins can read it.
    secret = client.get(f"/api/workflow-rules/{rule['id']}/signing-secret", headers=h).json()["secret"]
    assert len(secret) == 64 and rule["id"] not in secret
    body = sent[0][1]
    assert json.loads(body)["event"] == "invoice.created"


def test_workflow_network_errors_are_not_echoed(monkeypatch):
    import urllib.error

    def boom(url, body, headers):
        raise urllib.error.URLError("[Errno 111] Connection refused to 10.0.0.5:5432")

    monkeypatch.setattr("backend.services.webhook_dispatcher._post", boom)
    monkeypatch.setattr("backend.services.integrations.webhook_url_error", lambda url: None)
    rule = type("R", (), {"id": "r1", "name": "n"})()
    org = type("O", (), {"id": "o1"})()
    run = type("Run", (), {"event": "invoice.created"})()
    with pytest.raises(RuntimeError) as exc:
        workflows._webhook(org, rule, {"url": "https://x.example"}, run, {})
    assert str(exc.value) == "Could not reach the webhook URL"


def test_fixed_assets_are_admin_only_and_never_post_to_control_accounts(client, books):
    h = books["h"]
    staff = _staff(client, h, "fa.staff@sec.example.com")
    body = {"name": "Laptop", "purchaseDate": D, "cost": 60000}
    assert client.post("/api/fixed-assets", headers=staff, json=body).status_code == 403
    bank_ledger = books["accounts"]["1000"]["id"]  # Cash: the Petty Cash bank account's ledger
    bad = client.post("/api/fixed-assets", headers=h, json={**body, "assetAccountId": bank_ledger, "postOpeningBalance": True})
    assert bad.status_code == 400 and "control account" in bad.json()["detail"]
    assert client.post("/api/fixed-assets", headers=h, json=body).status_code == 201


def test_gst_spreadsheet_stores_formulas_as_text(client, books):
    h = books["h"]
    vendor = client.post(
        "/api/contacts", headers=h, json={"type": "vendor", "displayName": '=HYPERLINK("https://evil.example","x")'}
    ).json()
    client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": vendor["id"],
            "date": D,
            "status": "open",
            "tdsSection": "194C",
            "tdsRate": 1,
            "lines": [{"accountId": books["accounts"]["6000"]["id"], "description": "Work", "quantity": 1, "rate": 50000, "taxRate": 0}],
        },
    )
    res = client.get("/api/gst/tds-register", headers=h, params={"startDate": D, "endDate": D, "format": "xlsx"})
    assert res.status_code == 200, res.text
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    cells = [c for ws in wb.worksheets for row in ws.iter_rows() for c in row if isinstance(c.value, str) and "HYPERLINK" in c.value]
    assert cells and all(c.data_type == "s" for c in cells)


def test_gst_returns_are_not_open_to_staff(client, books):
    staff = _staff(client, books["h"], "gst.staff@sec.example.com")
    assert client.get("/api/gst/gstr3b", headers=staff).status_code == 403
    assert client.get("/api/gst/gstr3b", headers=books["h"]).status_code == 200


def test_outbound_email_and_whatsapp_are_rate_limited(client, books, monkeypatch):
    h = books["h"]
    monkeypatch.setattr(ratelimit, "outbound_email_limiter", ratelimit.RateLimiter(limit=2, window_seconds=3600))
    monkeypatch.setattr("backend.routers.contacts.outbound_email_limiter", ratelimit.outbound_email_limiter)
    monkeypatch.setattr("backend.routers.contacts.send_custom_message_email", lambda **kw: {"success": True})
    c = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Mail Co", "email": "m@x.com"}).json()
    msg = {"subject": "Hi", "message": "Hello"}
    assert client.post(f"/api/contacts/{c['id']}/send-gmail", headers=h, json=msg).status_code == 200
    assert client.post(f"/api/contacts/{c['id']}/send-gmail", headers=h, json=msg).status_code == 200
    third = client.post(f"/api/contacts/{c['id']}/send-gmail", headers=h, json=msg)
    assert third.status_code == 429 and "Too many messages" in third.json()["detail"]
    assert client.post(f"/api/contacts/{c['id']}/send-gmail", headers=h, json={**msg, "to_email": "not-an-email"}).status_code == 422

    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_token", "tok")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "1")
    monkeypatch.setattr(whatsapp, "poster", lambda url, token, body: {"messages": [{"id": "w"}]})
    monkeypatch.setattr("backend.routers.integrations.outbound_whatsapp_limiter", ratelimit.RateLimiter(limit=1, window_seconds=3600))
    inv = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": c["id"],
            "date": D,
            "status": "sent",
            "lines": [{"description": "x", "quantity": 1, "rate": 100, "taxRate": 0}],
        },
    ).json()
    url = f"/api/integrations/whatsapp/invoices/{inv['id']}"
    assert client.post(url, headers=h, json={"toPhone": "9876543210"}).status_code == 200
    assert client.post(url, headers=h, json={"toPhone": "9876543210"}).status_code == 429


def test_excel_import_commit_is_bounded(client, books):
    items = [{"category": "customers", "data": {"display_name": f"C{i}"}} for i in range(5001)]
    res = client.post("/api/documents/import-excel-commit", headers=books["h"], json={"items": items})
    assert res.status_code in (413, 422)


def test_tally_export_escapes_quotes_and_import_rejects_utf16_doctype(client, books):
    h = books["h"]
    client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": 'Acme" ACTION="Alter'})
    res = client.get("/api/integrations/tally/export", headers=h, params={"startDate": D, "endDate": D})
    root = ET.fromstring(res.content)  # well-formed despite the quote in the name
    assert 'Acme" ACTION="Alter' in {ld.get("NAME") for ld in root.iter("LEDGER")}
    evil = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE x [<!ENTITY a "b">]><ENVELOPE>&a;</ENVELOPE>'.encode("utf-16")
    bad = client.post("/api/integrations/tally/import-ledgers", headers=h, files={"file": ("e.xml", evil, "application/xml")})
    assert bad.status_code == 400
