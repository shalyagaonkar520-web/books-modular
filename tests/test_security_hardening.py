"""Security fixes from the October audit: platform-wide email settings, token
renewal, module checks on payments and imports, .env writes, PDF markup."""

import io
import uuid
import zipfile
from unittest.mock import patch

import pytest
from reportlab.lib.styles import getSampleStyleSheet

from backend.services import env_config
from backend.services.export_service import Paragraph
from tests.conftest import auth, invite_and_accept, platform_admin_headers, register_org

SMTP_BODY = {"host": "smtp.attacker.example", "port": 587, "username": "x@attacker.example", "senderName": "Accounts"}


@pytest.fixture
def tenant(client):
    ctx = register_org(client, "Hardening")
    return {"h": auth(ctx["token"]), "org_id": ctx["org"]["id"], "token": ctx["token"]}


# --------------------------------------------------------------------------- #
# SMTP is platform-wide: an organization admin cannot read or change it
# --------------------------------------------------------------------------- #
def test_tenant_admin_cannot_touch_the_platform_email_account(client, tenant):
    assert client.put("/api/settings/smtp", headers=tenant["h"], json=SMTP_BODY).status_code in (404, 405)
    assert client.get("/api/settings/smtp", headers=tenant["h"]).status_code in (404, 405)
    assert client.post("/api/settings/smtp/test", headers=tenant["h"], json={"toEmail": "a@b.com"}).status_code in (404, 405)
    assert client.put("/api/platform/settings/smtp", headers=tenant["h"], json=SMTP_BODY).status_code == 401


def test_platform_admin_must_retype_the_password_for_a_new_server(client):
    ph = platform_admin_headers(client)
    current = client.get("/api/platform/settings/smtp", headers=ph)
    assert current.status_code == 200 and "password" not in current.json()
    with patch("backend.routers.platform_email.verify_smtp_credentials") as verify:
        res = client.put("/api/platform/settings/smtp", headers=ph, json=SMTP_BODY)
    # The stored password is never sent to a different server or account.
    assert res.status_code == 400 and not verify.called


def test_smtp_values_must_be_single_lines(client):
    ph = platform_admin_headers(client)
    res = client.put("/api/platform/settings/smtp", headers=ph, json={**SMTP_BODY, "password": "pw", "senderName": "x\nSECRET_KEY=known"})
    assert res.status_code == 422


def test_env_writer_refuses_line_breaks(tmp_path, monkeypatch):
    monkeypatch.setattr(env_config, "ENV_PATH", tmp_path / ".env")
    with pytest.raises(ValueError):
        env_config.update_env_values({"SMTP_SENDER_NAME": "Accounts\nTRUSTED_PROXIES=0.0.0.0/0"})
    assert not (tmp_path / ".env").exists()


# --------------------------------------------------------------------------- #
# /me hands back the same token: sessions are renewed only through /refresh
# --------------------------------------------------------------------------- #
def test_me_does_not_mint_a_new_token(client, tenant):
    res = client.get("/api/auth/me", headers=tenant["h"])
    assert res.status_code == 200 and res.json()["accessToken"] == tenant["token"]


# --------------------------------------------------------------------------- #
# Module checks on payments and on endpoints that create other modules' records
# --------------------------------------------------------------------------- #
def _staff_limited_to(client, tenant, modules):
    email = f"staff-{uuid.uuid4().hex[:6]}@hardening.example.com"
    staff = invite_and_accept(client, tenant["h"], "Limited Staff", email, "staff", "Str0ngPass!")
    import json

    from backend.db import SessionLocal
    from backend.models import User

    with SessionLocal() as db:
        user = db.get(User, staff["id"])
        user.module_access = json.dumps(modules)
        db.commit()
    login = client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"})
    assert login.status_code == 200, login.text
    return auth(login.json()["accessToken"])


def test_payments_need_their_module(client, tenant):
    h = _staff_limited_to(client, tenant, ["documents"])
    for path in ("/api/customer-payments", "/api/vendor-payments"):
        res = client.post(path, headers=h, json={})
        assert res.status_code == 403 and "edit access" in res.json()["detail"], (path, res.text)


def test_excel_import_needs_access_to_what_it_creates(client, tenant):
    h = _staff_limited_to(client, tenant, ["documents"])
    body = {"items": [{"category": "invoices", "data": {"display_name": "X", "amount": "100", "date": "2026-01-01"}}]}
    res = client.post("/api/documents/import-excel-commit", headers=h, json=body)
    assert res.status_code == 403 and "invoices" in res.json()["detail"]


def test_excel_import_refuses_a_zip_bomb(client, tenant):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", b"0" * (210 * 1024 * 1024))
    res = client.post(
        "/api/documents/import-excel-categorize",
        headers=tenant["h"],
        files={"file": ("big.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 413


def test_unreadable_workbook_gets_a_plain_message(client, tenant):
    res = client.post(
        "/api/documents/import-excel-categorize",
        headers=tenant["h"],
        files={"file": ("bad.xlsx", b"not a workbook", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 400 and "valid Excel" in res.json()["detail"] and "zip" not in res.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# PDF: user text is text, never markup
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("text", ["see <br> next", "a<i>b", "x &#; y", "x <b>y", "R&D Ltd", "<img src='/etc/hosts'/>", "a &foo; b"])
def test_pdf_paragraphs_accept_any_user_text(text):
    p = Paragraph(f"<b>Customer:</b> {text}", getSampleStyleSheet()["Normal"])
    p.wrap(400, 200)
    assert "<img" not in p.text or "&lt;img" in p.text
