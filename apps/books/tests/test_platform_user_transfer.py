"""Platform user editing: email changes, moving users between orgs, last-admin guard."""

import uuid

import pytest

from backend.db import SessionLocal
from backend.models import PlatformAdmin
from backend.security import hash_password
from tests.conftest import auth, invite_and_accept, register_org


@pytest.fixture
def ph(client):
    email = f"mover-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="Mover", email=email, password_hash=hash_password("MoverAdmin1!"), is_active=True))
        db.commit()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": "MoverAdmin1!"}).json()["accessToken"]
    return auth(token)


def _user_id(client, h):
    return client.get("/api/auth/me", headers=h).json()["user"]["id"]


def test_move_user_to_another_org_signs_them_out(client, ph):
    src = register_org(client, "MoveSrc")
    dst = register_org(client, "MoveDst")
    email = f"mover-staff-{uuid.uuid4().hex[:6]}@movesrc.example.com"
    invite_and_accept(client, auth(src["token"]), "Move Me", email, "staff", "MoveMe123!")
    login = client.post("/api/auth/login", json={"email": email, "password": "MoveMe123!"})
    assert login.status_code == 200
    uid = login.json()["user"]["id"]

    res = client.patch(f"/api/platform/users/{uid}", headers=ph, json={"organizationId": dst["org"]["id"]})
    assert res.status_code == 200, res.text
    assert res.json()["organizationId"] == dst["org"]["id"]

    # The refresh cookie from before the move no longer works...
    assert client.post("/api/auth/refresh").status_code == 401
    # ...and a fresh login lands in the new org.
    again = client.post("/api/auth/login", json={"email": email, "password": "MoveMe123!"})
    assert again.status_code == 200 and again.json()["organization"]["id"] == dst["org"]["id"]

    # Both orgs' audit trails record the move.
    for org_id in (src["org"]["id"], dst["org"]["id"]):
        logs = client.get("/api/platform/audit-logs", headers=ph, params={"organization_id": org_id}).json()["items"]
        assert any("moved from" in (log["summary"] or "") for log in logs)


def test_email_change_and_duplicate(client, ph):
    ctx = register_org(client, "Emailer")
    email = f"old-{uuid.uuid4().hex[:6]}@emailer.example.com"
    invite_and_accept(client, auth(ctx["token"]), "Email Guy", email, "staff", "EmailGuy1!")
    uid = client.post("/api/auth/login", json={"email": email, "password": "EmailGuy1!"}).json()["user"]["id"]

    new_email = f"new-{uuid.uuid4().hex[:6]}@emailer.example.com"
    assert client.patch(f"/api/platform/users/{uid}", headers=ph, json={"email": new_email}).status_code == 200
    assert client.post("/api/auth/login", json={"email": new_email, "password": "EmailGuy1!"}).status_code == 200
    # Someone else's email is refused.
    assert client.patch(f"/api/platform/users/{uid}", headers=ph, json={"email": ctx["email"]}).status_code == 409


@pytest.mark.parametrize(
    "change",
    [
        {"role": "staff"},
        {"isActive": False},
        "move",
    ],
)
def test_only_active_admin_cannot_be_demoted_deactivated_or_moved(client, ph, change):
    ctx = register_org(client, "SoleAdmin")
    other = register_org(client, "SoleAdminDst")
    uid = _user_id(client, auth(ctx["token"]))
    body = {"organizationId": other["org"]["id"]} if change == "move" else change
    res = client.patch(f"/api/platform/users/{uid}", headers=ph, json=body)
    assert res.status_code == 400 and "only active admin" in res.json()["detail"]


def test_only_active_admin_cannot_be_deleted_but_can_once_another_exists(client, ph):
    ctx = register_org(client, "SoleDel")
    uid = _user_id(client, auth(ctx["token"]))
    assert client.delete(f"/api/platform/users/{uid}", headers=ph).status_code == 400
    # With a second admin in place, the change is allowed.
    created = client.post(
        "/api/platform/users",
        headers=ph,
        json={"organizationId": ctx["org"]["id"], "name": "Second Admin", "email": f"second-{uuid.uuid4().hex[:6]}@soledel.example.com", "password": "SecondAdmin1!", "role": "admin"},
    )
    assert created.status_code == 201, created.text
    assert client.patch(f"/api/platform/users/{uid}", headers=ph, json={"role": "staff"}).status_code == 200


def test_employee_portal_user_cannot_be_moved(client, ph):
    ctx = register_org(client, "EmpMove")
    other = register_org(client, "EmpMoveDst")
    h = auth(ctx["token"])
    email = f"emp-{uuid.uuid4().hex[:6]}@empmove.example.com"
    emp = client.post("/api/payroll/employees", headers=h, json={"name": "Emp Loyee", "email": email, "dateOfJoining": "2026-01-01", "basicSalary": 30000}).json()
    invite_and_accept(client, h, "Emp Loyee", email, "employee", "EmpLoyee1!", employee_id=emp["id"])
    uid = client.post("/api/auth/login", json={"email": email, "password": "EmpLoyee1!"}).json()["user"]["id"]
    res = client.patch(f"/api/platform/users/{uid}", headers=ph, json={"organizationId": other["org"]["id"]})
    assert res.status_code == 400 and "can't be moved" in res.json()["detail"]
