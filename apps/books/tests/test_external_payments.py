"""Tests for universal external payment ingestion and Gmail SMTP YES/NO confirmation flow."""
from unittest.mock import MagicMock, patch


@patch("backend.services.email_service.smtplib.SMTP")
def test_incoming_external_payment_and_email_dispatch(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    payload = {
        "platform": "upi",
        "external_transaction_id": "UPI-IND-99887766",
        "amount": 15000.0,
        "currency": "INR",
        "payer_name": "Rajesh Kumar",
        "payer_email": "rajesh.kumar@example.com",
        "payer_phone": "+91 9876543210",
        "recipient_email": "shalya@rooman.com",
    }

    res = client.post("/api/payments/external/incoming", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["success"] is True
    assert data["platform"] == "upi"
    assert data["status"] == "pending_confirmation"
    assert data["email_dispatched"] is True
    assert "approval_token" in data
    assert mock_server.sendmail.called

    token = data["approval_token"]

    # Verify YES decision from Gmail 1-click confirmation link
    res_yes = client.get(f"/api/payments/external/confirm?token={token}&decision=yes")
    assert res_yes.status_code == 200
    assert "text/html" in res_yes.headers["content-type"]
    assert "Payment Approved &amp; Recorded" in res_yes.text or "Payment Approved & Recorded" in res_yes.text
    assert "15,000.00" in res_yes.text
    assert "UPI-IND-99887766" in res_yes.text

    # Verify second click on YES returns already approved safely
    res_yes_second = client.get(f"/api/payments/external/confirm?token={token}&decision=yes")
    assert res_yes_second.status_code == 200
    assert "Payment Already Approved" in res_yes_second.text


@patch("backend.services.email_service.smtplib.SMTP")
def test_incoming_external_payment_rejection_flow(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    payload = {
        "platform": "stripe",
        "external_transaction_id": "ch_3N998877aazz",
        "amount": 5400.0,
        "currency": "INR",
        "payer_name": "Suspicious Sender",
        "payer_email": "unknown@test.com",
    }

    res = client.post("/api/payments/external/incoming", json=payload)
    assert res.status_code == 201
    token = res.json()["approval_token"]

    # Confirm NO rejection
    res_no = client.get(f"/api/payments/external/confirm?token={token}&decision=no")
    assert res_no.status_code == 200
    assert "text/html" in res_no.headers["content-type"]
    assert "Payment Rejected" in res_no.text
    assert "ch_3N998877aazz" in res_no.text

    # Verify second click on NO returns already rejected safely
    res_no_second = client.get(f"/api/payments/external/confirm?token={token}&decision=no")
    assert res_no_second.status_code == 200
    assert "Payment Already Rejected" in res_no_second.text


def test_invalid_confirmation_token(client):
    res = client.get("/api/payments/external/confirm?token=invalid_token_12345&decision=yes")
    assert res.status_code == 404
    assert "Invalid or Expired Link" in res.text


@patch("backend.services.email_service.smtplib.SMTP")
def test_external_payments_list_and_resend(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    payload = {
        "platform": "phonepe",
        "external_transaction_id": "PHONEPE-778899",
        "amount": 8000.0,
        "currency": "INR",
        "payer_name": "Anita Verma",
        "payer_email": "anita@example.com",
        "organization_id": org["org"]["id"],
    }
    create_res = client.post("/api/payments/external/incoming", json=payload)
    assert create_res.status_code == 201
    pay_id = create_res.json()["external_payment_id"]

    # List payments with auth headers
    list_res = client.get("/api/payments/external", headers=org["h"])
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(p["id"] == pay_id for p in items)

    # Resend email
    resend_res = client.post(f"/api/payments/external/{pay_id}/resend-email", headers=org["h"])
    assert resend_res.status_code == 200
    assert "Confirmation email re-dispatched" in resend_res.json()["message"]

