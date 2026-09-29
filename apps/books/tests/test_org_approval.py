"""Organization approval workflow: pending sign-ups, approve/reject by a
super-admin, the tenant sign-in block and the require-approval setting."""

import os
import subprocess
import sys
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from backend.db import SessionLocal
from backend.main import app
from backend.models import EmailVerification, Organization, PlatformAdmin, User
from backend.security import hash_password, hash_token
from tests.conftest import auth

ROOT = Path(__file__).resolve().parent.parent
PASSWORD = "Str0ngPass1"


def _make_admin(password: str = "Sup3rPass!") -> tuple[str, str]:
    email = f"root-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="Platform Root", email=email, password_hash=hash_password(password), is_active=True))
        db.commit()
    return email, password


@pytest.fixture
def super_admin(client):
    email, password = _make_admin()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": password}).json()["accessToken"]
    return {"email": email, "h": auth(token)}


@pytest.fixture
def approval_on(client, super_admin):
    """Turn the approval requirement on for one test, and always back off."""
    res = client.put("/api/platform/settings", headers=super_admin["h"], json={"requireOrgApproval": True})
    assert res.status_code == 200 and res.json()["requireOrgApproval"] is True, res.text
    try:
        yield super_admin
    finally:
        off = client.put("/api/platform/settings", headers=super_admin["h"], json={"requireOrgApproval": False})
        assert off.status_code == 200 and off.json()["requireOrgApproval"] is False, off.text


@pytest.fixture
def no_smtp():
    """Approve/reject send a best-effort email; never let it reach a real server."""
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_smtp.return_value = MagicMock()
        yield mock_smtp


def _signup(c: TestClient, hint: str = "pending"):
    """Register a new org the way the web app does (email already verified)."""
    n = uuid.uuid4().hex[:8]
    email = f"owner-{n}@{hint}.example.com"
    with SessionLocal() as db:
        db.add(
            EmailVerification(
                email=email,
                token_hash=hash_token(f"approval-test-{n}"),
                status="VERIFIED",
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
                verified_at=datetime.now(UTC),
            )
        )
        db.commit()
    res = c.post(
        "/api/auth/register",
        json={"name": f"Owner {n}", "email": email, "password": PASSWORD, "organizationName": f"Approval Org {n}"},
    )
    return res, email, f"Approval Org {n}"


def _org_id(email: str) -> str:
    with SessionLocal() as db:
        return db.execute(sa.select(User.organization_id).where(User.email == email)).scalar_one()


def _login(c: TestClient, email: str):
    return c.post("/api/auth/login", json={"email": email, "password": PASSWORD})


# --------------------------------------------------------------------------- #
# Registration + sign-in block
# --------------------------------------------------------------------------- #
def test_register_pending_issues_no_session(approval_on):
    c = TestClient(app)
    res, email, name = _signup(c)
    assert res.status_code == 202, res.text
    body = res.json()
    assert body == {
        "status": "pending_approval",
        "message": "Your organization has been submitted for approval. You will be able to sign in once an administrator approves it.",
        "organizationName": name,
        "email": email,
    }
    assert "accessToken" not in body
    assert "rb_refresh" not in res.cookies
    assert c.cookies.get("rb_refresh") is None
    # No session means refresh has nothing to work with.
    assert c.post("/api/auth/refresh").status_code == 401

    with SessionLocal() as db:
        org = db.get(Organization, _org_id(email))
        assert org.approval_status == "pending" and org.approved_at is None
        user = db.execute(sa.select(User).where(User.email == email)).scalar_one()
        assert user.password_hash is not None and user.role == "admin"

    login = _login(c, email)
    assert login.status_code == 403
    assert login.json()["detail"].startswith("PENDING_APPROVAL:")


