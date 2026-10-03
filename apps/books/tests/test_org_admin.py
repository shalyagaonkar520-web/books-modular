"""Organization admin panel scope: dashboard, users, organization profile and activity log - no app content."""

import uuid

import pytest

from tests.conftest import auth, create_panel_admin, invite_and_accept, platform_admin_headers, register_org


@pytest.fixture
def tenant(client):
    admin = register_org(client, "OrgAdmin")
    h = auth(admin["token"])
    tag = uuid.uuid4().hex[:6]
    staff = invite_and_accept(client, h, "Sam Staff", f"staff-{tag}@orgadmin.example.com", "staff", "Str0ngPass!")
    login = client.post("/api/auth/login", json={"email": staff["email"], "password": "Str0ngPass!"})
    assert login.status_code == 200, login.text
    panel = create_panel_admin(client, platform_admin_headers(client), admin["org"]["id"])
    return {"admin": admin, "h": h, "staff_h": auth(login.json()["accessToken"]), "panel_h": panel["h"]}


def test_only_panel_logins_can_use_the_panel(client, tenant):
    assert client.get("/api/org-admin/users").status_code == 401
    # Tenant sessions - even the organization's own tenant admin - are rejected.
    for h in (tenant["h"], tenant["staff_h"]):
        for path in ("/api/org-admin/users", "/api/org-admin/organization"):
            assert client.get(path, headers=h).status_code == 401


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/api/org-admin/app-content"),
        ("put", "/api/org-admin/app-content"),
        ("post", "/api/org-admin/app-content/reset"),
    ],
)
def test_panel_has_no_app_content(client, tenant, method, path):
    # App content (and with it the modules of the subscription plan) is the platform admin's.
    assert getattr(client, method)(path, headers=tenant["panel_h"]).status_code in (404, 405)


