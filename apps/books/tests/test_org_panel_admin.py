"""Organization admin-panel logins: separate accounts created by a platform
admin, their own auth, and the panel's user / profile / audit-log endpoints."""

import re
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.db import SessionLocal
from backend.main import app
from backend.models import Organization, OrgPanelAdmin, OrgPanelRefreshToken
from tests.conftest import PANEL_PASSWORD, auth, create_panel_admin, invite_and_accept, platform_admin_headers, register_org


@pytest.fixture
def platform_h(client):
    return platform_admin_headers(client)


@pytest.fixture
def no_smtp():
    """Approve/reject and invites send email; never let it reach a real server."""
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        server = MagicMock()
        mock_smtp.return_value = server
        yield server


@pytest.fixture
def tenant(client, platform_h):
    """A fresh org (one tenant admin) with a panel login."""
    admin = register_org(client, "Panel")
    panel = create_panel_admin(client, platform_h, admin["org"]["id"])
    return {"admin": admin, "h": auth(admin["token"]), "org_id": admin["org"]["id"], "panel": panel, "panel_h": panel["h"]}


def _set_org(org_id: str, **fields) -> None:
    with SessionLocal() as db:
        org = db.get(Organization, org_id)
        for key, value in fields.items():
            setattr(org, key, value)
        db.commit()


def _login(c: TestClient, email: str, password: str = PANEL_PASSWORD):
    return c.post("/api/org-admin/auth/login", json={"email": email, "password": password})


def _new_email(prefix: str = "panel") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@panel.example.com"


# --------------------------------------------------------------------------- #
# Super admin side
# --------------------------------------------------------------------------- #
def test_super_admin_creates_panel_admin_on_approve(client, platform_h, no_smtp):
    admin = register_org(client, "Approve")
    org_id = admin["org"]["id"]
    _set_org(org_id, approval_status="pending")
    email = _new_email()

    # A weak password or a taken email fails the whole approval.
    weak = {"panelAdmin": {"name": "Pat Panel", "email": email, "password": "weakpass"}}
    assert client.post(f"/api/platform/organizations/{org_id}/approve", headers=platform_h, json=weak).status_code == 422
    taken = create_panel_admin(client, platform_h, register_org(client, "Taken")["org"]["id"])["email"]
    dup = {"panelAdmin": {"name": "Pat Panel", "email": taken.upper(), "password": PANEL_PASSWORD}}
    assert client.post(f"/api/platform/organizations/{org_id}/approve", headers=platform_h, json=dup).status_code == 409
    detail = client.get(f"/api/platform/organizations/{org_id}", headers=platform_h).json()
    assert detail["approvalStatus"] == "pending" and detail["panelAdmins"] == []
    assert _login(client, email).status_code == 401

    body = {"panelAdmin": {"name": "Pat Panel", "email": email.upper(), "password": PANEL_PASSWORD}}
    res = client.post(f"/api/platform/organizations/{org_id}/approve", headers=platform_h, json=body)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["approvalStatus"] == "approved"
    [panel] = out["panelAdmins"]
    assert panel["email"] == email and panel["name"] == "Pat Panel" and panel["isActive"] is True
    assert panel["createdBy"].endswith("@platform.example.com") and panel["lastLoginAt"] is None
    assert set(panel) == {"id", "name", "email", "isActive", "lastLoginAt", "createdAt", "createdBy"}
    assert _login(client, email).status_code == 200

    # The approval without a body still works.
    other = register_org(client, "Approve")
    _set_org(other["org"]["id"], approval_status="pending")
    plain = client.post(f"/api/platform/organizations/{other['org']['id']}/approve", headers=platform_h)
    assert plain.status_code == 200 and plain.json()["panelAdmins"] == []


