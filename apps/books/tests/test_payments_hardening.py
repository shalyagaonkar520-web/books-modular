"""Security-hardening tests for the email helper endpoints, external payment
intake/confirmation flow, and concurrent document numbering.

These cover the defects fixed in the authorized remediation:
  * email endpoints require a logged-in write-role user (viewers/anonymous blocked);
  * external intake is authenticated and never returns the approval token;
  * approval enforces invoice status / balance / duplicate rules;
  * the confirm page escapes attacker-controlled values;
  * numbering stays unique (and never 500s) under concurrency.
"""

import email
import re
import threading
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from backend.db import SessionLocal
from backend.services import numbering
from tests.conftest import auth, invite_and_accept, register_org


def _sqlite_busy_timeout(db):
    """Reduce 'database is locked' flakiness under concurrency on SQLite only.

    PRAGMA is SQLite-specific syntax; PostgreSQL (the CI matrix DB) rejects it,
    so this is a no-op on any other backend.
    """
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        db.execute(text("PRAGMA busy_timeout=5000"))


_seq = {"n": 0}


def _uid(prefix: str) -> str:
    _seq["n"] += 1
    return f"{prefix}{_seq['n']}"


def _token_from_smtp(mock_server) -> str:
    """Pull the single-use approval token out of the confirmation email body.

    The message is a full MIME string, so decode the HTML part before matching
    (quoted-printable soft breaks otherwise split the token).
    """
    assert mock_server.sendmail.called, "no confirmation email was dispatched"
    _, _, raw = mock_server.sendmail.call_args[0]
    msg = email.message_from_string(raw)
    html_body = ""
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            html_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8")
            break
    match = re.search(r"token=([\w\-]+)&amp;decision=yes", html_body)
    assert match, "confirmation email did not contain an approval token link"
    return match.group(1)


@pytest.fixture(scope="module")
def viewer_headers(client, org):
    """A read-only viewer in the same organization as the `org` fixture admin."""
    email = f"{_uid('viewer')}@hardening.example.com"
    invite_and_accept(client, org["h"], "Read Only", email, "viewer", "Str0ngPass!")
    res = client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"})
    assert res.status_code == 200, res.text
    return auth(res.json()["accessToken"])


# --------------------------------------------------------------------------- #
# 1. Email helper endpoints
# --------------------------------------------------------------------------- #
def test_email_send_endpoints_reject_anonymous(client):
    body = {"to_email": "x@example.com", "subject": "Hi", "message": "Hello"}
    assert client.post("/api/email/send-message", json=body).status_code == 401
    assert client.post("/api/email/send-invoice", json={}).status_code == 401
    assert client.post("/api/email/send-due-reminder", json={}).status_code == 401
    assert client.get("/api/email/status").status_code == 401


def test_email_send_forbidden_for_viewer(client, viewer_headers):
    body = {"to_email": "x@example.com", "subject": "Hi", "message": "Hello"}
    res = client.post("/api/email/send-message", headers=viewer_headers, json=body)
    assert res.status_code == 403


def test_email_status_readable_by_viewer_and_hides_secrets(client, viewer_headers):
    res = client.get("/api/email/status", headers=viewer_headers)
    assert res.status_code == 200
    data = res.json()
    # Sender comes from settings, not the old hardcoded personal address.
    assert data["sender"] == "test-sender@example.com"
    assert data["sender"] != "shalya@rooman.com"
    blob = " ".join(str(v).lower() for v in data.values())
    assert "password" not in blob
    assert "test-smtp-app-password" not in blob


