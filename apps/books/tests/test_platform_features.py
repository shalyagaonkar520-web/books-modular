"""Super-admin panel features: admin management, impersonation, drill-down,
CSV exports, global search and runtime platform settings."""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.db import SessionLocal
from backend.main import app
from backend.models import PlatformAdmin, User
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
# Platform admin management + guards
# --------------------------------------------------------------------------- #
def test_admin_crud_and_self_guards(client, super_admin):
    lst = client.get("/api/platform/admins", headers=super_admin["h"])
    assert lst.status_code == 200 and lst.json()["total"] >= 1

    email = f"newadmin-{uuid.uuid4().hex[:8]}@platform.example.com"
    created = client.post(
        "/api/platform/admins",
        headers=super_admin["h"],
        json={"name": "New Admin", "email": email, "password": "Str0ngPass!"},
    )
    assert created.status_code == 201, created.text
    nid = created.json()["id"]
    assert created.json()["email"] == email and created.json()["isActive"] is True

    # Duplicate email -> 409
    assert client.post(
        "/api/platform/admins", headers=super_admin["h"], json={"name": "Dup", "email": email, "password": "Str0ngPass!"}
    ).status_code == 409
    # Weak password -> 422
    assert client.post(
        "/api/platform/admins",
        headers=super_admin["h"],
        json={"name": "Weak", "email": f"weak-{uuid.uuid4().hex[:6]}@platform.example.com", "password": "weak"},
    ).status_code == 422

    # The new admin can log in.
    assert client.post("/api/platform/auth/login", json={"email": email, "password": "Str0ngPass!"}).status_code == 200

    # Rename + deactivate a non-self admin.
    assert client.patch(f"/api/platform/admins/{nid}", headers=super_admin["h"], json={"name": "Renamed"}).json()["name"] == "Renamed"
    deact = client.patch(f"/api/platform/admins/{nid}", headers=super_admin["h"], json={"isActive": False})
    assert deact.status_code == 200 and deact.json()["isActive"] is False

    me = client.get("/api/platform/me", headers=super_admin["h"]).json()
    # Cannot deactivate or delete yourself.
    assert client.patch(f"/api/platform/admins/{me['id']}", headers=super_admin["h"], json={"isActive": False}).status_code == 400
    assert client.delete(f"/api/platform/admins/{me['id']}", headers=super_admin["h"]).status_code == 400

    # Deleting another admin works and revokes their sessions.
    assert client.delete(f"/api/platform/admins/{nid}", headers=super_admin["h"]).status_code == 200
    assert client.get(f"/api/platform/admins/{nid}", headers=super_admin["h"]).status_code in (404, 405)


def test_change_password(client, super_admin):
    email, pw = _make_admin()
    a = TestClient(app)  # the "current" session
    ta = a.post("/api/platform/auth/login", json={"email": email, "password": pw}).json()["accessToken"]
    b = TestClient(app)  # another session, should be signed out on change
    b.post("/api/platform/auth/login", json={"email": email, "password": pw})
    assert b.post("/api/platform/auth/refresh").status_code == 200

    # Wrong current password -> 400.
    assert a.post(
        "/api/platform/auth/change-password",
        headers=auth(ta),
        json={"currentPassword": "WrongNow1!", "newPassword": "NewPass123!"},
    ).status_code == 400

    ok = a.post(
        "/api/platform/auth/change-password",
        headers=auth(ta),
        json={"currentPassword": pw, "newPassword": "NewPass123!"},
    )
    assert ok.status_code == 200

    # Old password no longer works; new one does.
    assert client.post("/api/platform/auth/login", json={"email": email, "password": pw}).status_code == 401
    assert client.post("/api/platform/auth/login", json={"email": email, "password": "NewPass123!"}).status_code == 200

    # The other session was revoked; the current one still refreshes.
    assert b.post("/api/platform/auth/refresh").status_code == 401
    assert a.post("/api/platform/auth/refresh").status_code == 200


