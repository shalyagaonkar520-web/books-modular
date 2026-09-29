"""Super-admin (platform operator) API: auth isolation, cross-tenant control."""

import uuid

import pytest

from backend.db import SessionLocal
from backend.models import PlatformAdmin
from backend.security import hash_password
from tests.conftest import auth, register_org


def _make_admin(email: str | None = None, password: str = "Sup3rPass!") -> tuple[str, str]:
    email = email or f"root-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="Platform Root", email=email, password_hash=hash_password(password), is_active=True))
        db.commit()
    return email, password


@pytest.fixture
def super_admin(client):
    email, password = _make_admin()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": password}).json()["accessToken"]
    return {"email": email, "h": auth(token)}


# --------------------------------------------------------------------------- #
# Auth & isolation
# --------------------------------------------------------------------------- #
def test_login_and_wrong_password(client):
    email, password = _make_admin()
    ok = client.post("/api/platform/auth/login", json={"email": email, "password": password})
    assert ok.status_code == 200 and ok.json()["accessToken"]
    assert ok.json()["admin"]["email"] == email

    bad = client.post("/api/platform/auth/login", json={"email": email, "password": "WrongPass9!"})
    assert bad.status_code == 401
    assert client.post("/api/platform/auth/login", json={"email": "nobody@x.example.com", "password": "WrongPass9!"}).status_code == 401


def test_platform_routes_require_platform_token(client, super_admin, org):
    # No token -> 401
    assert client.get("/api/platform/dashboard").status_code == 401
    # A tenant admin token must NOT reach the platform API.
    assert client.get("/api/platform/dashboard", headers=org["h"]).status_code == 401
    # A platform token works.
    assert client.get("/api/platform/dashboard", headers=super_admin["h"]).status_code == 200


def test_platform_token_cannot_use_tenant_api(client, super_admin):
    # The platform access token is a different type; tenant endpoints reject it.
    assert client.get("/api/items", headers=super_admin["h"]).status_code == 401
    assert client.get("/api/organization", headers=super_admin["h"]).status_code == 401


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
def test_dashboard_shape(client, super_admin):
    d = client.get("/api/platform/dashboard", headers=super_admin["h"]).json()
    for key in (
        "totalOrganizations",
        "activeOrganizations",
        "suspendedOrganizations",
        "totalUsers",
        "totalInvoices",
        "totalInvoicedAmount",
        "totalCollectedAmount",
        "organizationGrowth",
        "revenueByMonth",
        "topOrganizations",
        "recentActivity",
    ):
        assert key in d, f"missing {key}"
    assert d["totalOrganizations"] >= 1