def test_pending_listed_and_on_dashboard(client, approval_on):
    h = approval_on["h"]
    res, email, name = _signup(TestClient(app))
    assert res.status_code == 202
    org_id = _org_id(email)

    pending = client.get("/api/platform/organizations", headers=h, params={"status": "pending", "page_size": 100}).json()
    row = next(o for o in pending["items"] if o["id"] == org_id)
    assert row["approvalStatus"] == "pending" and row["adminEmail"] == email and row["approvedAt"] is None
    assert all(o["approvalStatus"] == "pending" for o in pending["items"])

    # The default list includes pending orgs; "active" does not.
    default_ids = {o["id"] for o in client.get("/api/platform/organizations", headers=h, params={"search": name}).json()["items"]}
    assert org_id in default_ids
    active_ids = {
        o["id"] for o in client.get("/api/platform/organizations", headers=h, params={"search": name, "status": "active"}).json()["items"]
    }
    assert org_id not in active_ids

    csv_text = client.get("/api/platform/organizations/export", headers=h, params={"status": "pending"}).text
    assert name in csv_text

    dash = client.get("/api/platform/dashboard", headers=h).json()
    assert dash["pendingOrganizations"] >= 1
    assert len(dash["pendingApprovals"]) <= 10
    entry = next(o for o in dash["pendingApprovals"] if o["id"] == org_id)
    assert entry["adminEmail"] == email

    detail = client.get(f"/api/platform/organizations/{org_id}", headers=h).json()
    assert detail["approvalStatus"] == "pending" and detail["rejectionReason"] is None


def test_approve_allows_login(client, approval_on, no_smtp):
    h = approval_on["h"]
    c = TestClient(app)
    res, email, _ = _signup(c)
    org_id = _org_id(email)
    assert _login(c, email).status_code == 403

    approved = client.post(f"/api/platform/organizations/{org_id}/approve", headers=h)
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["approvalStatus"] == "approved" and body["approvedAt"] and body["rejectionReason"] is None
    # Best-effort notification went to the org admin.
    assert no_smtp.return_value.sendmail.called
    assert no_smtp.return_value.sendmail.call_args[0][1] == email

    login = _login(c, email)
    assert login.status_code == 200, login.text
    token = login.json()["accessToken"]
    assert c.get("/api/auth/me", headers=auth(token)).status_code == 200
    assert c.post("/api/auth/refresh").status_code == 200

    # No longer pending.
    pending_ids = {o["id"] for o in client.get("/api/platform/organizations", headers=h, params={"status": "pending", "page_size": 100}).json()["items"]}
    assert org_id not in pending_ids

    logs = client.get("/api/platform/audit-logs", headers=h, params={"organizationId": org_id}).json()["items"]
    assert any(a["action"] == "approve" and approval_on["email"] in (a["summary"] or "") for a in logs)


def test_reject_blocks_login_with_reason_then_can_approve(client, approval_on, no_smtp):
    h = approval_on["h"]
    c = TestClient(app)
    _, email, _ = _signup(c)
    org_id = _org_id(email)

    rejected = client.post(f"/api/platform/organizations/{org_id}/reject", headers=h, json={"reason": "Incomplete business details"})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["approvalStatus"] == "rejected"
    assert rejected.json()["rejectionReason"] == "Incomplete business details"

    login = _login(c, email)
    assert login.status_code == 403
    assert login.json()["detail"] == "REGISTRATION_REJECTED: Your organization's registration was declined. Reason: Incomplete business details"

    rejected_ids = {o["id"] for o in client.get("/api/platform/organizations", headers=h, params={"status": "rejected", "page_size": 100}).json()["items"]}
    assert org_id in rejected_ids

    # Reason is optional; the message then has no "Reason:" suffix.
    client.post(f"/api/platform/organizations/{org_id}/reject", headers=h, json={})
    assert _login(c, email).json()["detail"] == "REGISTRATION_REJECTED: Your organization's registration was declined."

    # Too long a reason is rejected by validation.
    assert client.post(f"/api/platform/organizations/{org_id}/reject", headers=h, json={"reason": "x" * 501}).status_code == 422

    # A rejected org can still be approved later.
    assert client.post(f"/api/platform/organizations/{org_id}/approve", headers=h).status_code == 200
    assert _login(c, email).status_code == 200


def test_approve_reject_missing_org_404(client, super_admin):
    h = super_admin["h"]
    assert client.post("/api/platform/organizations/nope/approve", headers=h).status_code == 404
    assert client.post("/api/platform/organizations/nope/reject", headers=h, json={}).status_code == 404


def test_approve_reject_require_superuser(client, approval_on):
    _, email, _ = _signup(TestClient(app))
    org_id = _org_id(email)
    assert client.post(f"/api/platform/organizations/{org_id}/approve").status_code == 401
    assert client.post(f"/api/platform/organizations/{org_id}/reject", json={}).status_code == 401


