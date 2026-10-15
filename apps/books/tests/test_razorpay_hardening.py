"""Failure handling and tenant isolation around the Razorpay integration.

Razorpay itself is never called: the shared service instance is patched per
test, so these run offline whatever credentials an earlier test configured.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from razorpay.errors import BadRequestError
from requests.exceptions import ConnectTimeout

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import PaymentEvent, PaymentRecord, PaymentRefund, SettlementRecord
from backend.routers import razorpay as razorpay_router
from backend.services.razorpay_service import RazorpayNotConfigured, get_razorpay_service
from tests.conftest import auth, register_org


def _sign(body: str) -> str:
    secret = get_settings().razorpay_webhook_secret
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def _post_webhook(client, payload, headers=None):
    body = json.dumps(payload)
    return client.post(
        "/api/razorpay/webhook",
        data=body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": _sign(body), **(headers or {})},
    )


def _invoice(client, org, total=5000):
    res = client.post(
        "/api/invoices",
        headers=org["h"],
        json={
            "customerId": org["customer"]["id"],
            "date": "2026-09-01",
            "status": "sent",
            "lines": [{"itemId": org["item"]["id"], "description": "Monitor", "quantity": 1, "rate": total, "taxRate": 0}],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture()
def rzp(monkeypatch):
    """The shared Razorpay service with every network-facing method stubbed."""
    service = get_razorpay_service()
    monkeypatch.setattr(service, "verify_payment_signature", lambda *a, **k: True)
    monkeypatch.setattr(service, "fetch_payment", lambda pid: None)
    monkeypatch.setattr(service, "fetch_order", lambda oid: None)
    return service


def _razorpay_says(monkeypatch, service, *, pay_id, order_id, amount_paise, invoice_id, org_id, state="captured"):
    monkeypatch.setattr(
        service,
        "fetch_payment",
        lambda pid: {"id": pay_id, "order_id": order_id, "amount": amount_paise, "status": state, "method": "upi"},
    )
    monkeypatch.setattr(
        service,
        "fetch_order",
        lambda oid: {"id": order_id, "notes": {"invoice_id": invoice_id, "organization_id": org_id}},
    )


def _paid_payment(client, org, monkeypatch, service, pay_id, total=5000):
    inv = _invoice(client, org, total)
    _razorpay_says(
        monkeypatch,
        service,
        pay_id=pay_id,
        order_id=f"order_{pay_id}",
        amount_paise=total * 100,
        invoice_id=inv["id"],
        org_id=org["org"]["id"],
    )
    res = client.post(
        "/api/razorpay/verify-payment",
        headers=org["h"],
        json={
            "razorpay_order_id": f"order_{pay_id}",
            "razorpay_payment_id": pay_id,
            "razorpay_signature": "sig_valid_for_test",
            "invoice_id": inv["id"],
            "amount": total,
        },
    )
    assert res.status_code == 200, res.text
    return inv, res.json()


# --------------------------------------------------------------------------- #
# Webhooks
# --------------------------------------------------------------------------- #
def test_webhook_payment_with_empty_notes_list_is_acknowledged(client, org):
    res = _post_webhook(
        client,
        {
            "event_id": "evt_notes_list_1",
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": "pay_notes_list_1", "amount": 1000, "notes": []}}},
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"
    with SessionLocal() as db:
        assert db.query(PaymentRecord).filter_by(razorpay_payment_id="pay_notes_list_1").count() == 0


def test_settlement_without_an_organization_is_recorded_not_rejected(client, org):
    res = _post_webhook(
        client,
        {
            "event_id": "evt_settle_no_org",
            "event": "settlement.processed",
            "payload": {"settlement": {"entity": {"id": "setl_no_org_1", "amount": 100000, "fees": 2000, "tax": 360}}},
        },
    )
    assert res.status_code == 200, res.text
    with SessionLocal() as db:
        assert db.query(SettlementRecord).filter_by(settlement_id="setl_no_org_1").count() == 0
        event = db.query(PaymentEvent).filter_by(event_id="evt_settle_no_org").one()
        assert event.status == "ignored"


def test_settlement_for_a_known_organization_is_stored(client, org):
    res = _post_webhook(
        client,
        {
            "event_id": "evt_settle_org",
            "organization_id": org["org"]["id"],
            "event": "settlement.processed",
            "payload": {"settlement": {"entity": {"id": "setl_org_1", "amount": 100000, "fees": 2000, "tax": 360}}},
        },
    )
    assert res.status_code == 200, res.text
    with SessionLocal() as db:
        assert db.query(SettlementRecord).filter_by(settlement_id="setl_org_1", organization_id=org["org"]["id"]).count() == 1


def test_webhook_event_id_is_stable_without_an_id_in_the_body(client, org):
    payload = {"event": "payment.failed", "payload": {"payment": {"entity": {"id": "pay_no_evt_id"}}}}
    first = _post_webhook(client, payload)
    second = _post_webhook(client, payload)
    assert first.json()["status"] == "ok"
    assert second.json()["status"] == "already_processed"
    assert first.json()["event_id"] == second.json()["event_id"]

    by_header = _post_webhook(client, {"event": "payment.failed"}, {"X-Razorpay-Event-Id": "evt_from_header_1"})
    assert by_header.json()["event_id"] == "evt_from_header_1"


def test_webhook_cannot_book_a_payment_against_another_orgs_invoice(client, org):
    inv = _invoice(client, org)
    other = register_org(client, "Intruder")
    res = _post_webhook(
        client,
        {
            "event_id": "evt_cross_org_1",
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_cross_org_1",
                        "amount": 500000,
                        "notes": {"invoice_id": inv["id"], "organization_id": other["org"]["id"]},
                    }
                }
            },
        },
    )
    assert res.status_code == 200
    with SessionLocal() as db:
        assert db.query(PaymentRecord).filter_by(razorpay_payment_id="pay_cross_org_1").count() == 0


# --------------------------------------------------------------------------- #
# Order creation
# --------------------------------------------------------------------------- #
def test_create_order_maps_razorpay_errors(client, org, rzp, monkeypatch):
    inv = _invoice(client, org)

    def refuse(**kwargs):
        raise BadRequestError("The amount must be atleast INR 1.00")

    monkeypatch.setattr(rzp, "create_order", refuse)
    res = client.post("/api/razorpay/create-order", headers=org["h"], json={"invoice_id": inv["id"]})
    assert res.status_code == 502
    assert res.json()["detail"] == "Razorpay refused the request: The amount must be atleast INR 1.00"

    def timeout(**kwargs):
        raise ConnectTimeout("HTTPSConnectionPool(host='api.razorpay.com'): Max retries exceeded")

    monkeypatch.setattr(rzp, "create_order", timeout)
    res = client.post("/api/razorpay/create-order", headers=org["h"], json={"invoice_id": inv["id"]})
    assert res.status_code == 502
    assert res.json()["detail"] == "Could not reach Razorpay. Please try again."

    def not_set_up(**kwargs):
        raise RazorpayNotConfigured("missing keys")

    monkeypatch.setattr(rzp, "create_order", not_set_up)
    res = client.post("/api/razorpay/create-order", headers=org["h"], json={"invoice_id": inv["id"]})
    assert res.status_code == 503
    assert res.json()["detail"] == "Razorpay is not set up yet."


def test_create_order_client_notes_cannot_override_server_keys(client, org, rzp, monkeypatch):
    inv = _invoice(client, org)
    seen = {}

    def capture(amount_inr, receipt, notes):
        seen.update(notes)
        return {"id": "order_capture_1", "amount": int(amount_inr * 100), "currency": "INR"}

    monkeypatch.setattr(rzp, "create_order", capture)
    res = client.post(
        "/api/razorpay/create-order",
        headers=org["h"],
        json={"invoice_id": inv["id"], "notes": {"organization_id": "org_victim", "invoice_id": "inv_victim", "memo": "hi"}},
    )
    assert res.status_code == 200, res.text
    assert seen["organization_id"] == org["org"]["id"]
    assert seen["invoice_id"] == inv["id"]
    assert seen["memo"] == "hi"


# --------------------------------------------------------------------------- #
# Checkout verification
# --------------------------------------------------------------------------- #
def test_verify_payment_uses_razorpays_amount_not_the_clients(client, org, rzp, monkeypatch):
    inv = _invoice(client, org, 5000)
    _razorpay_says(
        monkeypatch, rzp, pay_id="pay_amt_1", order_id="order_amt_1", amount_paise=100000, invoice_id=inv["id"], org_id=org["org"]["id"]
    )
    res = client.post(
        "/api/razorpay/verify-payment",
        headers=org["h"],
        json={
            "razorpay_order_id": "order_amt_1",
            "razorpay_payment_id": "pay_amt_1",
            "razorpay_signature": "sig",
            "invoice_id": inv["id"],
            "amount": 5000,  # the browser claims the whole invoice was paid
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["amount_paid"] == 1000.0
    assert res.json()["balance_due"] == 4000.0


@pytest.mark.parametrize(
    ("state", "notes_invoice", "amount_paise", "expected"),
    [
        ("authorized", None, 100000, 409),
        ("failed", None, 100000, 409),
        ("captured", "inv_someone_else", 100000, 400),
        ("captured", None, 999900, 409),  # more than the balance due
    ],
)
def test_verify_payment_rejects_mismatches(client, org, rzp, monkeypatch, state, notes_invoice, amount_paise, expected):
    inv = _invoice(client, org, 5000)
    pay_id = f"pay_bad_{state}_{amount_paise}_{bool(notes_invoice)}"
    _razorpay_says(
        monkeypatch,
        rzp,
        pay_id=pay_id,
        order_id="order_bad",
        amount_paise=amount_paise,
        invoice_id=notes_invoice or inv["id"],
        org_id=org["org"]["id"],
        state=state,
    )
    res = client.post(
        "/api/razorpay/verify-payment",
        headers=org["h"],
        json={
            "razorpay_order_id": "order_bad",
            "razorpay_payment_id": pay_id,
            "razorpay_signature": "sig",
            "invoice_id": inv["id"],
            "amount": 1,
        },
    )
    assert res.status_code == expected, res.text
    with SessionLocal() as db:
        assert db.query(PaymentRecord).filter_by(razorpay_payment_id=pay_id).count() == 0


# --------------------------------------------------------------------------- #
# Refunds
# --------------------------------------------------------------------------- #
def test_refund_that_cannot_be_booked_is_still_recorded(client, org, rzp, monkeypatch):
    _, paid = _paid_payment(client, org, monkeypatch, rzp, "pay_refund_unbooked")
    monkeypatch.setattr(rzp, "initiate_refund", lambda **kw: {"id": "rfnd_unbooked_1", "amount": 200000})

    def ledger_down(*args, **kwargs):
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr(razorpay_router.ledger, "post_entry", ledger_down)

    res = client.post("/api/razorpay/refund", headers=org["h"], json={"payment_id": paid["payment_id"], "amount": 2000})
    assert res.status_code == 502
    assert "rfnd_unbooked_1" in res.json()["detail"]
    assert "issued at Razorpay" in res.json()["detail"]

    with SessionLocal() as db:
        refund = db.query(PaymentRefund).filter_by(razorpay_refund_id="rfnd_unbooked_1").one()
        assert float(refund.amount) == 2000.0
        assert float(db.get(PaymentRecord, paid["payment_id"]).refund_amount) == 2000.0

    # A retry cannot refund the money a second time.
    monkeypatch.undo()
    retry = client.post("/api/razorpay/refund", headers=org["h"], json={"payment_id": paid["payment_id"], "amount": 4000})
    assert retry.status_code == 400


def test_refund_checks_run_before_razorpay_is_called(client, org, rzp, monkeypatch):
    _, paid = _paid_payment(client, org, monkeypatch, rzp, "pay_refund_precheck")
    called = []
    monkeypatch.setattr(rzp, "initiate_refund", lambda **kw: called.append(kw) or {"id": "rfnd_never"})
    monkeypatch.setattr(razorpay_router.razorpay_posting, "default_bank_account", lambda db, org_id: None)

    res = client.post("/api/razorpay/refund", headers=org["h"], json={"payment_id": paid["payment_id"], "amount": 100})
    assert res.status_code == 400
    assert called == []


def test_refund_rejected_by_razorpay_returns_502(client, org, rzp, monkeypatch):
    _, paid = _paid_payment(client, org, monkeypatch, rzp, "pay_refund_rejected")

    def refuse(**kwargs):
        raise BadRequestError("The refund amount provided is greater than amount captured")

    monkeypatch.setattr(rzp, "initiate_refund", refuse)
    res = client.post("/api/razorpay/refund", headers=org["h"], json={"payment_id": paid["payment_id"], "amount": 100})
    assert res.status_code == 502
    assert res.json()["detail"].startswith("Razorpay refused the request: ")
    with SessionLocal() as db:
        assert db.query(PaymentRefund).filter_by(payment_id=paid["payment_id"]).count() == 0


# --------------------------------------------------------------------------- #
# Smaller hardening
# --------------------------------------------------------------------------- #
def test_category_rule_update_rejects_another_orgs_account(client, org):
    other = register_org(client, "RuleOther")
    other_accounts = client.get("/api/accounting/accounts", headers=auth(other["token"])).json()
    foreign_id = (other_accounts["items"] if isinstance(other_accounts, dict) else other_accounts)[0]["id"]

    rule = {"name": "UPI", "match_type": "method_is", "match_value": "upi", "category": "customer_payment"}
    created = client.post("/api/razorpay/category-rules", headers=org["h"], json=rule)
    assert created.status_code == 201, created.text
    res = client.put(
        f"/api/razorpay/category-rules/{created.json()['id']}",
        headers=org["h"],
        json={**rule, "ledger_account_id": foreign_id},
    )
    assert res.status_code == 400


def test_csv_cells_cannot_start_a_formula():
    assert razorpay_router._csv_safe('=HYPERLINK("http://x")') == '\'=HYPERLINK("http://x")'
    assert razorpay_router._csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert razorpay_router._csv_safe("-2+3") == "'-2+3"
    assert razorpay_router._csv_safe("-250.00") == "-250.00"
    assert razorpay_router._csv_safe("Acme Ltd") == "Acme Ltd"
    assert razorpay_router._csv_safe(12) == 12


def test_connect_rejects_keys_with_line_breaks(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    from tests.conftest import platform_admin_headers

    res = client.post(
        "/api/platform/integrations/razorpay/connect",
        headers=platform_admin_headers(client),
        json={"key_id": "rzp_test_ABC\nSECRET_KEY=owned", "key_secret": "secret", "mode": "test"},
    )
    assert res.status_code == 422
    assert not (tmp_path / ".env").exists()
