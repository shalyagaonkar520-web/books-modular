"""Beyond the basics: what-if cash planning, anomaly alerts, credit risk, the daily
digest, reminder drafts, UPI QR, WhatsApp (mocked) and Tally exchange."""

import json
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from backend.config import get_settings
from backend.services import ai, whatsapp
from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()
D = TODAY.isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "P8")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Current", "type": "bank", "openingBalance": 50000, "openingBalanceDate": "2025-01-01"},
    ).json()
    customer = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Late Payer", "email": "l@x.com", "mobile": "98765 43210"}
    ).json()
    good = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Prompt Payer"}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "No GST Supplies"}).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "bank": bank, "customer": customer, "good": good, "vendor": vendor, "accounts": accounts, "ctx": ctx}


def _invoice(client, b, amount, customer=None, days_ago=0, due_in=None):
    day = TODAY - timedelta(days=days_ago)
    body = {
        "customerId": (customer or b["customer"])["id"],
        "date": day.isoformat(),
        "status": "sent",
        "lines": [{"description": "Work", "quantity": 1, "rate": amount, "taxRate": 0}],
    }
    if due_in is not None:
        body["dueDate"] = (day + timedelta(days=due_in)).isoformat()
    res = client.post("/api/invoices", headers=b["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _bill(client, b, amount, number=None, days_ago=0, tax=0):
    body = {
        "vendorId": b["vendor"]["id"],
        "date": (TODAY - timedelta(days=days_ago)).isoformat(),
        "status": "open",
        "vendorBillNumber": number,
        "lines": [{"accountId": b["accounts"]["6000"]["id"], "description": "Supplies", "quantity": 1, "rate": amount, "taxRate": tax}],
    }
    res = client.post("/api/bills", headers=b["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_what_if_cash_planner(client, books):
    b, h = books, books["h"]
    _invoice(client, b, 20000, due_in=10)
    base = client.get("/api/ai/cash-forecast", headers=h, params={"weeks": 8}).json()
    res = client.post(
        "/api/ai/cash-forecast/what-if",
        headers=h,
        json={
            "weeks": 8,
            "collectionRate": 50,
            "extraMonthlyExpense": 5200,
            "oneOffs": [{"date": (TODAY + timedelta(days=3)).isoformat(), "amount": 70000, "type": "outflow", "label": "New machine"}],
        },
    )
    assert res.status_code == 200, res.text
    w = res.json()
    assert w["baseline"]["weeks"][-1]["closing"] == base["weeks"][-1]["closing"]
    # Half the receivable lost (10,000), 8 weeks of 1,200 extra cost (9,600) and the 70,000 purchase.
    assert w["differenceAtEnd"] == -89600
    assert w["scenario"]["firstNegativeWeek"] is not None
    assert "50.00% of receivables collected" in w["summary"] and "New machine" in w["summary"]


def test_anomaly_alerts(client, books):
    b, h = books, books["h"]
    for i, amount in enumerate((1000, 1100, 900), start=1):
        _bill(client, b, amount, number=f"V-{i}", days_ago=60 - i * 10)
    big = _bill(client, b, 9000, number="V-9", days_ago=5)
    dup = _bill(client, b, 500, number="V-1")
    _bill(client, b, 777, number="A", days_ago=2)
    same = _bill(client, b, 777, number="B")
    _bill(client, b, 1000, number="T-1", tax=18)
    client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Reg Co", "gstTreatment": "registered_business"})
    alerts = client.get("/api/insights/anomalies", headers=h).json()
    by_doc = {(a["kind"], a["docId"]) for a in alerts}
    assert ("duplicate_bill", dup["id"]) in by_doc
    assert ("duplicate_bill", same["id"]) in by_doc
    assert ("unusual_amount", big["id"]) in by_doc
    assert ("missing_gstin", b["vendor"]["id"]) in by_doc
    assert any(a["kind"] == "missing_gstin" and "Reg Co" in a["title"] for a in alerts)
    assert alerts[0]["severity"] == "high"


def test_credit_risk_scores(client, books):
    b, h = books, books["h"]
    _invoice(client, b, 5000, days_ago=70, due_in=15)  # 55 days overdue
    paid = _invoice(client, b, 3000, customer=b["good"], days_ago=20, due_in=30)
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["good"]["id"], "invoiceId": paid["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 3000},
    )
    rows = {r["customerName"]: r for r in client.get("/api/insights/credit-risk", headers=h).json()}
    late, prompt = rows["Late Payer"], rows["Prompt Payer"]
    assert late["overdue"] == 5000 and late["maxDaysOverdue"] == 55
    assert late["score"] < 60 and late["grade"] in ("C", "D")
    assert prompt["score"] == 100 and prompt["grade"] == "A" and prompt["onTimePercent"] == 100


def test_daily_digest_and_schedule(client, books, monkeypatch):
    b, h = books, books["h"]
    _invoice(client, b, 1234, days_ago=1)
    d = client.get("/api/insights/digest", headers=h).json()
    assert d["date"] == (TODAY - timedelta(days=1)).isoformat()
    assert "Sales invoiced: INR 1,234.00" in d["lines"]
    sent = []
    monkeypatch.setattr("backend.services.email_service.send_custom_message_email", lambda **kw: sent.append(kw) or {"success": True})
    s = client.post(
        "/api/report-schedules",
        headers=h,
        json={"name": "Morning", "report": "digest", "frequency": "daily", "recipients": ["boss@x.com"]},
    )
    assert s.status_code == 201, s.text
    assert s.json()["nextRunDate"] == (TODAY + timedelta(days=1)).isoformat()
    res = client.post(f"/api/report-schedules/{s.json()['id']}/send-now", headers=h)
    assert res.status_code == 200, res.text
    assert "Daily digest" in sent[0]["subject"] and "Sales invoiced" in sent[0]["message"]


def test_reminder_draft_template_and_ai(client, books, monkeypatch):
    b, h = books, books["h"]
    inv = _invoice(client, b, 4500, days_ago=40, due_in=10)
    res = client.post("/api/ai/reminder-draft", headers=h, json={"invoiceId": inv["id"], "tone": "firm"})
    assert res.status_code == 200, res.text
    draft = res.json()
    assert draft["source"] == "template" and inv["invoiceNumber"] in draft["subject"]
    assert "30 days overdue" in draft["body"] and draft["toEmail"] == "l@x.com"

    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        text = json.dumps({"subject": "Gentle nudge", "body": "Please pay soon."})
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason="end_turn", stop_details=None)

    monkeypatch.setattr(ai, "client_factory", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create))))
    ai_draft = client.post("/api/ai/reminder-draft", headers=h, json={"invoiceId": inv["id"]}).json()
    assert ai_draft == {"subject": "Gentle nudge", "body": "Please pay soon.", "source": "ai", "toEmail": "l@x.com"}
    assert inv["invoiceNumber"] in calls[0]["messages"][0]["content"]
    # Paid / draft invoices do not get reminders.
    draft_inv = client.post(
        "/api/invoices",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": D, "lines": [{"description": "x", "quantity": 1, "rate": 1, "taxRate": 0}]},
    ).json()
    assert client.post("/api/ai/reminder-draft", headers=h, json={"invoiceId": draft_inv["id"]}).status_code == 400