def test_super_admin_manages_panel_admins(client, platform_h, tenant):
    org_id = tenant["org_id"]
    base = f"/api/platform/organizations/{org_id}/panel-admins"
    assert client.get(base, headers=tenant["h"]).status_code == 401
    assert client.get(base, headers=tenant["panel_h"]).status_code == 401
    assert client.get("/api/platform/organizations/nope/panel-admins", headers=platform_h).status_code == 404

    email = _new_email()
    created = client.post(base, headers=platform_h, json={"name": "Second Admin", "email": email, "password": PANEL_PASSWORD})
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert client.post(base, headers=platform_h, json={"name": "Dup", "email": email, "password": PANEL_PASSWORD}).status_code == 409
    assert client.post(base, headers=platform_h, json={"name": "Weak", "email": _new_email(), "password": "alllower1"}).status_code == 422
    # The panel namespace is separate: a tenant user's email is allowed.
    same_as_tenant = client.post(
        base, headers=platform_h, json={"name": "Owner", "email": tenant["admin"]["email"], "password": PANEL_PASSWORD}
    )
    assert same_as_tenant.status_code == 201, same_as_tenant.text

    listed = client.get(base, headers=platform_h).json()
    assert {a["email"] for a in listed} == {tenant["panel"]["email"], email, tenant["admin"]["email"]}

    # Rename / change email; taking another login's email is a conflict.
    new_email = _new_email()
    patched = client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"name": "Renamed", "email": new_email})
    assert patched.status_code == 200 and patched.json()["name"] == "Renamed" and patched.json()["email"] == new_email
    clash = client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"email": tenant["panel"]["email"]})
    assert clash.status_code == 409
    assert client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"password": "short"}).status_code == 422

    # A new password ends the admin's sessions.
    session = TestClient(app)
    assert _login(session, new_email).status_code == 200
    assert session.post("/api/org-admin/auth/refresh").status_code == 200
    reset = client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"password": "Brand3NewPass"})
    assert reset.status_code == 200
    assert session.post("/api/org-admin/auth/refresh").status_code == 401
    assert _login(client, new_email).status_code == 401
    assert _login(client, new_email, "Brand3NewPass").status_code == 200

    # The platform actions land in the org's audit log.
    logs = client.get("/api/org-admin/audit-logs", headers=tenant["panel_h"], params={"entityType": "org_panel_admin"}).json()
    assert any("created by platform admin" in (r["summary"] or "") for r in logs["items"])

    assert client.delete(f"/api/platform/panel-admins/{pid}", headers=platform_h).status_code == 200
    assert client.delete(f"/api/platform/panel-admins/{pid}", headers=platform_h).status_code == 404
    assert _login(client, new_email, "Brand3NewPass").status_code == 401
    detail = client.get(f"/api/platform/organizations/{org_id}", headers=platform_h).json()
    assert pid not in {a["id"] for a in detail["panelAdmins"]}


def test_deactivated_panel_admin_is_locked_out(client, platform_h, tenant):
    session = TestClient(app)
    login = _login(session, tenant["panel"]["email"])
    h = auth(login.json()["accessToken"])
    pid = tenant["panel"]["admin"]["id"]
    res = client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"isActive": False})
    assert res.status_code == 200 and res.json()["isActive"] is False
    assert session.post("/api/org-admin/auth/refresh").status_code == 401
    assert _login(client, tenant["panel"]["email"]).status_code == 401
    assert client.get("/api/org-admin/dashboard", headers=h).status_code == 401

    client.patch(f"/api/platform/panel-admins/{pid}", headers=platform_h, json={"isActive": True})
    assert _login(client, tenant["panel"]["email"]).status_code == 200


