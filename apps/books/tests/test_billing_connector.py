"""End to end: a Billing-shaped database -> apps/billing-connector -> Books.

Uses the real connector and the real Books app; only the network hop is
replaced by the test client. Skipped outside the Rooman One monorepo.
"""

from __future__ import annotations

import importlib.util
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text

from backend.config import get_settings
from backend.db import SessionLocal
from backend.main import create_app
from backend.models import Contact, CustomerPayment, Invoice, Item
from tests.conftest import auth, register_org

CONNECTOR = Path(__file__).resolve().parents[2] / "billing-connector" / "connector.py"
SECRET = "connector-test-secret"
pytestmark = pytest.mark.skipif(not CONNECTOR.is_file(), reason="not inside the Rooman One monorepo")

BILLING_SCHEMA = """
create table customers (id text primary key, organization_id text, display_name text, company_name text, email text, phone text,
  gstin text, billing_address_line1 text, billing_address_line2 text, billing_city text, billing_state text, billing_postal_code text,
  created_at timestamp);
create table products (id text primary key, organization_id text, name text, tax_rate_pct numeric, hsn_sac_code text);
create table plans (id text primary key, organization_id text, product_id text, name text, description text, unit_amount numeric,
  currency text, is_active boolean, created_at timestamp);
create table invoices (id text primary key, organization_id text, invoice_number text, customer_id text, status text, issue_date date,
  due_date date, currency text, subtotal numeric, discount_amount numeric, tax_amount numeric, total numeric, sent_at timestamp,
  created_at timestamp);
create table invoice_items (id text primary key, organization_id text, invoice_id text, description text, plan_id text, quantity numeric,
  unit_price numeric, tax_rate_pct numeric, hsn_sac_code text, position integer);
create table payments (id text primary key, organization_id text, customer_id text, amount numeric, currency text, method text,
  status text, reference text, gateway_payment_id text, paid_at timestamp, created_at timestamp);
create table payment_allocations (id text primary key, organization_id text, payment_id text, invoice_id text, amount numeric,
  created_at timestamp);
"""
BILLING_ORG = "b1111111-1111-1111-1111-111111111111"


def _load_connector():
    spec = importlib.util.spec_from_file_location("billing_connector", CONNECTOR)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def setup(client, monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "integration_enabled", True)
    monkeypatch.setattr(settings, "event_signing_secret", SECRET)
    monkeypatch.setattr(settings, "event_subscribers", [])
    books = TestClient(create_app())
    ctx = register_org(client, "ConnectorSync")
    conn_mod = _load_connector()

    billing = create_engine(f"sqlite:///{tmp_path / 'billing.db'}")
    with billing.begin() as c:
        for statement in filter(str.strip, BILLING_SCHEMA.split(";")):
            c.execute(text(statement))

    def sender(body: bytes, headers: dict):
        res = books.post("/api/internal/events", content=body, headers=headers)
        return res.status_code, res.text

    cfg = conn_mod.Settings(
        billing_db_url=str(billing.url),
        books_events_url="http://books.test/api/internal/events",
        secret=SECRET,
        org_map=conn_mod.parse_org_map(f"{BILLING_ORG}={ctx['org']['id']}"),
        state_path=":memory:",
    )
    state = conn_mod.State(":memory:")
    return {
        "c": conn_mod,
        "billing": billing,
        "cfg": cfg,
        "state": state,
        "sender": sender,
        "org_id": ctx["org"]["id"],
        "h": auth(ctx["token"]),
        "client": client,
    }


def _run(s, now=None):
    return s["c"].run_once(s["billing"], s["state"], s["cfg"], s["sender"], now=now)


def _insert(s, table: str, **values):
    values.setdefault("organization_id", BILLING_ORG)
    cols = ", ".join(values)
    with s["billing"].begin() as c:
        c.execute(text(f"insert into {table} ({cols}) values ({', '.join(':' + k for k in values)})"), values)


def _seed(s, discount="0"):
    now = datetime(2026, 10, 16, 10, 0)
    cid, pid, iid, payid = (str(uuid.uuid4()) for _ in range(4))
    _insert(s, "customers", id=cid, display_name="Asha Traders", email="asha@example.com", phone="+919811111111",
            gstin="29ABCDE1234F1Z5", billing_address_line1="12 MG Road", billing_city="Bengaluru", created_at=now)
    prod = str(uuid.uuid4())
    _insert(s, "products", id=prod, name="Rooman Pro", tax_rate_pct=18, hsn_sac_code="998314")
    _insert(s, "plans", id=pid, product_id=prod, name="Monthly", unit_amount="999.00", currency="INR", is_active=True, created_at=now)
    # Billing's maths: 10% discount on 999 = 99.90; tax 18% of 899.10 = 161.84; total 1060.94.
    sub, disc = 999, (99.90 if discount == "10" else 0)
    tax = round((sub - disc) * 0.18, 2)
    total = round(sub - disc + tax, 2)
    _insert(s, "invoices", id=iid, invoice_number="INV-B-0001", customer_id=cid, status="SENT", issue_date="2026-10-16",
            due_date="2026-10-31", currency="INR", subtotal=sub, discount_amount=disc, tax_amount=tax, total=total,
            sent_at=now, created_at=now)
    _insert(s, "invoice_items", id=str(uuid.uuid4()), invoice_id=iid, description="Rooman Pro - Monthly, Oct 2026", plan_id=pid,
            quantity=1, unit_price="999.00", tax_rate_pct=18, hsn_sac_code="998314", position=0)
    _insert(s, "payments", id=payid, customer_id=cid, amount=total, currency="INR", method="RAZORPAY", status="SUCCEEDED",
            gateway_payment_id="pay_RZP1", paid_at=now, created_at=now)
    _insert(s, "payment_allocations", id=str(uuid.uuid4()), payment_id=payid, invoice_id=iid, amount=total, created_at=now)
    return cid, pid, iid, payid, total


