"""Custom fields, workflow rules, approvals, branding, scheduled reports and the customer portal."""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from backend.db import SessionLocal
from backend.services import workflows
from tests.conftest import auth, invite_and_accept, register_org

TODAY = date.today()
D = TODAY.isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "Auto")
    h = auth(ctx["token"])
    customer = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Client Co", "email": "client@example.com"}
    ).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Vendor Co"}).json()
    income = next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["code"] == "4000")
    return {"h": h, "ctx": ctx, "customer": customer, "vendor": vendor, "income": income}


def _invoice(client, b, rate=1000, status="sent", h=None):
    res = client.post(
        "/api/invoices",
        headers=h or b["h"],
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": status,
            "lines": [{"accountId": b["income"]["id"], "description": "Work", "quantity": 1, "rate": rate, "taxRate": 0}],
        },
    )
    return res


def test_custom_fields(client, books):
    h = books["h"]
    res = client.post("/api/custom-fields", headers=h, json={"entity": "invoice", "label": "PO Reference", "required": False})
    assert res.status_code == 201 and res.json()["key"] == "po_reference"
    sel = client.post(
        "/api/custom-fields", headers=h, json={"entity": "invoice", "label": "Region", "fieldType": "select", "options": ["North", "South"]}
    ).json()
    assert (
        client.post("/api/custom-fields", headers=h, json={"entity": "invoice", "label": "Bad", "fieldType": "select"}).status_code == 400
    )
    inv = _invoice(client, books).json()
    saved = client.put(
        f"/api/custom-fields/values/invoice/{inv['id']}", headers=h, json={"values": {"po_reference": "PO-77", "region": "South"}}
    )
    assert saved.status_code == 200 and saved.json()["values"] == {"po_reference": "PO-77", "region": "South"}
    bad = client.put(f"/api/custom-fields/values/invoice/{inv['id']}", headers=h, json={"values": {"region": "East"}})
    assert bad.status_code == 400
    unknown = client.put(f"/api/custom-fields/values/invoice/{inv['id']}", headers=h, json={"values": {"nope": "x"}})
    assert unknown.status_code == 400
    # Clearing a value removes it; deleting the field removes its values.
    client.put(f"/api/custom-fields/values/invoice/{inv['id']}", headers=h, json={"values": {"po_reference": ""}})
    assert client.get(f"/api/custom-fields/values/invoice/{inv['id']}", headers=h).json()["values"] == {"region": "South"}
    assert client.delete(f"/api/custom-fields/{sel['id']}", headers=h).status_code == 200
    assert client.get(f"/api/custom-fields/values/invoice/{inv['id']}", headers=h).json()["values"] == {}


def test_workflow_rule_emails_on_matching_invoice(client, books):
    h = books["h"]
    meta = client.get("/api/workflow-rules/meta", headers=h).json()
    assert "invoice.created" in meta["events"] and "total" in meta["fields"]["invoice"]
    rule = client.post(
        "/api/workflow-rules",
        headers=h,
        json={
            "name": "Big invoice alert",
            "event": "invoice.created",
            "conditions": [{"field": "total", "operator": "greater_than", "value": "5000"}],
            "actions": [
                {
                    "type": "email",
                    "to": "boss@example.com",
                    "subject": "Big invoice {invoice_number}",
                    "message": "Invoice {invoice_number} for {total}",
                }
            ],
        },
    )
    assert rule.status_code == 201, rule.text
    _invoice(client, books, rate=1000)  # below the threshold: no run
    big = _invoice(client, books, rate=9000).json()
    runs = client.get(f"/api/workflow-rules/{rule.json()['id']}/runs", headers=h).json()
    assert len(runs) == 1 and runs[0]["status"] == "pending" and runs[0]["entityId"] == big["id"]

    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        server = MagicMock()
        smtp.return_value = server
        assert client.post("/api/workflow-rules/process", headers=h).status_code == 200
        _, to, body = server.sendmail.call_args[0]
    assert to == "boss@example.com" and big["invoiceNumber"] in body
    runs = client.get(f"/api/workflow-rules/{rule.json()['id']}/runs", headers=h).json()
    assert runs[0]["status"] == "done"
    assert client.get("/api/workflow-rules", headers=h).json()[0]["runCount"] == 1

    bad_field = client.post(
        "/api/workflow-rules",
        headers=h,
        json={
            "name": "x",
            "event": "invoice.created",
            "conditions": [{"field": "nope"}],
            "actions": [{"type": "email", "to": "a@b.c", "message": "m"}],
        },
    )
    assert bad_field.status_code == 400
    for url in ("ftp://example.com/hook", None):
        bad_hook = client.post(
            "/api/workflow-rules", headers=h, json={"name": "x", "event": "bill.created", "actions": [{"type": "webhook", "url": url}]}
        )
        assert bad_hook.status_code == 400


def test_overdue_trigger_fires_once(client, books):
    h = books["h"]
    rule = client.post(
        "/api/workflow-rules",
        headers=h,
        json={
            "name": "Chase",
            "event": "invoice.overdue",
            "actions": [{"type": "email", "to": "client@example.com", "message": "Please pay {invoice_number}"}],
        },
    ).json()
    old = (TODAY - timedelta(days=60)).isoformat()
    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": books["customer"]["id"],
            "date": old,
            "dueDate": old,
            "status": "sent",
            "lines": [{"accountId": books["income"]["id"], "description": "Old", "quantity": 1, "rate": 10, "taxRate": 0}],
        },
    )
    with SessionLocal() as db:
        assert workflows.queue_overdue(db) >= 1
        assert workflows.queue_overdue(db) == 0  # never twice for the same invoice
    assert len(client.get(f"/api/workflow-rules/{rule['id']}/runs", headers=h).json()) == 1