# --------------------------------------------------------------------------- #
# Panel auth
# --------------------------------------------------------------------------- #
def test_login_refresh_me_change_password_logout(client, tenant):
    email = tenant["panel"]["email"]
    a = TestClient(app)
    res = _login(a, email.upper())
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {"accessToken", "admin", "organization"}
    assert body["organization"] == {"id": tenant["org_id"], "name": tenant["admin"]["org"]["name"]}
    assert body["admin"]["email"] == email and body["admin"]["organizationId"] == tenant["org_id"]
    assert body["admin"]["lastLoginAt"] is not None
    assert "rb_org_panel_refresh" in res.cookies
    h = auth(body["accessToken"])

    me = client.get("/api/org-admin/me", headers=h)
    assert me.status_code == 200
    assert set(me.json()["admin"]) == {"id", "name", "email", "organizationId", "lastLoginAt", "createdAt"}
    assert me.json()["organization"]["id"] == tenant["org_id"]

    # Wrong password / unknown email share one generic answer.
    for creds in ({"email": email, "password": "Wr0ngPass!"}, {"email": _new_email(), "password": PANEL_PASSWORD}):
        bad = client.post("/api/org-admin/auth/login", json=creds)
        assert bad.status_code == 401 and bad.json()["detail"] == "Invalid email or password"

    # Refresh rotates: the old cookie stops working once it has been used.
    old_cookie = a.cookies.get("rb_org_panel_refresh")
    assert a.post("/api/org-admin/auth/refresh").status_code == 200
    replay = TestClient(app)
    replay.cookies.set("rb_org_panel_refresh", old_cookie)
    assert replay.post("/api/org-admin/auth/refresh").status_code == 401

    b = TestClient(app)  # another session: signed out by the password change
    assert _login(b, email).status_code == 200
    wrong = {"currentPassword": "Wr0ngPass!", "newPassword": "An0therPass!"}
    assert a.post("/api/org-admin/auth/change-password", headers=h, json=wrong).status_code == 400
    weak = {"currentPassword": PANEL_PASSWORD, "newPassword": "alllowercase1"}
    assert a.post("/api/org-admin/auth/change-password", headers=h, json=weak).status_code == 422
    ok = a.post("/api/org-admin/auth/change-password", headers=h, json={"currentPassword": PANEL_PASSWORD, "newPassword": "An0therPass!"})
    assert ok.status_code == 200
    assert b.post("/api/org-admin/auth/refresh").status_code == 401
    assert a.post("/api/org-admin/auth/refresh").status_code == 200
    assert _login(client, email).status_code == 401
    assert _login(client, email, "An0therPass!").status_code == 200

    assert a.post("/api/org-admin/auth/logout").status_code == 200
    assert a.post("/api/org-admin/auth/refresh").status_code == 401
    assert client.post("/api/org-admin/auth/change-password", json=wrong).status_code == 401


@pytest.mark.parametrize(
    "state",
    [
        {"approval_status": "pending"},
        {"approval_status": "rejected", "rejection_reason": "Incomplete"},
        {"is_suspended": True},
        {"is_suspended": True, "deleted_at": "archived"},
    ],
)
def test_login_blocked_while_org_is_not_open(client, tenant, state):
    from datetime import UTC, datetime

    session = TestClient(app)
    token = _login(session, tenant["panel"]["email"]).json()["accessToken"]
    fields = {k: (datetime.now(UTC) if v == "archived" else v) for k, v in state.items()}
    _set_org(tenant["org_id"], **fields)
    try:
        res = _login(client, tenant["panel"]["email"])
        assert res.status_code == 403, res.text
        assert client.get("/api/org-admin/dashboard", headers=auth(token)).status_code == 403
        assert session.post("/api/org-admin/auth/refresh").status_code == 403
        if "deleted_at" in state:
            assert "archived" in res.json()["detail"]
        elif "is_suspended" in state:
            assert "suspended" in res.json()["detail"]
        else:
            assert res.json()["detail"].startswith(("PENDING_APPROVAL", "REGISTRATION_REJECTED"))
    finally:
        _set_org(tenant["org_id"], approval_status="approved", rejection_reason=None, is_suspended=False, deleted_at=None)
    assert _login(client, tenant["panel"]["email"]).status_code == 200


def test_tokens_do_not_cross_between_apps(client, platform_h, tenant):
    for h in (tenant["h"], platform_h):
        assert client.get("/api/org-admin/dashboard", headers=h).status_code == 401
        assert client.get("/api/org-admin/me", headers=h).status_code == 401
    assert client.get("/api/users", headers=tenant["panel_h"]).status_code == 401
    assert client.get("/api/auth/me", headers=tenant["panel_h"]).status_code == 401
    assert client.get("/api/platform/dashboard", headers=tenant["panel_h"]).status_code == 401
    # The same email as a tenant user is a different account: the tenant
    # password does not open the panel and vice versa.
    assert (
        client.post(
            "/api/org-admin/auth/login", json={"email": tenant["admin"]["email"], "password": tenant["admin"]["password"]}
        ).status_code
        == 401
    )


def test_smtp_settings_are_not_exposed(client, tenant):
    assert client.get("/api/org-admin/settings/smtp", headers=tenant["panel_h"]).status_code in (404, 405)
    body = {"host": "smtp.example.com", "port": 587, "username": "x@example.com", "password": "p", "senderName": "X"}
    assert client.put("/api/org-admin/settings/smtp", headers=tenant["panel_h"], json=body).status_code in (404, 405)
    assert client.post("/api/org-admin/settings/smtp/test", headers=tenant["panel_h"], json={"toEmail": "a@example.com"}).status_code in (
        404,
        405,
    )


