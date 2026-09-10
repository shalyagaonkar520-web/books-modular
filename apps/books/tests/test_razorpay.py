import hashlib
import hmac
import json

from backend.config import get_settings
from tests.conftest import trial_balance_ok


def razorpay_signature(body: str) -> str:
    secret = get_settings().razorpay_webhook_secret or "rooman_books_webhook_secret_2026"
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def _create_open_invoice(client, org, total=10000):
    h = org["h"]
    payload = {
        "customerId": org["customer"]["id"],
        "date": "2026-09-01",
        "status": "sent",
        "lines": [{"itemId": org["item"]["id"], "description": "Consulting Service", "quantity": 1, "rate": total, "taxRate": 0}],
    }
    res = client.post("/api/invoices", headers=h, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_razorpay_public_config_never_exposes_secret(client, org):
    h = org["h"]
    res = client.get("/api/razorpay/config", headers=h)
    assert res.status_code == 200
    data = res.json()
    assert "key_id" in data
    assert "mode" in data
    assert "currency" in data
    # Security check: secret key must never be present
    assert "key_secret" not in data
    assert "razorpay_key_secret" not in data


def test_razorpay_order_creation_and_payment_flow(client, org):
    h = org["h"]
    inv = _create_open_invoice(client, org, total=10000)

    # 1. Create order
    order_res = client.post("/api/razorpay/create-order", headers=h, json={"invoice_id": inv["id"]})
    assert order_res.status_code == 200
    order_data = order_res.json()
    assert order_data["order_id"].startswith("order_")
    assert order_data["amount"] == 1000000  # 10,000 INR in paise
    assert order_data["invoice_id"] == inv["id"]

    # 2. Verify payment (Standard Checkout Callback)
    verify_payload = {
        "razorpay_order_id": order_data["order_id"],
        "razorpay_payment_id": "pay_test_1234567890",
        "razorpay_signature": "test_sig_mock_signature",
        "invoice_id": inv["id"],
        "amount": 10000,
        "method": "upi",
    }
    verify_res = client.post("/api/razorpay/verify-payment", headers=h, json=verify_payload)
    assert verify_res.status_code == 200, verify_res.text
    v_data = verify_res.json()
    assert v_data["success"] is True
    assert v_data["invoice_status"] == "paid"
    assert v_data["amount_paid"] == 10000.0
    assert v_data["balance_due"] == 0.0
    # Fees separated: 2% fee (200) + 18% GST (36)
    assert v_data["razorpay_fee"] == 200.0
    assert v_data["tax_on_fee"] == 36.0
    assert v_data["net_settlement"] == 9764.0

    # 3. Idempotency test: duplicate payment call does not double charge
    dup_res = client.post("/api/razorpay/verify-payment", headers=h, json=verify_payload)
    assert dup_res.status_code == 200
    assert dup_res.json()["message"] == "Payment already processed"

    # Verify invoice status in database
    inv_check = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert inv_check["status"] == "paid"
    assert inv_check["balanceDue"] == 0

    # 4. Verify trial balance is still perfectly balanced
    assert trial_balance_ok(client, h)


def test_razorpay_refund_flow(client, org):
    h = org["h"]
    inv = _create_open_invoice(client, org, total=5000)

    # Pay full invoice
    verify_res = client.post("/api/razorpay/verify-payment", headers=h, json={
        "razorpay_order_id": "order_test_rfnd",
        "razorpay_payment_id": "pay_test_refund_flow",
        "razorpay_signature": "test_sig_mock",
        "invoice_id": inv["id"],
        "amount": 5000,
        "method": "card",
    })
    assert verify_res.status_code == 200
    payment_id = verify_res.json()["payment_id"]

    # Partial refund of ₹2000
    rfnd_res = client.post("/api/razorpay/refund", headers=h, json={
        "payment_id": payment_id,
        "amount": 2000,
        "reason": "Customer returned partial order",
    })
    assert rfnd_res.status_code == 200
    rfnd_data = rfnd_res.json()
    assert rfnd_data["success"] is True
    assert rfnd_data["refund_amount"] == 2000.0
    assert rfnd_data["payment_status"] == "partially_refunded"
    assert rfnd_data["remaining_refundable"] == 3000.0

    # Invoice balance due updated
    inv_check = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert inv_check["amountPaid"] == 3000.0
    assert inv_check["balanceDue"] == 2000.0
    assert inv_check["status"] == "partially_paid"

    # List refunds
    list_rfnds = client.get("/api/razorpay/refunds", headers=h).json()
    assert any(r["payment_id"] == payment_id for r in list_rfnds["items"])

    assert trial_balance_ok(client, h)


def test_webhook_idempotency_and_signature(client, org):
    org["h"]
    webhook_payload = {
        "event_id": "evt_test_unique_101",
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_failed_1",
                    "amount": 50000,
                    "error_code": "BAD_REQUEST_ERROR",
                    "error_description": "Payment was cancelled by user",
                }
            }
        },
    }
    raw_body = json.dumps(webhook_payload)
    signature = razorpay_signature(raw_body)

    # An unsigned or wrongly signed webhook is rejected outright.
    bad = client.post(
        "/api/razorpay/webhook",
        data=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": "not-a-real-signature"},
    )
    assert bad.status_code == 400

    # First call with a genuine HMAC SHA256 signature
    res1 = client.post(
        "/api/razorpay/webhook",
        data=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "ok"

    # Second identical call: idempotency handles safely
    res2 = client.post(
        "/api/razorpay/webhook",
        data=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_processed"


def test_financial_dashboard_and_analytics(client, org):
    h = org["h"]
    # Analytics
    analytics = client.get("/api/razorpay/analytics", headers=h).json()
    assert "total_payments_count" in analytics
    assert "success_rate" in analytics
    assert "methods_breakdown" in analytics

    # Financial dashboard
    dash = client.get("/api/razorpay/financial-dashboard?period=this_month", headers=h).json()
    assert "top_cards" in dash
    assert "total_revenue" in dash["top_cards"]
    assert "total_expenses" in dash["top_cards"]
    assert "net_profit" in dash["top_cards"]
    assert "payment_gateway_fees" in dash["top_cards"]
    assert "cash_flow" in dash
    assert "money_in" in dash["cash_flow"]
    assert "chart_data" in dash

    # Reconcile
    rec_run = client.post("/api/razorpay/reconcile", headers=h)
    assert rec_run.status_code == 200
    recs = client.get("/api/razorpay/reconciliations", headers=h).json()
    assert "items" in recs

    # CSV Export
    exp = client.get("/api/razorpay/reports/export?report_type=payments", headers=h)
    assert exp.status_code == 200
    assert "text/csv" in exp.headers["content-type"]


def test_razorpay_connect_and_disconnect(client, org):
    h = org["h"]
    # 1. Connect
    connect_res = client.post(
        "/api/razorpay/integration/connect",
        headers=h,
        json={
            "key_id": "rzp_test_StCGrX25cCk27O",
            "key_secret": "dXNiyM3czTHNM9H5MUDIl5uR",
            "webhook_secret": "rooman_books_webhook_secret_2026",
            "mode": "test",
        },
    )
    assert connect_res.status_code == 200
    data = connect_res.json()
    assert data["success"] is True
    assert data["connected"] is True

    # 2. Check integration status
    status_res = client.get("/api/razorpay/integration/status", headers=h).json()
    assert status_res["configured"] is True
    assert status_res["connected"] is True

    # 3. Disconnect
    disc_res = client.post("/api/razorpay/integration/disconnect", headers=h).json()
    assert disc_res["success"] is True
    assert disc_res["connected"] is False

    # 4. Re-connect so credentials remain set
    client.post(
        "/api/razorpay/integration/connect",
        headers=h,
        json={
            "key_id": "rzp_test_StCGrX25cCk27O",
            "key_secret": "dXNiyM3czTHNM9H5MUDIl5uR",
            "webhook_secret": "rooman_books_webhook_secret_2026",
            "mode": "test",
        },
    )
