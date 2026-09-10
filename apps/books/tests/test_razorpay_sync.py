"""End-to-end tests for the Razorpay transaction sync.

The Razorpay API itself is stubbed so the suite runs offline and deterministically.
Everything below the API boundary -- pagination, deduplication, categorisation,
customer and invoice matching, refunds, accounting and the sync log -- is the
real code path.
"""
from __future__ import annotations

import time

import pytest

from backend.services import razorpay_sync
from backend.services.razorpay_service import RazorpayUnavailable
from tests.conftest import auth, register_org, trial_balance_ok


# --------------------------------------------------------------------------- #
# A stub standing in for the Razorpay REST API
# --------------------------------------------------------------------------- #
class FakeRazorpay:
    """Serves canned payment/refund pages the way Razorpay paginates them."""

    def __init__(self, payments=None, refunds=None, mode="test", fail_with=None):
        self.payments = list(payments or [])
        self.refunds = list(refunds or [])
        self.mode = mode
        self.is_configured = True
        self.fail_with = fail_with
        self.pages_served = 0

    def iter_payments(self, from_ts=None, to_ts=None, page_size=100, max_pages=500):
        if self.fail_with:
            raise self.fail_with
        page_size = min(page_size, 100)
        window = [
            p for p in self.payments
            if (from_ts is None or p["created_at"] >= from_ts) and (to_ts is None or p["created_at"] <= to_ts)
        ]
        page_number = 0
        for start in range(0, max(len(window), 1), page_size):
            chunk = window[start:start + page_size]
            page_number += 1
            self.pages_served += 1
            yield page_number, chunk
            if len(chunk) < page_size:
                return

    def iter_refunds(self, from_ts=None, to_ts=None, page_size=100, max_pages=200):
        yield list(self.refunds)


def payment_entity(pid, amount_paise, **overrides):
    """A Razorpay payment entity with realistic defaults."""
    entity = {
        "id": pid,
        "entity": "payment",
        "amount": amount_paise,
        "currency": "INR",
        "status": "captured",
        "order_id": f"order_{pid[4:]}",
        "invoice_id": None,
        "method": "upi",
        "amount_refunded": 0,
        "refund_status": None,
        "captured": True,
        "description": "Payment",
        "vpa": "payer@okhdfcbank",
        "email": "payer@example.com",
        "contact": "+919000000000",
        "notes": {},
        "fee": int(amount_paise * 0.02),
        "tax": int(amount_paise * 0.02 * 0.18),
        "created_at": int(time.time()) - 3600,
    }
    entity.update(overrides)
    return entity


@pytest.fixture()
def sync_org(client):
    """A fresh organisation per test so counts are never shared."""
    ctx = register_org(client, "SyncCo")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={
            "name": "Razorpay Settlement Account",
            "type": "bank",
            "openingBalance": 100000,
            "openingBalanceDate": "2026-04-01",
            "isPrimary": True,
        },
    ).json()
    customer = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "customer", "displayName": "ABC Ltd", "email": "ap@abcltd.example.com", "paymentTermsDays": 15},
    ).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={"name": "Consulting", "sku": f"SVC-{ctx['org']['id'][:6]}", "type": "service", "sellingPrice": 25000, "costPrice": 0, "taxRate": 0},
    ).json()
    ctx.update({"h": h, "bank": bank, "customer": customer, "item": item})
    return ctx


@pytest.fixture()
def fake_api(monkeypatch):
    """Install a FakeRazorpay in front of the sync service."""
    holder = {}

    def install(fake):
        holder["fake"] = fake
        monkeypatch.setattr(razorpay_sync, "get_razorpay_service", lambda: fake)
        return fake

    return install


def make_invoice(client, ctx, total=25000, status_value="sent"):
    res = client.post(
        "/api/invoices",
        headers=ctx["h"],
        json={
            "customerId": ctx["customer"]["id"],
            "date": "2026-09-01",
            "status": status_value,
            "lines": [{"itemId": ctx["item"]["id"], "description": "Consulting", "quantity": 1, "rate": total, "taxRate": 0}],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


# --------------------------------------------------------------------------- #
# Import, pagination and deduplication
# --------------------------------------------------------------------------- #
def test_successful_payment_is_imported_with_fees_and_net_amount(client, sync_org, fake_api):
    fake_api(FakeRazorpay(payments=[payment_entity("pay_success_1", 2500000)]))

    res = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["sync"]["records_created"] == 1
    assert body["sync"]["status"] == "completed"

    rows = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()
    assert rows["total"] == 1
    row = rows["items"][0]
    assert row["razorpay_payment_id"] == "pay_success_1"
    assert row["amount"] == 25000.0
    assert row["razorpay_fee"] == 500.0          # 2% of 25,000
    assert row["tax_on_fee"] == 90.0             # 18% GST on the fee
    assert row["net_amount"] == 24410.0          # 25,000 - 500 - 90
    assert row["payment_method"] == "upi"
    assert row["payment_status"] == "captured"
    assert row["source"] == "sync"
    assert row["method_detail"].startswith("UPI")


def test_pagination_walks_every_page(client, sync_org, fake_api):
    payments = [payment_entity(f"pay_page_{i:03d}", 100000 + i) for i in range(250)]
    fake = fake_api(FakeRazorpay(payments=payments))

    res = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True}).json()
    assert res["sync"]["records_fetched"] == 250
    assert res["sync"]["records_created"] == 250
    assert res["sync"]["pages_fetched"] == 3  # 100 + 100 + 50
    assert fake.pages_served == 3


