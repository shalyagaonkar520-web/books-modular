from unittest.mock import MagicMock, patch


def test_email_service_status(client, org):
    res = client.get("/api/email/status", headers=org["h"])
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert "sender" in data
    assert "smtp.gmail.com" in data["smtp_server"]


def test_email_validation_errors(client, org):
    # Missing required fields returns 422
    h = org["h"]
    assert client.post("/api/email/send-due-reminder", headers=h, json={}).status_code == 422
    assert client.post("/api/email/send-invoice", headers=h, json={}).status_code == 422
    assert client.post("/api/email/send-message", headers=h, json={}).status_code == 422


@patch("backend.services.email_service.smtplib.SMTP")
def test_send_invoice_email_mocked(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    payload = {
        "to_email": "client@example.com",
        "customer_name": "Acme Corp",
        "invoice_id": "INV-0001",
        "amount": 25000.0,
        "due_date": "2026-09-30",
        "items_summary": "Cloud Consulting Services",
    }
    res = client.post("/api/email/send-invoice", headers=org["h"], json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["invoice_id"] == "INV-0001"
    assert mock_server.sendmail.called


@patch("backend.services.email_service.smtplib.SMTP")
def test_send_message_email_mocked(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    payload = {
        "to_email": "client@example.com",
        "subject": "Important Account Update",
        "message": "Please review your pending statements.",
        "recipient_name": "Jane Doe",
    }
    res = client.post("/api/email/send-message", headers=org["h"], json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["recipient"] == "client@example.com"
    assert mock_server.sendmail.called