# --------------------------------------------------------------------------- #
# Organizations
# --------------------------------------------------------------------------- #
def test_create_organization_and_admin_can_log_in(client, super_admin):
    email = f"owner-{uuid.uuid4().hex[:8]}@newco.example.com"
    res = client.post(
        "/api/platform/organizations",
        headers=super_admin["h"],
        json={"name": "Fresh Co", "adminName": "Fresh Owner", "adminEmail": email, "adminPassword": "Str0ngPass!"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["organization"]["name"] == "Fresh Co"
    assert body["admin"]["role"] == "admin"
    # The created admin can log into the tenant app immediately.
    login = client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"})
    assert login.status_code == 200
    th = auth(login.json()["accessToken"])
    # ...and the org has a working chart of accounts (created via bootstrap).
    accounts = client.get("/api/accounting/accounts", headers=th)
    assert accounts.status_code == 200 and len(accounts.json()) > 0


def test_create_organization_rejects_duplicate_admin_email(client, super_admin, org):
    res = client.post(
        "/api/platform/organizations",
        headers=super_admin["h"],
        json={"name": "Dup Co", "adminName": "Dup", "adminEmail": org["email"], "adminPassword": "Str0ngPass!"},
    )
    assert res.status_code == 409


def test_list_and_get_organization(client, super_admin, org):
    lst = client.get("/api/platform/organizations", headers=super_admin["h"])
    assert lst.status_code == 200
    assert lst.json()["total"] >= 1
    org_id = org["org"]["id"]
    detail = client.get(f"/api/platform/organizations/{org_id}", headers=super_admin["h"])
    assert detail.status_code == 200
    assert detail.json()["id"] == org_id
    assert "userCount" in detail.json() and "invoicedAmount" in detail.json()
    assert client.get("/api/platform/organizations/does-not-exist", headers=super_admin["h"]).status_code == 404


def test_suspend_blocks_tenant_then_unsuspend_restores(client, super_admin):
    ctx = register_org(client, "Suspendable")
    th = auth(ctx["token"])
    org_id = ctx["org"]["id"]
    assert client.get("/api/items", headers=th).status_code == 200  # works before

    sus = client.patch(
        f"/api/platform/organizations/{org_id}",
        headers=super_admin["h"],
        json={"isSuspended": True, "suspendedReason": "non-payment"},
    )
    assert sus.status_code == 200 and sus.json()["isSuspended"] is True
    # The tenant is now locked out even with a valid token.
    blocked = client.get("/api/items", headers=th)
    assert blocked.status_code == 403

    res = client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": False})
    assert res.status_code == 200 and res.json()["isSuspended"] is False
    assert client.get("/api/items", headers=th).status_code == 200  # restored


def test_delete_organization_cascades(client, super_admin):
    ctx = register_org(client, "Deletable")
    org_id = ctx["org"]["id"]
    assert client.delete(f"/api/platform/organizations/{org_id}", headers=super_admin["h"]).status_code == 200
    assert client.get(f"/api/platform/organizations/{org_id}", headers=super_admin["h"]).status_code == 404
    # Its former admin can no longer authenticate.
    assert client.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code in (401, 403)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def test_create_list_update_reset_delete_user(client, super_admin, org):
    org_id = org["org"]["id"]
    email = f"staffer-{uuid.uuid4().hex[:8]}@acme.example.com"
    created = client.post(
        "/api/platform/users",
        headers=super_admin["h"],
        json={"organizationId": org_id, "name": "New Staffer", "email": email, "password": "Str0ngPass!", "role": "staff"},
    )
    assert created.status_code == 201, created.text
    uid = created.json()["id"]
    assert created.json()["organizationId"] == org_id

    # The new user can log into the tenant app.
    assert client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"}).status_code == 200

    lst = client.get("/api/platform/users", headers=super_admin["h"], params={"search": email})
    assert lst.status_code == 200 and any(u["id"] == uid for u in lst.json()["items"])

    upd = client.patch(f"/api/platform/users/{uid}", headers=super_admin["h"], json={"role": "viewer", "isActive": False})
    assert upd.status_code == 200 and upd.json()["role"] == "viewer" and upd.json()["isActive"] is False
    # Deactivated user cannot log in.
    assert client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"}).status_code == 403

    rp = client.post(f"/api/platform/users/{uid}/reset-password", headers=super_admin["h"], json={"newPassword": "Rotated123!"})
    assert rp.status_code == 200

    assert client.delete(f"/api/platform/users/{uid}", headers=super_admin["h"]).status_code == 200


def test_create_user_validations(client, super_admin, org):
    org_id = org["org"]["id"]
    # weak password
    assert client.post(
        "/api/platform/users",
        headers=super_admin["h"],
        json={"organizationId": org_id, "name": "X", "email": f"a-{uuid.uuid4().hex[:6]}@x.example.com", "password": "weak", "role": "staff"},
    ).status_code == 422
    # bad role
    assert client.post(
        "/api/platform/users",
        headers=super_admin["h"],
        json={"organizationId": org_id, "name": "Xy", "email": f"b-{uuid.uuid4().hex[:6]}@x.example.com", "password": "Str0ngPass!", "role": "root"},
    ).status_code == 422
    # unknown org
    assert client.post(
        "/api/platform/users",
        headers=super_admin["h"],
        json={"organizationId": "nope", "name": "Xy", "email": f"c-{uuid.uuid4().hex[:6]}@x.example.com", "password": "Str0ngPass!", "role": "staff"},
    ).status_code == 404


# --------------------------------------------------------------------------- #
# Audit (the platform Payments section was removed)
# --------------------------------------------------------------------------- #
def test_audit_logs_and_payments_section_removed(client, super_admin):
    logs = client.get("/api/platform/audit-logs", headers=super_admin["h"])
    assert logs.status_code == 200 and logs.json()["total"] >= 1
    for path in ("/api/platform/payments", "/api/platform/payments/stats", "/api/platform/payments/export"):
        assert client.get(path, headers=super_admin["h"]).status_code == 404


def test_inactive_admin_cannot_use_token(client):
    email, password = _make_admin()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": password}).json()["accessToken"]
    h = auth(token)
    assert client.get("/api/platform/dashboard", headers=h).status_code == 200
    with SessionLocal() as db:
        from sqlalchemy import select

        admin = db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email)).scalar_one()
        admin.is_active = False
        db.commit()
    assert client.get("/api/platform/dashboard", headers=h).status_code == 401