# --------------------------------------------------------------------------- #
# Impersonation
# --------------------------------------------------------------------------- #
def test_impersonation_works_and_is_guarded(client, super_admin):
    ctx = register_org(client, "Impersonated")
    org_id = ctx["org"]["id"]
    user_id = ctx["user"]["id"]

    res = client.post(f"/api/platform/users/{user_id}/impersonate", headers=super_admin["h"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["organization"]["id"] == org_id and body["organization"]["name"]
    assert body["user"]["id"] == user_id
    # No refresh cookie is issued for a support session.
    assert "rb_platform_refresh" not in res.cookies and "rb_refresh" not in res.cookies
    # The minted tenant token actually works against the tenant API.
    assert client.get("/api/items", headers=auth(body["accessToken"])).status_code == 200

    # Employee role cannot be impersonated -> 400.
    emp_email = f"emp-{uuid.uuid4().hex[:8]}@imp.example.com"
    with SessionLocal() as db:
        emp = User(organization_id=org_id, name="An Employee", email=emp_email, password_hash=hash_password("Str0ngPass!"), role="employee")
        db.add(emp)
        db.commit()
        emp_id = emp.id
    assert client.post(f"/api/platform/users/{emp_id}/impersonate", headers=super_admin["h"]).status_code == 400

    # Suspended org -> 400.
    client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": True})
    assert client.post(f"/api/platform/users/{user_id}/impersonate", headers=super_admin["h"]).status_code == 400
    client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": False})


# --------------------------------------------------------------------------- #
# Org drill-down
# --------------------------------------------------------------------------- #
def test_org_drilldown_users_and_invoices(client, super_admin, org):
    org_id = org["org"]["id"]
    inv = client.post(
        "/api/invoices",
        headers=org["h"],
        json={
            "customerId": org["customer"]["id"],
            "date": "2026-09-10",
            "dueDate": "2026-12-31",
            "status": "sent",
            "lines": [{"itemId": org["service"]["id"], "description": "Drilldown work", "quantity": 1, "rate": 3000, "taxRate": 18}],
        },
    )
    assert inv.status_code == 201, inv.text

    users = client.get(f"/api/platform/organizations/{org_id}/users", headers=super_admin["h"])
    assert users.status_code == 200 and users.json()["total"] >= 1

    invoices = client.get(f"/api/platform/organizations/{org_id}/invoices", headers=super_admin["h"])
    assert invoices.status_code == 200 and invoices.json()["total"] >= 1
    row = invoices.json()["items"][0]
    for key in ("id", "number", "customerName", "date", "dueDate", "status", "total", "amountPaid", "balanceDue"):
        assert key in row, f"missing {key}"

    assert client.get("/api/platform/organizations/nope/users", headers=super_admin["h"]).status_code == 404
    assert client.get("/api/platform/organizations/nope/invoices", headers=super_admin["h"]).status_code == 404


# --------------------------------------------------------------------------- #
# CSV exports
# --------------------------------------------------------------------------- #
def _assert_csv(res, expected_header: str):
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in res.headers.get("content-disposition", "")
    assert res.text.splitlines()[0] == expected_header


def test_csv_exports_and_injection_escape(client, super_admin):
    # An organization whose name is a spreadsheet formula.
    res = client.post(
        "/api/platform/organizations",
        headers=super_admin["h"],
        json={"name": "=HACK()", "adminName": "Hack Admin", "adminEmail": "hack-admin@hack.example.com", "adminPassword": "HackAdmin1!"},
    )
    assert res.status_code == 201, res.text

    orgs = client.get("/api/platform/organizations/export", headers=super_admin["h"])
    _assert_csv(orgs, "Name,Suspended,Users,Invoices,Invoiced,Collected,Created")
    # The formula-like name is neutralised with a leading single quote.
    assert "'=HACK()" in orgs.text
    assert "\n=HACK()" not in orgs.text and not orgs.text.startswith("=HACK()")

    users = client.get("/api/platform/users/export", headers=super_admin["h"])
    _assert_csv(users, "Name,Email,Role,Active,Organization,Created")


# --------------------------------------------------------------------------- #
# Global search
# --------------------------------------------------------------------------- #
def test_search(client, super_admin):
    marker = f"Zenithly{uuid.uuid4().hex[:6]}"
    ctx = register_org(client, marker)
    org_name = ctx["org"]["name"]

    res = client.get("/api/platform/search", headers=super_admin["h"], params={"q": marker})
    assert res.status_code == 200
    body = res.json()
    assert any(o["name"] == org_name for o in body["organizations"])
    assert any(u["email"] == ctx["email"] for u in body["users"])

    # Empty q -> empty arrays.
    empty = client.get("/api/platform/search", headers=super_admin["h"], params={"q": ""}).json()
    assert empty["organizations"] == [] and empty["users"] == []


# --------------------------------------------------------------------------- #
# Platform settings + signup toggle
# --------------------------------------------------------------------------- #
def test_settings_and_signup_toggle(client, super_admin):
    g = client.get("/api/platform/settings", headers=super_admin["h"])
    assert g.status_code == 200
    body = g.json()
    assert body["allowPublicSignup"] is True
    assert body["environment"] == "test"
    assert body["smtpConfigured"] is True  # conftest configures SMTP
    assert "razorpayConfigured" in body

    try:
        off = client.put("/api/platform/settings", headers=super_admin["h"], json={"allowPublicSignup": False})
        assert off.status_code == 200 and off.json()["allowPublicSignup"] is False

        blocked = client.post(
            "/api/auth/register",
            json={"name": "Blocked User", "email": "blocked@x.example.com", "password": "Str0ngPass!", "organizationName": "Blocked Co"},
        )
        assert blocked.status_code == 403
    finally:
        on = client.put("/api/platform/settings", headers=super_admin["h"], json={"allowPublicSignup": True})
        assert on.status_code == 200 and on.json()["allowPublicSignup"] is True

    # Public signup works again.
    ctx = register_org(client, "AfterToggle")
    assert ctx["token"]