def test_upi_qr_on_portal_and_pdf(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, 2500)
    token = client.post(f"/api/share/invoice/{inv['id']}", headers=h).json()["token"]
    assert client.get(f"/api/public/documents/{token}").json()["upiUri"] is None
    assert client.get(f"/api/public/documents/{token}/upi-qr").status_code == 404
    client.put("/api/organization", headers=h, json={"upiId": "shop@okhdfcbank"})
    doc = client.get(f"/api/public/documents/{token}").json()
    assert doc["upiUri"].startswith("upi://pay?pa=shop@okhdfcbank&pn=") and "am=2500.00" in doc["upiUri"]
    svg = client.get(f"/api/public/documents/{token}/upi-qr")
    assert svg.status_code == 200 and svg.headers["content-type"].startswith("image/svg+xml") and b"<svg" in svg.content
    pdf = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_whatsapp_send(client, books, monkeypatch):
    b, h = books, books["h"]
    inv = _invoice(client, b, 1800)
    assert client.get("/api/integrations/whatsapp/status", headers=h).json()["configured"] is False
    assert client.post(f"/api/integrations/whatsapp/invoices/{inv['id']}", headers=h, json={}).status_code == 503
    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_token", "tok")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "12345")
    posted = []

    def fake_post(url, token, body):
        posted.append((url, token, body))
        return {"messages": [{"id": "wamid.1"}]}

    monkeypatch.setattr(whatsapp, "poster", fake_post)
    res = client.post(f"/api/integrations/whatsapp/invoices/{inv['id']}", headers=h, json={"kind": "reminder"})
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["messageId"] == "wamid.1" and out["to"] == "919876543210"
    url, token, body = posted[0]
    assert url.endswith("/12345/messages") and token == "tok"
    assert body["to"] == "919876543210" and body["type"] == "text" and "/p/" in body["text"]["body"]
    assert "reminder" in body["text"]["body"]
    # With an approved template the text goes in as its body parameter.
    monkeypatch.setattr(settings, "whatsapp_template", "invoice_notice")
    client.post(f"/api/integrations/whatsapp/invoices/{inv['id']}", headers=h, json={"toPhone": "+44 7700 900123"})
    assert posted[1][2]["type"] == "template" and posted[1][2]["to"] == "447700900123"
    assert client.post(f"/api/integrations/whatsapp/invoices/{inv['id']}", headers=h, json={"toPhone": "123"}).status_code == 400