def test_repeated_sync_updates_instead_of_duplicating(client, sync_org, fake_api):
    fake_api(FakeRazorpay(payments=[payment_entity("pay_dup_1", 500000)]))

    first = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True}).json()
    assert first["sync"]["records_created"] == 1

    second = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True}).json()
    assert second["sync"]["records_created"] == 0
    assert second["sync"]["records_updated"] == 1

    rows = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()
    assert rows["total"] == 1, "the same Razorpay payment must never be imported twice"


def test_duplicate_payment_id_is_rejected_by_the_database(client, sync_org, fake_api):
    """The unique constraint is the real guarantee, not just the code path."""
    from sqlalchemy.exc import IntegrityError

    from backend.db import SessionLocal
    from backend.models import PaymentRecord, new_id

    fake_api(FakeRazorpay(payments=[payment_entity("pay_unique_1", 100000)]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    with SessionLocal() as db:
        db.add(
            PaymentRecord(
                id=new_id(),
                organization_id=sync_org["org"]["id"],
                razorpay_payment_id="pay_unique_1",
                amount=1000,
                currency="INR",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()


def test_failed_payment_is_recorded_but_not_treated_as_revenue(client, sync_org, fake_api):
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity(
                    "pay_failed_1",
                    300000,
                    status="failed",
                    captured=False,
                    fee=0,
                    tax=0,
                    error_code="BAD_REQUEST_ERROR",
                    error_description="Payment was cancelled by the user",
                )
            ]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["payment_status"] == "failed"
    assert row["category"] == "failed_payment"
    assert row["error_code"] == "BAD_REQUEST_ERROR"

    overview = client.get("/api/razorpay/overview", headers=sync_org["h"]).json()
    assert overview["successful_payments"] == 0.0
    assert overview["failed_count"] == 1
    assert overview["net_revenue"] == 0.0


def test_refunds_are_linked_to_the_original_payment(client, sync_org, fake_api):
    payment = payment_entity("pay_refunded_1", 1000000, amount_refunded=400000, refund_status="partial")
    refund = {
        "id": "rfnd_1",
        "payment_id": "pay_refunded_1",
        "amount": 400000,
        "currency": "INR",
        "status": "processed",
        "speed_processed": "normal",
        "created_at": int(time.time()) - 60,
        "notes": {"reason": "Partial return"},
    }
    fake_api(FakeRazorpay(payments=[payment], refunds=[refund]))

    result = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True}).json()
    assert result["sync"]["refunds_synced"] == 1

    listed = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert listed["refund_amount"] == 4000.0
    assert listed["payment_status"] == "partially_refunded"
    assert listed["category"] == "refund"

    detail = client.get(f"/api/razorpay/payments/{listed['id']}", headers=sync_org["h"]).json()
    assert len(detail["refunds"]) == 1
    assert detail["refunds"][0]["razorpay_refund_id"] == "rfnd_1"
    assert detail["refunds"][0]["amount"] == 4000.0


def test_missing_customer_leaves_the_payment_unlinked(client, sync_org, fake_api):
    fake_api(
        FakeRazorpay(
            payments=[payment_entity("pay_nocust_1", 700000, email="stranger@nowhere.example.com", contact="+919999999999")]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["customer_id"] is None
    assert row["invoice_id"] is None
    assert row["reconciliation_status"] == "unmatched"
    # An unlinked payment is only ever a low-confidence suggestion.
    assert row["category_status"] == "suggested"
    assert row["category_confidence"] < 0.9


def test_known_customer_is_matched_by_email(client, sync_org, fake_api):
    fake_api(FakeRazorpay(payments=[payment_entity("pay_cust_1", 900000, email="ap@abcltd.example.com")]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["customer_id"] == sync_org["customer"]["id"]
    assert row["customer_name"] == "ABC Ltd"
    assert row["category"] == "customer_payment"


# --------------------------------------------------------------------------- #
# Invoice matching and accounting
# --------------------------------------------------------------------------- #
def test_invoice_is_suggested_but_never_paid_without_confirmation(client, sync_org, fake_api):
    invoice = make_invoice(client, sync_org, total=25000)
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity(
                    "pay_match_1",
                    2500000,
                    email="ap@abcltd.example.com",
                    notes={"invoice_id": invoice["id"]},
                )
            ]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["invoice_id"] is None, "sync must not book an invoice on its own"
    assert row["reconciliation_status"] == "partially_matched"

    # The invoice is still open until somebody confirms.
    assert client.get(f"/api/invoices/{invoice['id']}", headers=sync_org["h"]).json()["status"] == "sent"

    matches = client.get(f"/api/razorpay/payments/{row['id']}/invoice-matches", headers=sync_org["h"]).json()
    assert matches["ambiguous"] is False
    assert matches["candidates"][0]["invoice_id"] == invoice["id"]
    assert matches["candidates"][0]["confidence"] >= 0.95


def test_confirming_a_match_pays_the_invoice_and_posts_balanced_entries(client, sync_org, fake_api):
    invoice = make_invoice(client, sync_org, total=25000)
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity("pay_book_1", 2500000, email="ap@abcltd.example.com", notes={"invoice_id": invoice["id"]})
            ]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]

    res = client.post(
        f"/api/razorpay/payments/{row['id']}/match-invoice",
        headers=sync_org["h"],
        json={"invoice_id": invoice["id"], "confirm": True},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["invoice_status"] == "paid"
    assert body["balance_due"] == 0.0
    assert body["payment"]["reconciliation_status"] == "matched"

    # Dr bank 25,000 / Cr receivables 25,000, plus the fee entry: still balanced.
    assert trial_balance_ok(client, sync_org["h"])

    detail = client.get(f"/api/razorpay/payments/{row['id']}", headers=sync_org["h"]).json()
    assert detail["accounting_entries"], "a journal entry should be attached to the transaction"
    lines = detail["accounting_entries"][0]["lines"]
    assert sum(line["debit"] for line in lines) == sum(line["credit"] for line in lines) == 25000.0

    # Booking twice is refused.
    again = client.post(
        f"/api/razorpay/payments/{row['id']}/match-invoice",
        headers=sync_org["h"],
        json={"invoice_id": invoice["id"], "confirm": True},
    )
    assert again.status_code == 409


def test_ambiguous_match_is_flagged_for_review(client, sync_org, fake_api):
    """Two identical open invoices must not produce an automatic match."""
    make_invoice(client, sync_org, total=25000)
    make_invoice(client, sync_org, total=25000)
    fake_api(FakeRazorpay(payments=[payment_entity("pay_ambig_1", 2500000, email="ap@abcltd.example.com")]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    matches = client.get(f"/api/razorpay/payments/{row['id']}/invoice-matches", headers=sync_org["h"]).json()
    assert matches["ambiguous"] is True
    assert matches["can_auto_book"] is False
    assert row["reconciliation_status"] == "needs_review"


def test_missing_invoice_still_imports_and_can_be_categorised_by_hand(client, sync_org, fake_api):
    fake_api(FakeRazorpay(payments=[payment_entity("pay_noinv_1", 150000, description="Walk-in sale")]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["invoice_id"] is None

    updated = client.post(
        f"/api/razorpay/payments/{row['id']}/category",
        headers=sync_org["h"],
        json={"category": "other_income"},
    )
    assert updated.status_code == 200
    assert updated.json()["category"] == "other_income"
    assert updated.json()["category_source"] == "manual"
    assert updated.json()["category_confidence"] == 1.0

    # Reconciling without an invoice is refused.
    bad = client.post(
        f"/api/razorpay/payments/{row['id']}/reconciliation",
        headers=sync_org["h"],
        json={"status": "matched"},
    )
    assert bad.status_code == 400


# --------------------------------------------------------------------------- #
# Rules, failures and audit
# --------------------------------------------------------------------------- #
def test_user_rule_takes_precedence_over_automatic_categorisation(client, sync_org, fake_api):
    created = client.post(
        "/api/razorpay/category-rules",
        headers=sync_org["h"],
        json={
            "name": "Course fees are income",
            "match_type": "description_contains",
            "match_value": "course",
            "category": "other_income",
            "priority": 10,
        },
    )
    assert created.status_code == 201, created.text

    fake_api(FakeRazorpay(payments=[payment_entity("pay_rule_1", 200000, description="Course enrolment")]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    assert row["category"] == "other_income"
    assert row["category_source"] == "rule"
    assert row["category_status"] == "accepted"


def test_api_failure_is_reported_on_the_sync_log_not_swallowed(client, sync_org, fake_api):
    fake_api(FakeRazorpay(fail_with=RazorpayUnavailable("Razorpay is temporarily unavailable: 502")))

    res = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert body["sync"]["status"] == "failed"
    assert "unavailable" in body["sync"]["error_message"].lower()

    logs = client.get("/api/razorpay/sync/logs", headers=sync_org["h"]).json()
    assert logs["items"][0]["status"] == "failed"
    assert logs["items"][0]["completed_at"] is not None


def test_partial_failure_keeps_the_good_records(client, sync_org, fake_api):
    """A malformed record is counted as failed; its neighbours still import."""
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity("pay_ok_1", 100000),
                {"entity": "payment", "amount": 5000, "created_at": int(time.time())},  # no id
                payment_entity("pay_ok_2", 200000),
            ]
        )
    )
    body = client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True}).json()
    assert body["sync"]["records_created"] == 2
    assert body["sync"]["records_failed"] == 1
    assert body["sync"]["status"] == "partial"
    assert client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["total"] == 2


def test_sync_history_records_every_run(client, sync_org, fake_api):
    fake_api(FakeRazorpay(payments=[payment_entity("pay_hist_1", 100000)]))
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={})

    logs = client.get("/api/razorpay/sync/logs", headers=sync_org["h"]).json()
    assert logs["total"] == 2
    assert {log["sync_type"] for log in logs["items"]} == {"manual"}
    assert all(log["completed_at"] for log in logs["items"])

    detail = client.get(f"/api/razorpay/sync/logs/{logs['items'][0]['id']}", headers=sync_org["h"]).json()
    assert detail["id"] == logs["items"][0]["id"]

    status_res = client.get("/api/razorpay/integration/status", headers=sync_org["h"]).json()
    assert status_res["ever_synced"] is True
    assert status_res["last_successful_sync"] is not None
    assert status_res["transactions_imported"] == 1
    assert "key_secret" not in status_res


def test_filters_and_search_narrow_the_transaction_list(client, sync_org, fake_api):
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity("pay_filter_upi", 100000, method="upi", description="UPI collection"),
                payment_entity("pay_filter_card", 900000, method="card", description="Card sale", card={"last4": "4321", "network": "Visa", "type": "credit"}),
                payment_entity("pay_filter_fail", 300000, status="failed", method="netbanking", fee=0, tax=0),
            ]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})
    h = sync_org["h"]

    assert client.get("/api/razorpay/payments", headers=h, params={"method": "card"}).json()["total"] == 1
    assert client.get("/api/razorpay/payments", headers=h, params={"status": "failed"}).json()["total"] == 1
    assert client.get("/api/razorpay/payments", headers=h, params={"amount_min": 5000}).json()["total"] == 1
    assert client.get("/api/razorpay/payments", headers=h, params={"search": "pay_filter_card"}).json()["total"] == 1
    assert client.get("/api/razorpay/payments", headers=h, params={"search": "Card sale"}).json()["total"] == 1
    assert client.get("/api/razorpay/payments", headers=h, params={"search": "nothing-matches"}).json()["total"] == 0