def test_existing_session_blocked_when_org_not_approved(client, approval_on, no_smtp):
    """Defense in depth: a live token/refresh cookie stops working if the org
    is moved back out of approved."""
    h = approval_on["h"]
    c = TestClient(app)
    _, email, _ = _signup(c)
    org_id = _org_id(email)
    client.post(f"/api/platform/organizations/{org_id}/approve", headers=h)
    token = _login(c, email).json()["accessToken"]

    client.post(f"/api/platform/organizations/{org_id}/reject", headers=h, json={"reason": "Fraud"})
    me = c.get("/api/auth/me", headers=auth(token))
    assert me.status_code == 403 and me.json()["detail"].startswith("REGISTRATION_REJECTED:")
    refresh = c.post("/api/auth/refresh")
    assert refresh.status_code == 403 and refresh.json()["detail"].startswith("REGISTRATION_REJECTED:")


def test_impersonate_refused_for_pending_org(client, approval_on):
    h = approval_on["h"]
    _, email, _ = _signup(TestClient(app))
    with SessionLocal() as db:
        user_id = db.execute(sa.select(User.id).where(User.email == email)).scalar_one()
    res = client.post(f"/api/platform/users/{user_id}/impersonate", headers=h)
    assert res.status_code == 400
    assert "not approved" in res.json()["detail"]


# --------------------------------------------------------------------------- #
# Approval off / platform-created orgs / settings
# --------------------------------------------------------------------------- #
def test_approval_off_registers_immediately(client, super_admin):
    settings = client.get("/api/platform/settings", headers=super_admin["h"]).json()
    assert settings["requireOrgApproval"] is False  # REQUIRE_ORG_APPROVAL=false in conftest

    c = TestClient(app)
    res, email, _ = _signup(c, "instant")
    assert res.status_code == 201, res.text
    assert res.json()["accessToken"]
    assert c.cookies.get("rb_refresh")
    with SessionLocal() as db:
        org = db.get(Organization, _org_id(email))
        assert org.approval_status == "approved" and org.approved_at is not None
    assert _login(c, email).status_code == 200


def test_platform_created_org_is_approved(client, approval_on):
    n = uuid.uuid4().hex[:8]
    res = client.post(
        "/api/platform/organizations",
        headers=approval_on["h"],
        json={"name": f"Direct Org {n}", "adminName": "Owner", "adminEmail": f"owner-{n}@direct.example.com", "adminPassword": PASSWORD},
    )
    assert res.status_code == 201, res.text
    org = res.json()["organization"]
    assert org["approvalStatus"] == "approved" and org["approvedAt"]
    assert TestClient(app).post("/api/auth/login", json={"email": f"owner-{n}@direct.example.com", "password": PASSWORD}).status_code == 200


def test_settings_toggle_is_audited(client, approval_on):
    logs = client.get("/api/platform/audit-logs", headers=approval_on["h"], params={"page_size": 50}).json()["items"]
    assert any(a["entityId"] == "require_org_approval" for a in logs)


# --------------------------------------------------------------------------- #
# Migration
# --------------------------------------------------------------------------- #
def test_migration_backfills_existing_orgs_as_approved():
    tmp = tempfile.mkdtemp(prefix="rb-mig-approval-")
    db_path = Path(tmp) / "mig.db"
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "ENVIRONMENT": "test",
        "SECRET_KEY": "x",
        "DATA_DIR": tmp,
    }

    def alembic(*args):
        res = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "database/alembic.ini", *args],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, res.stderr

    alembic("upgrade", "c5d9e2b7f4a1")
    engine = sa.create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO organizations (id, name, country, currency, fiscal_year_start_month, is_suspended, "
                "default_tax_rate, default_payment_terms_days, created_at, updated_at) "
                "VALUES ('legacyorg', 'Legacy', 'India', 'INR', 4, 0, 18, 30, '2026-01-01', '2026-01-01')"
            )
        )
    alembic("upgrade", "head")
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT approval_status, approved_at, rejection_reason FROM organizations WHERE id = 'legacyorg'")
        ).one()
    engine.dispose()
    assert row[0] == "approved"
    assert row[1] is None and row[2] is None