@patch("backend.services.email_service.smtplib.SMTP")
def test_email_send_allowed_for_write_user(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    body = {"to_email": "client@example.com", "subject": "Update", "message": "Please review."}
    res = client.post("/api/email/send-message", headers=org["h"], json=body)
    assert res.status_code == 200, res.text
    assert res.json()["success"] is True


# --------------------------------------------------------------------------- #
# 2. External payment intake
# --------------------------------------------------------------------------- #
def test_external_intake_requires_auth(client):
    payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": 100.0}
    assert client.post("/api/payments/external/incoming", json=payload).status_code == 401


def test_external_intake_forbidden_for_viewer(client, viewer_headers):
    payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": 100.0}
    res = client.post("/api/payments/external/incoming", headers=viewer_headers, json=payload)
    assert res.status_code == 403


@patch("backend.services.email_service.smtplib.SMTP")
def test_external_intake_never_returns_token(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": 250.0, "payer_name": "Test Payer"}
    res = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["status"] == "pending_confirmation"
    assert "approval_token" not in data
    assert "approvalToken" not in data


@patch("backend.services.email_service.smtplib.SMTP")
def test_external_list_never_exposes_token(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    txn = _uid("UTR")
    client.post(
        "/api/payments/external/incoming",
        headers=org["h"],
        json={"platform": "upi", "external_transaction_id": txn, "amount": 300.0},
    )
    items = client.get("/api/payments/external", headers=org["h"]).json()["items"]
    assert items, "expected at least one external payment"
    for item in items:
        assert "approval_token" not in item
        assert "approvalToken" not in item


def test_external_intake_rejects_bad_amount(client, org):
    for bad in (0, -50, 10_000_000_000):
        payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": bad}
        res = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
        assert res.status_code == 422, f"amount={bad} should be rejected as 422, got {res.status_code}"


@patch("backend.services.email_service.smtplib.SMTP")
def test_external_intake_rejects_duplicate(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    txn = _uid("UTR")
    payload = {"platform": "upi", "external_transaction_id": txn, "amount": 500.0}
    first = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert first.status_code == 201, first.text
    second = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert second.status_code == 409


# --------------------------------------------------------------------------- #
# 3. Approval respects invoice status / balance
# --------------------------------------------------------------------------- #
def _create_invoice(client, org, status="sent", qty=1, rate=1000):
    payload = {
        "customerId": org["customer"]["id"],
        "date": "2026-09-01",
        "status": status,
        "lines": [{"itemId": org["service"]["id"], "description": "Consulting", "quantity": qty, "rate": rate, "taxRate": 0}],
    }
    res = client.post("/api/invoices", headers=org["h"], json=payload)
    assert res.status_code == 201, res.text
    return res.json()


@patch("backend.services.email_service.smtplib.SMTP")
def test_intake_rejects_payment_against_draft_invoice(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    inv = _create_invoice(client, org, status="draft", rate=1000)
    payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": 500.0, "invoice_id": inv["id"]}
    res = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert res.status_code == 400
    assert "sent" in res.json()["detail"].lower()


@patch("backend.services.email_service.smtplib.SMTP")
def test_intake_rejects_overpayment(mock_smtp, client, org):
    mock_smtp.return_value = MagicMock()
    inv = _create_invoice(client, org, status="sent", rate=1000)
    over = float(inv["balanceDue"]) + 5000
    payload = {"platform": "upi", "external_transaction_id": _uid("UTR"), "amount": over, "invoice_id": inv["id"]}
    res = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert res.status_code == 400
    assert "exceed" in res.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# 4. Confirmation page escapes attacker-controlled values
# --------------------------------------------------------------------------- #
@patch("backend.services.email_service.smtplib.SMTP")
def test_confirm_page_escapes_transaction_id(mock_smtp, client, org):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server
    injected = "<script>alert('xss')</script>"
    payload = {"platform": "upi", "external_transaction_id": injected, "amount": 400.0, "payer_name": "Mallory"}
    res = client.post("/api/payments/external/incoming", headers=org["h"], json=payload)
    assert res.status_code == 201, res.text
    token = _token_from_smtp(mock_server)

    confirm = client.get(f"/api/payments/external/confirm?token={token}&decision=yes")
    assert confirm.status_code == 200
    assert "<script>alert('xss')</script>" not in confirm.text
    assert "&lt;script&gt;" in confirm.text


# --------------------------------------------------------------------------- #
# 5. Concurrent numbering
# --------------------------------------------------------------------------- #
def test_concurrent_numbering_is_unique_and_never_500s(client):
    # Isolated org so we do not perturb sequences the shared fixtures rely on.
    ctx = register_org(client, "Numbering")
    org_id = ctx["org"]["id"]
    kind = "invoice"

    # Materialise the counter row first so the concurrent workers exercise the
    # atomic-increment path rather than the one-time create-row race.
    with SessionLocal() as db:
        _sqlite_busy_timeout(db)
        numbering.next_number(db, org_id, kind)
        db.commit()

    workers = 8
    results: list[str] = []
    errors: list[Exception] = []
    guard = threading.Lock()
    start = threading.Barrier(workers)

    def worker():
        try:
            start.wait()
            with SessionLocal() as db:
                _sqlite_busy_timeout(db)
                number = numbering.next_number(db, org_id, kind)
                db.commit()
            with guard:
                results.append(number)
        except Exception as exc:  # noqa: BLE001
            with guard:
                errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"numbering raised under concurrency: {errors}"
    assert len(results) == workers
    assert len(set(results)) == workers, f"duplicate document numbers issued: {sorted(results)}"