def test_endpoints_require_authentication(client):
    for method, path in (
        ("get", "/api/razorpay/integration/status"),
        ("post", "/api/razorpay/sync"),
        ("get", "/api/razorpay/sync/logs"),
        ("get", "/api/razorpay/overview"),
        ("get", "/api/razorpay/payments"),
        ("get", "/api/razorpay/category-rules"),
    ):
        res = getattr(client, method)(path)
        assert res.status_code == 401, f"{method.upper()} {path} must require authentication"


def test_raw_reference_never_stores_card_or_credential_data(client, sync_org, fake_api):
    fake_api(
        FakeRazorpay(
            payments=[
                payment_entity(
                    "pay_pci_1",
                    500000,
                    method="card",
                    card={
                        "id": "card_x",
                        "last4": "1111",
                        "network": "Visa",
                        "type": "credit",
                        "issuer": "HDFC",
                        "number": "4111111111111111",   # must never be persisted
                        "cvv": "123",                    # must never be persisted
                    },
                    token_id="token_secret_value",
                )
            ]
        )
    )
    client.post("/api/razorpay/sync", headers=sync_org["h"], json={"full": True})

    row = client.get("/api/razorpay/payments", headers=sync_org["h"]).json()["items"][0]
    detail = client.get(f"/api/razorpay/payments/{row['id']}", headers=sync_org["h"]).json()
    stored = str(detail["raw_reference"])

    assert "4111111111111111" not in stored
    assert "cvv" not in stored.lower()
    assert "token_secret_value" not in stored
    assert detail["raw_reference"]["card"] == {"last4": "1111", "network": "Visa", "type": "credit", "issuer": "HDFC"}
    assert detail["method_detail"] == "Visa credit ****1111"