# --------------------------------------------------------------------------- #
# Panel endpoints
# --------------------------------------------------------------------------- #
def test_panel_sees_only_its_own_organization(client, platform_h, tenant):
    other = register_org(client, "PanelOther")
    create_panel_admin(client, platform_h, other["org"]["id"])
    dash = client.get("/api/org-admin/dashboard", headers=tenant["panel_h"]).json()
    assert dash["organization"]["id"] == tenant["org_id"] and dash["users"]["total"] == 1
    users = client.get("/api/org-admin/users", headers=tenant["panel_h"]).json()
    assert [u["email"] for u in users] == [tenant["admin"]["email"]]
    logs = client.get("/api/org-admin/audit-logs", headers=tenant["panel_h"]).json()
    assert set(logs) >= {"items", "total", "page", "pageSize"} and logs["total"] >= 1
    other_logs = client.get("/api/audit-logs", headers=auth(other["token"])).json()
    mine = {r["id"] for r in logs["items"]}
    assert not mine & {r["id"] for r in other_logs["items"]}
    # Another org's user is not reachable.
    assert (
        client.patch(f"/api/org-admin/users/{other['user']['id']}", headers=tenant["panel_h"], json={"name": "Hacked"}).status_code == 404
    )
    assert client.delete(f"/api/org-admin/users/{other['user']['id']}", headers=tenant["panel_h"]).status_code == 404
    assert client.get("/api/org-admin/organization", headers=tenant["panel_h"]).json()["id"] == tenant["org_id"]


def test_panel_manages_users(client, tenant, no_smtp):
    ph = tenant["panel_h"]
    owner_id = tenant["admin"]["user"]["id"]
    # The organization's only tenant admin cannot be demoted, deactivated or deleted.
    assert client.patch(f"/api/org-admin/users/{owner_id}", headers=ph, json={"role": "viewer"}).status_code == 400
    assert client.patch(f"/api/org-admin/users/{owner_id}", headers=ph, json={"isActive": False}).status_code == 400
    assert client.delete(f"/api/org-admin/users/{owner_id}", headers=ph).status_code == 400

    email = f"invitee-{uuid.uuid4().hex[:6]}@panel.example.com"
    res = client.post("/api/org-admin/users", headers=ph, json={"name": "Ivy Invitee", "email": email, "role": "staff"})
    assert res.status_code == 201, res.text
    invited = res.json()
    assert invited["pendingInvite"] is True and invited["organizationId"] == tenant["org_id"]
    _, _, message = no_smtp.sendmail.call_args[0]
    token = re.search(r"token=([\w\-]+)", message).group(1)
    assert "Pat Panel" in message
    assert client.post("/api/auth/accept-invite", json={"token": token, "password": "Inv1teePass!"}).status_code == 200
    assert client.post("/api/org-admin/users", headers=ph, json={"name": "Dup", "email": email}).status_code == 409

    # Promote the invitee; now the owner may be demoted.
    assert client.patch(f"/api/org-admin/users/{invited['id']}", headers=ph, json={"role": "admin"}).json()["role"] == "admin"
    assert client.patch(f"/api/org-admin/users/{owner_id}", headers=ph, json={"role": "viewer"}).status_code == 200
    assert client.patch(f"/api/org-admin/users/{owner_id}", headers=ph, json={"role": "admin"}).status_code == 200

    # Resetting a password ends the user's sessions and sets the new one.
    session = TestClient(app)
    assert session.post("/api/auth/login", json={"email": email, "password": "Inv1teePass!"}).status_code == 200
    assert client.post(f"/api/org-admin/users/{invited['id']}/reset-password", headers=ph, json={"newPassword": "weak"}).status_code == 422
    reset = client.post(f"/api/org-admin/users/{invited['id']}/reset-password", headers=ph, json={"newPassword": "Res3tPass!"})
    assert reset.status_code == 200
    assert session.post("/api/auth/refresh").status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "Res3tPass!"}).status_code == 200

    # Demote and deactivate, then delete.
    off = client.patch(f"/api/org-admin/users/{invited['id']}", headers=ph, json={"role": "staff", "isActive": False})
    assert off.status_code == 200 and off.json()["isActive"] is False
    assert client.delete(f"/api/org-admin/users/{invited['id']}", headers=ph).json() == {"message": "User deleted"}
    assert [u["id"] for u in client.get("/api/org-admin/users", headers=ph).json()] == [owner_id]

    # Everything is attributed to the panel admin, not to a tenant user.
    logs = client.get("/api/org-admin/audit-logs", headers=ph, params={"entityType": "user", "pageSize": 100}).json()["items"]
    mine = [r for r in logs if r["userName"] == "Pat Panel (org admin panel)"]
    assert len(mine) >= 7 and all(r["userId"] is None for r in mine)
    assert {"create", "update", "delete"} <= {r["action"] for r in mine}