def test_approval_threshold(client, books):
    b, h = books, books["h"]
    assert client.put("/api/approvals/settings", headers=h, json={"invoiceThreshold": 50000}).status_code == 200
    invite_and_accept(client, h, "Sia Staff", "sia.staff@auto.example.com", "staff", "Staff1Pass!")
    staff = auth(
        client.post("/api/auth/login", json={"email": "sia.staff@auto.example.com", "password": "Staff1Pass!"}).json()["accessToken"]
    )

    # Staff cannot issue a large invoice directly.
    blocked = _invoice(client, b, rate=60000, h=staff)
    assert blocked.status_code == 400 and "approval" in blocked.json()["detail"]
    draft = _invoice(client, b, rate=60000, status="draft", h=staff).json()
    assert client.post(f"/api/invoices/{draft['id']}/status", headers=staff, json={"status": "sent"}).status_code == 400
    assert client.post(f"/api/approvals/invoice/{draft['id']}/submit", headers=staff).status_code == 200
    pending = client.get("/api/approvals/pending", headers=h).json()
    assert [p["id"] for p in pending] == [draft["id"]]
    assert client.post(f"/api/approvals/invoice/{draft['id']}/approve", headers=staff, json={}).status_code == 403
    assert client.post(f"/api/approvals/invoice/{draft['id']}/approve", headers=h, json={"note": "ok"}).status_code == 200
    # Approved: now staff may issue it.
    assert client.post(f"/api/invoices/{draft['id']}/status", headers=staff, json={"status": "sent"}).status_code == 200
    # Small invoices and admins are never held up.
    assert _invoice(client, b, rate=100, h=staff).status_code == 201
    assert _invoice(client, b, rate=90000).status_code == 201


def test_branding_and_schedules(client, books):
    h = books["h"]
    res = client.put(
        "/api/document-branding",
        headers=h,
        json={"brandColor": "#0f766e", "documentFooter": "Thank you for your business", "signatureLabel": "Authorised signatory"},
    )
    assert res.status_code == 200 and res.json()["brandColor"] == "#0f766e"
    assert client.put("/api/document-branding", headers=h, json={"logoUrl": "http://insecure/logo.png"}).status_code == 422
    inv = _invoice(client, books).json()
    pdf = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    sched = client.post(
        "/api/report-schedules", headers=h, json={"name": "Monthly P&L", "report": "profit_and_loss", "recipients": ["owner@example.com"]}
    )
    assert sched.status_code == 201 and sched.json()["nextRunDate"]
    preview = client.get("/api/report-schedules/preview", headers=h, params={"report": "receivables"}).json()
    assert preview["lines"][0].startswith("Total outstanding")
    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        server = MagicMock()
        smtp.return_value = server
        assert client.post(f"/api/report-schedules/{sched.json()['id']}/send-now", headers=h).status_code == 200
        _, to, body = server.sendmail.call_args[0]
    assert to == "owner@example.com" and "Net profit" in body
    assert (
        client.post(
            "/api/report-schedules", headers=h, json={"name": "x", "report": "profit_and_loss", "recipients": ["not-an-email"]}
        ).status_code
        == 422
    )


def test_customer_portal_invoice_and_quote(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, rate=2500).json()
    link = client.post(f"/api/share/invoice/{inv['id']}", headers=h)
    assert link.status_code == 200 and link.json()["path"].startswith("/p/")
    token = link.json()["token"]
    # Public: no auth header.
    doc = client.get(f"/api/public/documents/{token}")
    assert doc.status_code == 200
    assert doc.json()["number"] == inv["invoiceNumber"] and doc.json()["balanceDue"] == 2500 and doc.json()["customerName"] == "Client Co"
    assert client.get(f"/api/public/documents/{token}/pdf").content.startswith(b"%PDF")
    assert client.post(f"/api/public/documents/{token}/accept", json={}).status_code == 400  # invoices are not accepted
    assert client.delete(f"/api/share/invoice/{inv['id']}", headers=h).status_code == 200
    assert client.get(f"/api/public/documents/{token}").status_code == 404

    quote = client.post(
        "/api/estimates",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "lines": [{"accountId": b["income"]["id"], "description": "Plan", "quantity": 1, "rate": 999, "taxRate": 0}],
        },
    ).json()
    qtoken = client.post(f"/api/share/estimate/{quote['id']}", headers=h).json()["token"]
    view = client.get(f"/api/public/documents/{qtoken}").json()
    assert view["kind"] == "estimate" and view["canRespond"] is True
    assert client.post(f"/api/public/documents/{qtoken}/accept", json={"name": "Priya", "note": "Go ahead"}).status_code == 200
    assert client.get(f"/api/estimates/{quote['id']}", headers=h).json()["status"] == "accepted"
    assert client.post(f"/api/public/documents/{qtoken}/decline", json={}).status_code == 400
    assert client.get("/api/public/documents/short").status_code == 404
    draft = client.post(
        "/api/estimates",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "lines": [{"accountId": b["income"]["id"], "description": "x", "quantity": 1, "rate": 1, "taxRate": 0}],
        },
    ).json()
    assert client.post(f"/api/share/estimate/{draft['id']}", headers=h).status_code == 400