def test_tally_export_and_import(client, books):
    b, h = books, books["h"]
    _invoice(client, b, 3000)
    res = client.get("/api/integrations/tally/export", headers=h, params={"startDate": D, "endDate": D})
    assert res.status_code == 200, res.text
    root = ET.fromstring(res.content)
    vouchers = root.findall(".//VOUCHER")
    sales = next(v for v in vouchers if v.get("VCHTYPE") == "Sales")
    entries = {e.findtext("LEDGERNAME"): float(e.findtext("AMOUNT")) for e in sales.findall("ALLLEDGERENTRIES.LIST")}
    assert entries["Late Payer"] == -3000 and sum(entries.values()) == 0
    ledgers = {ld.get("NAME"): ld.findtext("PARENT") for ld in root.iter("LEDGER")}
    assert ledgers["Late Payer"] == "Sundry Debtors" and ledgers["No GST Supplies"] == "Sundry Creditors"
    assert "Accounts Receivable" not in ledgers

    xml = b"""<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE><LEDGER NAME="Ramesh Traders"><PARENT>Sundry Debtors</PARENT><PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Steel Suppliers"><PARENT>Sundry Creditors</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Courier Charges"><PARENT>Indirect Expenses</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Late Payer"><PARENT>Sundry Debtors</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="HDFC Bank"><PARENT>Bank Accounts</PARENT></LEDGER></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""
    imp = client.post("/api/integrations/tally/import-ledgers", headers=h, files={"file": ("m.xml", xml, "application/xml")})
    assert imp.status_code == 200, imp.text
    r = imp.json()
    assert (r["accountsCreated"], r["customersCreated"], r["vendorsCreated"], r["skipped"]) == (1, 1, 1, 2)
    assert any("Banking" in e for e in r["errors"])
    courier = next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["name"] == "Courier Charges")
    assert courier["type"] == "expense"
    customers = client.get("/api/contacts", headers=h, params={"type": "customer", "search": "Ramesh"}).json()["items"]
    assert customers[0]["gstin"] == "27ABCDE1234F1Z5"
    evil = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><ENVELOPE/>'
    assert (
        client.post("/api/integrations/tally/import-ledgers", headers=h, files={"file": ("e.xml", evil, "application/xml")}).status_code
        == 400
    )
    assert trial_balance_ok(client, h)