def test_panel_invites_employee_login(client, tenant, no_smtp):
    emp = client.post(
        "/api/payroll/employees",
        headers=tenant["h"],
        json={
            "name": "Eve Employee",
            "email": f"eve-{uuid.uuid4().hex[:6]}@panel.example.com",
            "dateOfJoining": "2026-04-01",
            "basicSalary": 50000,
        },
    )
    assert emp.status_code == 201, emp.text
    ph = tenant["panel_h"]
    no_link = client.post(
        "/api/org-admin/users", headers=ph, json={"name": "Eve Employee", "email": emp.json()["email"], "role": "employee"}
    )
    assert no_link.status_code == 400
    ok = client.post(
        "/api/org-admin/users",
        headers=ph,
        json={"name": "Eve Employee", "email": emp.json()["email"], "role": "employee", "employeeId": emp.json()["id"]},
    )
    assert ok.status_code == 201, ok.text


def test_panel_updates_organization_profile(client, tenant):
    res = client.put("/api/org-admin/organization", headers=tenant["panel_h"], json={"name": "Renamed By Panel", "city": "Bengaluru"})
    assert res.status_code == 200 and res.json()["name"] == "Renamed By Panel"
    assert client.put("/api/org-admin/organization", headers=tenant["panel_h"], json={"name": None}).status_code == 422
    assert client.get("/api/organization", headers=tenant["h"]).json()["city"] == "Bengaluru"
    assert client.get("/api/org-admin/me", headers=tenant["panel_h"]).json()["organization"]["name"] == "Renamed By Panel"
    [entry] = client.get("/api/org-admin/audit-logs", headers=tenant["panel_h"], params={"entityType": "organization"}).json()["items"][:1]
    assert entry["userName"] == "Pat Panel (org admin panel)" and entry["userId"] is None


def test_app_content_via_panel_reaches_only_that_org(client, platform_h, tenant):
    from tests.test_org_admin import DEFAULT, FIRST_TEXT

    other = register_org(client, "PanelOther")
    staff = invite_and_accept(client, tenant["h"], "Sam Staff", f"staff-{uuid.uuid4().hex[:6]}@panel.example.com", "staff", "Str0ngPass!")
    staff_h = auth(client.post("/api/auth/login", json={"email": staff["email"], "password": "Str0ngPass!"}).json()["accessToken"])
    body = {**DEFAULT, "texts": {**DEFAULT["texts"], FIRST_TEXT: "Panel text"}}
    assert client.put("/api/org-admin/app-content", headers=tenant["panel_h"], json=body).status_code == 200
    assert client.get("/api/app-content", headers=staff_h).json()["texts"][FIRST_TEXT] == "Panel text"
    assert client.get("/api/app-content", headers=auth(other["token"])).json()["texts"][FIRST_TEXT] == DEFAULT["texts"][FIRST_TEXT]
    assert client.post("/api/org-admin/app-content/reset", headers=tenant["panel_h"]).status_code == 200
    assert client.get("/api/app-content", headers=staff_h).json() == DEFAULT


def test_permanent_org_delete_removes_panel_admins(client, platform_h, tenant):
    session = TestClient(app)
    assert _login(session, tenant["panel"]["email"]).status_code == 200
    pid = tenant["panel"]["admin"]["id"]
    assert client.delete(f"/api/platform/organizations/{tenant['org_id']}", headers=platform_h).status_code == 200
    with SessionLocal() as db:
        assert db.get(OrgPanelAdmin, pid) is None
        assert db.query(OrgPanelRefreshToken).filter(OrgPanelRefreshToken.admin_id == pid).count() == 0
    assert _login(client, tenant["panel"]["email"]).status_code == 401
    assert client.get("/api/org-admin/dashboard", headers=tenant["panel_h"]).status_code == 401
