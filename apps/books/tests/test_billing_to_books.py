"""Billing -> Books: customers, plans, invoices and payments sent by Rooman Billing
as signed events land in Books as normal, posted, read-only records."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from rooman_sdk.events import Actor, EventEnvelope, sign
from sqlalchemy import select

from backend.config import get_settings
from backend.db import SessionLocal
from backend.main import create_app
from backend.models import Contact, CustomerPayment, Invoice, Item
from tests.conftest import auth, register_org

SECRET = "billing-test-signing-secret"


@pytest.fixture
def books(monkeypatch) -> TestClient:
    settings = get_settings()
    monkeypatch.setattr(settings, "integration_enabled", True)
    monkeypatch.setattr(settings, "event_signing_secret", SECRET)
    monkeypatch.setattr(settings, "event_subscribers", [])
    return TestClient(create_app())


@pytest.fixture
def tenant(client):
    ctx = register_org(client, "BillingSync")
    return {"h": auth(ctx["token"]), "org_id": ctx["org"]["id"], "org_uuid": str(uuid.UUID(ctx["org"]["id"]))}


def send(c: TestClient, tenant, type_: str, data: dict, source: str = "billing", org_uuid: str | None = None):
    event = EventEnvelope(
        type=type_, org_id=org_uuid or tenant["org_uuid"], actor=Actor(type="service", id="billing"), source=source, data=data
    )
    body = event.to_json().encode()
    return c.post("/internal/events", content=body, headers={"Content-Type": "application/json", "X-Rooman-Signature": sign(body, SECRET)})


def ref() -> str:
    return f"bil_{uuid.uuid4().hex[:10]}"


def customer(c, tenant, cid: str, **extra):
    data = {
        "app_local_id": cid,
        "display_name": "Asha Traders",
        "email": "asha@traders.example.com",
        "phone": "+919811111111",
        "type": "customer",
    }
    data.update(extra)
    return send(c, tenant, "customer.created", data)


def plan(c, tenant, pid: str, price="999.00"):
    return send(
        c,
        tenant,
        "plan.upserted",
        {
            "plan_id": pid,
            "name": "Pro (monthly)",
            "price": price,
            "currency": "INR",
            "tax_rate": "18",
            "hsn_sac": "998314",
            "is_active": True,
        },
    )


def invoice(c, tenant, iid: str, cid: str, pid: str | None, total="1178.82", number="BIL-0001"):
    return send(
        c,
        tenant,
        "invoice.created",
        {
            "invoice_id": iid,
            "number": number,
            "customer_id": cid,
            "date": "2026-10-16",
            "due_date": "2026-10-31",
            "currency": "INR",
            "subtotal": "999.00",
            "tax_total": "179.82",
            "total": total,
            "lines": [
                {
                    "description": "Pro (monthly), Oct 2026",
                    "plan_id": pid,
                    "quantity": "1",
                    "rate": "999.00",
                    "tax_rate": "18",
                    "hsn_sac": "998314",
                }
            ],
        },
    )


def payment(c, tenant, payid: str, cid: str, iid: str, amount="1178.82"):
    return send(
        c,
        tenant,
        "payment.received",
        {
            "payment_id": payid,
            "customer_id": cid,
            "amount": amount,
            "currency": "INR",
            "method": "upi",
            "received_on": "2026-10-16",
            "reference": "pay_RZP123",
            "applied_to": [{"invoice_id": iid, "amount": amount}],
        },
    )


def _one(model, org_id, source_ref):
    with SessionLocal() as db:
        return db.execute(select(model).where(model.organization_id == org_id, model.source_ref == source_ref)).scalar_one_or_none()


# --------------------------------------------------------------------------- #
def test_customer_created_then_updated(books, tenant):
    cid = ref()
    assert customer(books, tenant, cid, gstin="29abcde1234f1z5", billing_address="12 MG Road, Bengaluru").status_code == 200
    contact = _one(Contact, tenant["org_id"], cid)
    assert contact.source_app == "billing" and contact.type == "customer" and contact.gstin == "29ABCDE1234F1Z5"
    assert contact.gst_treatment == "registered_business" and contact.billing_address == "12 MG Road, Bengaluru"
    res = send(
        books,
        tenant,
        "customer.updated",
        {"app_local_id": cid, "display_name": "Asha Traders Pvt Ltd", "type": "customer", "changed": ["display_name"]},
    )
    assert res.status_code == 200
    with SessionLocal() as db:
        assert db.execute(select(Contact).where(Contact.source_ref == cid)).scalars().all()[0].display_name == "Asha Traders Pvt Ltd"
        assert len(db.execute(select(Contact).where(Contact.source_ref == cid)).scalars().all()) == 1


def test_plan_becomes_an_item(books, tenant):
    pid = ref()
    assert plan(books, tenant, pid).status_code == 200
    item = _one(Item, tenant["org_id"], pid)
    assert item.type == "service" and float(item.selling_price) == 999.0 and float(item.tax_rate) == 18 and item.hsn_sac == "998314"
    assert plan(books, tenant, pid, price="1099.00").status_code == 200  # price change
    assert float(_one(Item, tenant["org_id"], pid).selling_price) == 1099.0


def test_invoice_is_posted_like_a_books_invoice(books, tenant, client):
    cid, pid, iid = ref(), ref(), ref()
    customer(books, tenant, cid)
    plan(books, tenant, pid)
    res = invoice(books, tenant, iid, cid, pid)
    assert res.status_code == 200, res.text
    inv = _one(Invoice, tenant["org_id"], iid)
    assert inv.status == "sent" and inv.reference == "BIL-0001" and inv.source_app == "billing"
    assert float(inv.subtotal) == 999.0 and float(inv.tax_total) == 179.82 and float(inv.total) == 1178.82
    # It shows in Books like any invoice, and the books still balance.
    listed = client.get("/api/invoices", headers=tenant["h"]).json()
    assert any(i["id"] == inv.id for i in listed["items"])
    tb = client.get("/api/accounting/trial-balance", headers=tenant["h"]).json()
    assert abs(tb["totalDebit"] - tb["totalCredit"]) < 0.005


def test_the_same_invoice_is_never_imported_twice(books, tenant):
    cid, iid = ref(), ref()
    customer(books, tenant, cid)
    assert invoice(books, tenant, iid, cid, None).status_code == 200
    assert invoice(books, tenant, iid, cid, None).status_code == 200  # re-sent with a new event id
    with SessionLocal() as db:
        assert len(db.execute(select(Invoice).where(Invoice.source_ref == iid)).scalars().all()) == 1


def test_invoice_before_its_customer_is_retried(books, tenant):
    cid, iid = ref(), ref()
    early = invoice(books, tenant, iid, cid, None)
    assert early.status_code == 409 and early.headers.get("retry-after") == "30"
    assert _one(Invoice, tenant["org_id"], iid) is None
    customer(books, tenant, cid)
    assert invoice(books, tenant, iid, cid, None).status_code == 200


def test_totals_that_do_not_add_up_are_refused(books, tenant):
    cid = ref()
    customer(books, tenant, cid)
    res = invoice(books, tenant, ref(), cid, None, total="1500.00")
    assert res.status_code == 422 and "computes" in res.json()["detail"]


def test_payment_settles_the_invoice_once(books, tenant, client):
    cid, iid, payid = ref(), ref(), ref()
    customer(books, tenant, cid)
    invoice(books, tenant, iid, cid, None)
    assert payment(books, tenant, payid, cid, iid).status_code == 200
    inv = _one(Invoice, tenant["org_id"], iid)
    assert inv.status == "paid" and float(inv.amount_paid) == 1178.82
    assert payment(books, tenant, payid, cid, iid).status_code == 200  # re-sent
    with SessionLocal() as db:
        receipts = db.execute(select(CustomerPayment).where(CustomerPayment.source_ref.like(f"{payid}%"))).scalars().all()
        assert len(receipts) == 1 and receipts[0].mode == "upi" and receipts[0].source_app == "billing"
    tb = client.get("/api/accounting/trial-balance", headers=tenant["h"]).json()
    assert abs(tb["totalDebit"] - tb["totalCredit"]) < 0.005


def test_overpayment_is_kept_as_an_advance(books, tenant):
    cid, iid, payid = ref(), ref(), ref()
    customer(books, tenant, cid)
    invoice(books, tenant, iid, cid, None)
    res = send(
        books,
        tenant,
        "payment.received",
        {
            "payment_id": payid,
            "customer_id": cid,
            "amount": "1500.00",
            "currency": "INR",
            "received_on": "2026-10-16",
            "applied_to": [{"invoice_id": iid, "amount": "1500.00"}],
        },
    )
    assert res.status_code == 200
    with SessionLocal() as db:
        rows = db.execute(select(CustomerPayment).where(CustomerPayment.source_ref.like(f"{payid}%"))).scalars().all()
        assert sorted(float(r.amount) for r in rows) == [321.18, 1178.82]


def test_billing_records_are_read_only_in_books(books, tenant, client):
    cid, iid, payid = ref(), ref(), ref()
    customer(books, tenant, cid)
    invoice(books, tenant, iid, cid, None)
    payment(books, tenant, payid, cid, iid)
    inv = _one(Invoice, tenant["org_id"], iid)
    contact = _one(Contact, tenant["org_id"], cid)
    h = tenant["h"]
    for res in (
        client.delete(f"/api/invoices/{inv.id}", headers=h),
        client.put(f"/api/contacts/{contact.id}", headers=h, json={"displayName": "Changed in Books"}),
        client.delete(f"/api/contacts/{contact.id}", headers=h),
    ):
        assert res.status_code == 409 and "Rooman Billing" in res.json()["detail"], res.text
    with SessionLocal() as db:
        pay = db.execute(select(CustomerPayment).where(CustomerPayment.source_ref == payid)).scalar_one()
    assert client.delete(f"/api/customer-payments/{pay.id}", headers=h).status_code == 409
    client.post("/api/contacts/bulk-delete", headers=h, json={"ids": [contact.id]})
    assert _one(Contact, tenant["org_id"], cid) is not None


def test_events_from_books_itself_or_unknown_orgs(books, tenant):
    cid = ref()
    assert customer(books, tenant, cid).status_code == 200
    own = send(books, tenant, "customer.created", {"app_local_id": ref(), "display_name": "Echo", "type": "customer"}, source="books")
    assert own.status_code == 200
    with SessionLocal() as db:
        assert db.execute(select(Contact).where(Contact.display_name == "Echo")).first() is None
    res = send(
        books, tenant, "customer.created", {"app_local_id": ref(), "display_name": "X", "type": "customer"}, org_uuid=str(uuid.uuid4())
    )
    assert res.status_code == 422 and "does not exist" in res.json()["detail"]


def test_unsigned_billing_events_are_refused(books, tenant):
    event = EventEnvelope(type="plan.upserted", org_id=tenant["org_uuid"], actor=Actor(type="service"), source="billing", data={})
    assert books.post("/internal/events", content=event.to_json().encode()).status_code == 401


def test_reachable_through_the_public_api_path(books, tenant):
    """The public web server only forwards /api/..., so Billing posts to /api/internal/events."""
    event = EventEnvelope(
        type="plan.upserted",
        org_id=tenant["org_uuid"],
        actor=Actor(type="service"),
        source="billing",
        data={"plan_id": ref(), "name": "Basic", "price": "499.00", "currency": "INR", "tax_rate": "18", "is_active": True},
    )
    body = event.to_json().encode()
    res = books.post("/api/internal/events", content=body, headers={"X-Rooman-Signature": sign(body, SECRET)})
    assert res.status_code == 200
    assert books.post("/api/internal/events", content=body).status_code == 401


def test_imported_records_show_in_the_books_lists(books, tenant, client):
    """Every value Billing sets must be one Books' own screens accept."""
    customer(books, tenant, ref(), gstin="29ABCDE1234F1Z5", company_name="Asha Traders Pvt Ltd", billing_address="12 MG Road")
    plan(books, tenant, ref())
    for path in ("/api/contacts", "/api/contacts?type=customer", "/api/items"):
        res = client.get(path, headers=tenant["h"])
        assert res.status_code == 200, (path, res.text)