def test_dashboard_counts_users_and_employees_of_this_organization_only(client, tenant):
    h = tenant["h"]
    for name, dept, active in (("Asha", "Sales", True), ("Bala", "Sales", True), ("Chitra", None, False)):
        emp = client.post(
            "/api/payroll/employees",
            headers=h,
            json={"name": f"{name} Kumar", "department": dept, "dateOfJoining": "2026-04-01", "basicSalary": 40000},
        )
        assert emp.status_code == 201, emp.text
        if not active:
            assert client.put(f"/api/payroll/employees/{emp.json()['id']}", headers=h, json={"isActive": False}).status_code == 200
    other = register_org(client, "OtherOrg")
    client.post(
        "/api/payroll/employees",
        headers=auth(other["token"]),
        json={"name": "Elsewhere", "dateOfJoining": "2026-04-01", "basicSalary": 1},
    )

    res = client.get("/api/org-admin/dashboard", headers=tenant["panel_h"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["organizationName"] == tenant["admin"]["org"]["name"]
    assert body["users"] | {"signedInLast30Days": 0} == {
        "total": 2,
        "active": 2,
        "suspended": 0,
        "pendingInvites": 0,
        "byRole": {"admin": 1, "staff": 1},
        "signedInLast30Days": 0,
    }
    assert body["employees"] == {
        "total": 3,
        "active": 2,
        "inactive": 1,
        "withLogin": 0,
        "joinedLast30Days": body["employees"]["joinedLast30Days"],
        "byDepartment": {"Sales": 2},
    }
    assert len(body["recentEmployees"]) == 3 and "basicSalary" not in body["recentEmployees"][0]
    assert {u["email"] for u in body["recentUsers"]} >= {tenant["admin"]["email"]}
    assert other["email"] not in {u["email"] for u in body["recentUsers"]}
    assert body["activityLast7Days"] >= 1 and body["recentActivity"]


def test_full_activity_log_is_paged_and_scoped(client, tenant):
    other = register_org(client, "OtherOrg")
    res = client.get("/api/org-admin/audit-logs", headers=tenant["panel_h"], params={"pageSize": 100})
    assert res.status_code == 200, res.text
    logs = res.json()
    assert set(logs) >= {"items", "total", "page", "pageSize"} and logs["total"] >= 1
    other_ids = {r["id"] for r in client.get("/api/audit-logs", headers=auth(other["token"])).json()["items"]}
    assert not {r["id"] for r in logs["items"]} & other_ids
    users_only = client.get("/api/org-admin/audit-logs", headers=tenant["panel_h"], params={"entity_type": "user"}).json()
    assert all(r["entityType"] == "user" for r in users_only["items"])


def test_user_overview_shows_profile_performance_and_pending(client, tenant):
    staff_h = tenant["staff_h"]
    customer = client.post("/api/contacts", headers=staff_h, json={"type": "customer", "displayName": "Acme Overview"}).json()
    line = {"description": "Consulting", "quantity": 1, "rate": 1000, "taxRate": 0}
    base = {"customerId": customer["id"], "date": "2026-01-01", "dueDate": "2026-01-15", "lines": [line]}
    assert client.post("/api/invoices", headers=staff_h, json={**base, "status": "sent"}).status_code == 201
    assert client.post("/api/invoices", headers=staff_h, json={**base, "status": "draft"}).status_code == 201

    users = client.get("/api/org-admin/users", headers=tenant["panel_h"]).json()
    staff_id = next(u["id"] for u in users if u["role"] == "staff")
    res = client.get(f"/api/org-admin/users/{staff_id}/overview", headers=tenant["panel_h"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["user"]["role"] == "staff" and body["employee"] is None
    perf = body["performance"]
    assert perf["invoicesRaised"] == 1 and perf["invoicedAmount"] == 1000 and perf["collectedAmount"] == 0
    assert perf["actionsLast30Days"] >= 2 and perf["lastActive"]
    pending = body["pending"]
    assert pending["draftInvoices"] == 1 and pending["openInvoices"] == 1 and pending["overdueInvoices"] == 1
    assert pending["outstandingAmount"] == 1000
    assert [i["status"] for i in pending["invoices"]] == ["overdue", "draft"]
    assert body["recentActivity"]

    # Another organization's user is not reachable.
    other = register_org(client, "OtherOrg")
    assert client.get(f"/api/org-admin/users/{other['user']['id']}/overview", headers=tenant["panel_h"]).status_code == 404


def _staff_id(client, tenant):
    return next(u["id"] for u in client.get("/api/org-admin/users", headers=tenant["panel_h"]).json() if u["role"] == "staff")


def test_panel_limits_what_a_staff_user_can_edit(client, tenant):
    staff_id, ph, staff_h = _staff_id(client, tenant), tenant["panel_h"], tenant["staff_h"]
    url = f"/api/org-admin/users/{staff_id}/module-access"

    res = client.put(url, headers=ph, json={"modules": ["customers", "invoices"]})
    assert res.status_code == 200 and res.json()["moduleAccess"] == ["customers", "invoices"]
    overview = client.get(f"/api/org-admin/users/{staff_id}/overview", headers=ph).json()
    assert overview["user"]["moduleAccess"] == ["customers", "invoices"] and overview["planModules"] is None

    refused = client.post("/api/items", headers=staff_h, json={"name": "Widget", "sku": f"W-{uuid.uuid4().hex[:6]}"})
    assert refused.status_code == 403 and "edit access" in refused.json()["detail"]
    assert client.get("/api/items", headers=staff_h).status_code == 200  # reading stays open
    assert client.post("/api/contacts", headers=staff_h, json={"type": "customer", "displayName": "Allowed Ltd"}).status_code == 201
    # Admins are never limited by it.
    assert client.post("/api/items", headers=tenant["h"], json={"name": "Widget", "sku": f"W-{uuid.uuid4().hex[:6]}"}).status_code == 201

    assert client.put(url, headers=ph, json={"modules": None}).json()["moduleAccess"] is None
    assert client.post("/api/items", headers=staff_h, json={"name": "Widget", "sku": f"W-{uuid.uuid4().hex[:6]}"}).status_code == 201

    assert client.put(url, headers=ph, json={"modules": ["nope"]}).status_code == 422
    admin_id = tenant["admin"]["user"]["id"]
    assert client.put(f"/api/org-admin/users/{admin_id}/module-access", headers=ph, json={"modules": []}).status_code == 400
    other = register_org(client, "OtherOrg")
    assert client.put(f"/api/org-admin/users/{other['user']['id']}/module-access", headers=ph, json={"modules": []}).status_code == 404


def test_module_access_is_limited_to_the_plan(client, tenant):
    platform_h = platform_admin_headers(client)
    org_id = tenant["admin"]["org"]["id"]
    accepted = client.post(f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_h, json={"modules": ["invoices"]})
    assert accepted.status_code == 200, accepted.text
    staff_id, ph = _staff_id(client, tenant), tenant["panel_h"]

    assert client.get(f"/api/org-admin/users/{staff_id}/overview", headers=ph).json()["planModules"] == ["customers", "invoices"]
    res = client.put(f"/api/org-admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices", "payroll"]})
    assert res.status_code == 400 and "payroll" in res.json()["detail"]
    assert client.put(f"/api/org-admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices"]}).status_code == 200


def test_panel_shows_razorpay_status_and_syncs_but_cannot_change_keys(client, tenant):
    ph = tenant["panel_h"]
    status = client.get("/api/org-admin/integrations/razorpay", headers=ph)
    assert status.status_code == 200, status.text
    assert {"configured", "transactions_imported", "last_sync"} <= set(status.json())
    sync = client.post("/api/org-admin/integrations/razorpay/sync", headers=ph, json={})
    assert sync.status_code == 200 and "success" in sync.json()
    assert client.post("/api/org-admin/integrations/razorpay/connect", headers=ph, json={}).status_code in (404, 405)
    # Tenant sessions cannot use the panel's endpoints.
    assert client.get("/api/org-admin/integrations/razorpay", headers=tenant["h"]).status_code == 401