def _one(model, org_id, ref):
    with SessionLocal() as db:
        return db.execute(select(model).where(model.organization_id == org_id, model.source_ref == ref)).scalar_one_or_none()


def test_billing_records_reach_books_and_are_sent_once(setup):
    s = setup
    cid, pid, iid, payid, total = _seed(s)
    first = _run(s)
    assert (first.sent, first.failed, first.retry) == (4, 0, 0)
    contact = _one(Contact, s["org_id"], cid)
    assert contact.display_name == "Asha Traders" and contact.billing_address == "12 MG Road, Bengaluru"
    assert _one(Item, s["org_id"], pid).name == "Rooman Pro - Monthly"
    inv = _one(Invoice, s["org_id"], iid)
    assert inv.reference == "INV-B-0001" and inv.status == "paid" and float(inv.total) == total
    pay = _one(CustomerPayment, s["org_id"], payid)
    assert pay.mode == "other" and pay.reference == "pay_RZP1"  # Razorpay -> "other" in Books

    again = _run(s)
    assert (again.sent, again.failed, again.retry) == (0, 0, 0)
    tb = s["client"].get("/api/accounting/trial-balance", headers=s["h"]).json()
    assert abs(tb["totalDebit"] - tb["totalCredit"]) < 0.005


def test_invoice_discount_matches_books(setup):
    s = setup
    _, _, iid, _, total = _seed(s, discount="10")
    assert _run(s).failed == 0
    inv = _one(Invoice, s["org_id"], iid)
    assert float(inv.total) == total == 1060.94


def test_changed_customer_is_sent_as_an_update(setup):
    s = setup
    cid, *_ = _seed(s)
    _run(s)
    with s["billing"].begin() as c:
        c.execute(text("update customers set display_name = 'Asha Traders Pvt Ltd' where id = :id"), {"id": cid})
    assert _run(s).sent == 1
    assert _one(Contact, s["org_id"], cid).display_name == "Asha Traders Pvt Ltd"


def test_drafts_and_unmatched_payments_wait(setup):
    s = setup
    now = datetime.now(timezone.utc)
    cid = str(uuid.uuid4())
    _insert(s, "customers", id=cid, display_name="Waiting Co", created_at=now)
    _insert(s, "invoices", id=str(uuid.uuid4()), invoice_number="INV-B-D", customer_id=cid, status="DRAFT", issue_date="2026-10-16",
            due_date="2026-10-31", currency="INR", subtotal=100, discount_amount=0, tax_amount=18, total=118, created_at=now)
    payid = str(uuid.uuid4())
    _insert(s, "payments", id=payid, customer_id=cid, amount=500, currency="INR", method="UPI", status="SUCCEEDED", paid_at=now,
            created_at=now)
    assert _run(s, now=now).sent == 1  # just the customer
    assert _one(CustomerPayment, s["org_id"], f"{payid}#advance") is None
    later = _run(s, now=now + timedelta(hours=25))  # still unmatched a day later: kept as an advance
    assert later.sent == 1
    assert float(_one(CustomerPayment, s["org_id"], f"{payid}#advance").amount) == 500


def test_wrong_totals_are_recorded_not_retried(setup):
    s = setup
    cid, _, iid, *_ = _seed(s)
    with s["billing"].begin() as c:
        c.execute(text("update invoices set total = 5000 where id = :id"), {"id": iid})
        c.execute(text("delete from payments"))
    assert _run(s).failed == 1
    assert _run(s).failed == 0  # not re-sent while unchanged
    assert s["state"].get("invoice", iid)["status"] == "failed"


def test_sync_from_skips_old_invoices_but_not_their_customers(setup):
    s = setup
    cid, pid, iid, payid, _ = _seed(s)  # all created 2026-10-16 10:00
    s["cfg"].sync_from = datetime(2026, 10, 17).date()
    result = _run(s)
    assert result.sent == 2  # the customer and the plan
    assert _one(Contact, s["org_id"], cid) is not None and _one(Invoice, s["org_id"], iid) is None
    new_iid = str(uuid.uuid4())
    _insert(s, "invoices", id=new_iid, invoice_number="INV-B-0002", customer_id=cid, status="SENT", issue_date="2026-10-17",
            due_date="2026-10-31", currency="INR", subtotal=100, discount_amount=0, tax_amount=18, total=118,
            sent_at=datetime(2026, 10, 17, 9), created_at=datetime(2026, 10, 17, 9))
    _insert(s, "invoice_items", id=str(uuid.uuid4()), invoice_id=new_iid, description="Add-on", plan_id=None, quantity=1,
            unit_price=100, tax_rate_pct=18, position=0)
    assert _run(s).sent == 1
    assert _one(Invoice, s["org_id"], new_iid).reference == "INV-B-0002"
