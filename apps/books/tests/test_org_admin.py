"""Organization admin panel: dashboard, users, organization profile, activity log and the app content it is allowed to edit."""

import uuid

import pytest

from backend.services import module_pricing
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

    plan = sorted(module_pricing.resolve([*module_pricing.core_keys(), "invoices"]))
    assert client.get(f"/api/org-admin/users/{staff_id}/overview", headers=ph).json()["planModules"] == plan
    res = client.put(f"/api/org-admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices", "payroll"]})
    assert res.status_code == 400 and "payroll" in res.json()["detail"]
    assert client.put(f"/api/org-admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices"]}).status_code == 200


def test_panel_has_no_integrations(client, tenant):
    ph = tenant["panel_h"]
    assert client.get("/api/org-admin/integrations/razorpay", headers=ph).status_code == 404
    assert client.post("/api/org-admin/integrations/razorpay/sync", headers=ph, json={}).status_code == 404


def test_custom_invite_sets_the_modules_a_staff_user_can_edit(client, tenant):
    from unittest.mock import MagicMock, patch

    ph = tenant["panel_h"]
    assert client.get("/api/org-admin/plan-modules", headers=ph).json() == {"planModules": None}

    def invite(**body):
        with patch("backend.services.email_service.smtplib.SMTP") as smtp:
            smtp.return_value = MagicMock()
            email = f"custom-{uuid.uuid4().hex[:6]}@orgadmin.example.com"
            return client.post("/api/org-admin/users", headers=ph, json={"name": "Cara Custom", "email": email, **body})

    res = invite(role="staff", moduleAccess=["invoices", "customers"])
    assert res.status_code == 201, res.text
    assert res.json()["role"] == "staff" and res.json()["moduleAccess"] == ["customers", "invoices"]

    assert invite(role="viewer", moduleAccess=["invoices"]).status_code == 400
    assert invite(role="staff", moduleAccess=[]).status_code == 400
    assert invite(role="staff", moduleAccess=["nope"]).status_code == 422

    # Once a plan is accepted, only its modules can be granted.
    org_id = tenant["admin"]["org"]["id"]
    client.post(
        f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_admin_headers(client), json={"modules": ["invoices"]}
    )
    plan = sorted(module_pricing.resolve([*module_pricing.core_keys(), "invoices"]))
    assert client.get("/api/org-admin/plan-modules", headers=ph).json() == {"planModules": plan}
    outside = invite(role="staff", moduleAccess=["invoices", "payroll"])
    assert outside.status_code == 400 and "payroll" in outside.json()["detail"]


def test_panel_edits_only_the_app_content_the_platform_admin_allows(client, tenant):
    import json as _json
    from pathlib import Path

    default_doc = _json.loads(
        (Path(__file__).resolve().parent.parent / "backend" / "content" / "app_content_default.json").read_text(encoding="utf-8")
    )
    platform_h = platform_admin_headers(client)
    org_id = tenant["admin"]["org"]["id"]
    ph = tenant["panel_h"]
    staff_h = tenant["staff_h"]

    # Plan: invoices (+ the core modules). By default the panel may edit exactly those modules.
    plan = module_pricing.resolve([*module_pricing.core_keys(), "invoices"])
    client.post(f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_h, json={"modules": ["invoices"]})
    access = client.get(f"/api/platform/organizations/{org_id}/panel-content-access", headers=platform_h).json()
    assert access["modules"] == plan and access["isDefault"] is True and access["branding"] is False
    out = client.get("/api/org-admin/app-content", headers=ph).json()
    assert out["editable"]["modules"] == plan and out["editable"]["general"] is False

    body = _json.loads(_json.dumps(out["content"]))
    inv_key = next(k for k in default_doc["texts"] if k.startswith("invoices."))
    pay_key = next(k for k in default_doc["texts"] if k.startswith("payroll."))
    gen_key = next(k for k in default_doc["texts"] if k.startswith("dashboard."))
    body["texts"][inv_key] = "Bills to customers"
    body["texts"][pay_key] = "Not allowed"
    body["texts"][gen_key] = "Not allowed either"
    body["branding"]["appName"] = "Hacked Name"
    body["modules"] = {k: True for k in body["modules"]}
    assert client.put("/api/org-admin/app-content", headers=ph, json=body).status_code == 200
    seen = client.get("/api/app-content", headers=staff_h).json()
    assert seen["texts"][inv_key] == "Bills to customers"
    assert seen["texts"][pay_key] == default_doc["texts"][pay_key]
    assert seen["texts"][gen_key] == default_doc["texts"][gen_key]
    assert seen["branding"]["appName"] != "Hacked Name"
    assert {k for k, on in seen["modules"].items() if on} == set(plan)

    # The platform admin grants more (e.g. after an upgrade): payroll texts and branding.
    granted = client.put(
        f"/api/platform/organizations/{org_id}/panel-content-access", headers=platform_h, json={"keys": ["invoices", "payroll", "branding"]}
    )
    assert granted.status_code == 200 and granted.json()["isDefault"] is False
    assert (
        client.put(f"/api/platform/organizations/{org_id}/panel-content-access", headers=platform_h, json={"keys": ["nope"]}).status_code
        == 422
    )
    assert client.put("/api/org-admin/app-content", headers=ph, json=body).status_code == 200
    seen = client.get("/api/app-content", headers=staff_h).json()
    assert seen["texts"][pay_key] == "Not allowed" and seen["branding"]["appName"] == "Hacked Name"
    # Payroll is not in the plan, so its switch stays off even though its texts are editable.
    assert seen["modules"]["payroll"] is False

    # Reset puts back only what the panel may edit.
    assert client.post("/api/org-admin/app-content/reset", headers=ph).status_code == 200
    seen = client.get("/api/app-content", headers=staff_h).json()
    assert seen["texts"][pay_key] == default_doc["texts"][pay_key] and seen["branding"]["appName"] == default_doc["branding"]["appName"]
    # Back to the plan default.
    back = client.put(f"/api/platform/organizations/{org_id}/panel-content-access", headers=platform_h, json={"keys": None})
    assert back.json()["isDefault"] is True and back.json()["modules"] == plan
    # Tenant sessions cannot use either side.
    assert client.get("/api/org-admin/app-content", headers=tenant["h"]).status_code == 401
    assert client.get(f"/api/platform/organizations/{org_id}/panel-content-access", headers=tenant["h"]).status_code == 401
