"""The Employee portal role: invited employees see only their own payslips
and profile, and nothing else in the app - not even the org profile."""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import auth, invite_and_accept, register_org


@pytest.fixture
def portal(client):
    """An org with two employees, one of them invited and logged into the portal."""
    ctx = register_org(client, "Portal")
    h = auth(ctx["token"])
    # User.email is globally unique, and this fixture runs once per test that
    # uses it, so give each run its own address.
    email = f"priya-{uuid.uuid4().hex[:8]}@portal.example.com"

    priya = client.post(
        "/api/payroll/employees",
        headers=h,
        json={"name": "Priya Nair", "email": email, "dateOfJoining": "2026-01-01", "basicSalary": 40000},
    ).json()
    rahul = client.post(
        "/api/payroll/employees",
        headers=h,
        json={"name": "Rahul Iyer", "dateOfJoining": "2026-01-01", "basicSalary": 30000},
    ).json()

    invite_and_accept(client, h, "Priya Nair", email, "employee", "Employee1234", employee_id=priya["id"])
    login = client.post("/api/auth/login", json={"email": email, "password": "Employee1234"}).json()
    eh = auth(login["accessToken"])

    return {"h": h, "eh": eh, "priya": priya, "rahul": rahul}


def test_employee_can_only_see_own_profile_and_payslips(portal, client):
    h, eh, priya = portal["h"], portal["eh"], portal["priya"]

    me = client.get("/api/me/employee", headers=eh)
    assert me.status_code == 200
    assert me.json()["id"] == priya["id"] and me.json()["name"] == "Priya Nair"

    # No pay run yet.
    assert client.get("/api/me/payslips", headers=eh).json() == []

    # Run payroll for both employees, approve it so it becomes visible.
    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 8}).json()
    client.post(f"/api/payroll/pay-runs/{run['id']}/approve", headers=h)

    slips = client.get("/api/me/payslips", headers=eh).json()
    assert len(slips) == 1
    assert slips[0]["employeeId"] == priya["id"]

    # Hours logged against Priya's own account show up read-only; nothing else does.
    priya_user_id = client.get("/api/auth/me", headers=eh).json()["user"]["id"]
    project = client.post("/api/projects", headers=h, json={"name": "Website Revamp"}).json()
    client.post(
        "/api/time-entries", headers=h,
        json={"projectId": project["id"], "userId": priya_user_id, "date": "2026-08-05", "hours": 4},
    )
    entries = client.get("/api/me/time-entries", headers=eh).json()
    assert len(entries) == 1 and entries[0]["hours"] == 4


def test_employee_is_blocked_from_the_rest_of_the_app(portal, client):
    eh = portal["eh"]
    # The main app, company data, and even the org profile are all off-limits.
    assert client.get("/api/items", headers=eh).status_code == 403
    assert client.get("/api/dashboard/summary", headers=eh).status_code == 403
    assert client.get("/api/payroll/employees", headers=eh).status_code == 403
    assert client.get("/api/organization", headers=eh).status_code == 403
    assert client.get("/api/accounting/accounts", headers=eh).status_code == 403
    assert client.get("/api/banking/accounts", headers=eh).status_code == 403
    # But their own session management still works.
    assert client.get("/api/auth/me", headers=eh).status_code == 200
    assert client.post("/api/auth/logout", headers=eh).status_code == 200


def test_invite_as_employee_requires_and_validates_employee_id(client):
    ctx = register_org(client, "PortalValidation")
    h = auth(ctx["token"])
    emp = client.post(
        "/api/payroll/employees", headers=h, json={"name": "Kiran", "dateOfJoining": "2026-01-01", "basicSalary": 25000}
    ).json()

    # Missing employee_id.
    assert client.post("/api/users", headers=h, json={"name": "Kiran", "email": "kiran@portal.example.com", "role": "employee"}).status_code == 400

    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_smtp.return_value = MagicMock()
        first = client.post(
            "/api/users", headers=h,
            json={"name": "Kiran", "email": "kiran@portal.example.com", "role": "employee", "employeeId": emp["id"]},
        )
        assert first.status_code == 201, first.text

        # That employee already has portal access - inviting them again is rejected.
        again = client.post(
            "/api/users", headers=h,
            json={"name": "Kiran 2", "email": "kiran2@portal.example.com", "role": "employee", "employeeId": emp["id"]},
        )
        assert again.status_code == 409

    unlinked = client.get("/api/payroll/employees/unlinked", headers=h).json()
    assert emp["id"] not in [e["id"] for e in unlinked]

    linked = next(e for e in client.get("/api/payroll/employees", headers=h).json() if e["id"] == emp["id"])
    assert linked["hasLogin"] is True
