"""The Admin console: overview, users, the change log, sign-in history and the app content the organization may edit."""

import uuid

import pytest

from backend.services import module_pricing
from tests.conftest import auth, invite_and_accept, platform_admin_headers, register_org


@pytest.fixture
def tenant(client):
    admin = register_org(client, "OrgAdmin")
    h = auth(admin["token"])
    tag = uuid.uuid4().hex[:6]
    staff = invite_and_accept(client, h, "Sam Staff", f"staff-{tag}@orgadmin.example.com", "staff", "Str0ngPass!")
    login = client.post("/api/auth/login", json={"email": staff["email"], "password": "Str0ngPass!"})
    assert login.status_code == 200, login.text
    return {"admin": admin, "h": h, "staff_h": auth(login.json()["accessToken"]), "panel_h": h}


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

    res = client.get("/api/admin/dashboard", headers=tenant["panel_h"])
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
    res = client.get("/api/audit-logs", headers=tenant["panel_h"], params={"pageSize": 100})
    assert res.status_code == 200, res.text
    logs = res.json()
    assert set(logs) >= {"items", "total", "page", "pageSize"} and logs["total"] >= 1
    other_ids = {r["id"] for r in client.get("/api/audit-logs", headers=auth(other["token"])).json()["items"]}
    assert not {r["id"] for r in logs["items"]} & other_ids
    users_only = client.get("/api/audit-logs", headers=tenant["panel_h"], params={"entity_type": "user"}).json()
    assert all(r["entityType"] == "user" for r in users_only["items"])


def test_user_overview_shows_profile_performance_and_pending(client, tenant):
    staff_h = tenant["staff_h"]
    customer = client.post("/api/contacts", headers=staff_h, json={"type": "customer", "displayName": "Acme Overview"}).json()
    line = {"description": "Consulting", "quantity": 1, "rate": 1000, "taxRate": 0}
    base = {"customerId": customer["id"], "date": "2026-01-01", "dueDate": "2026-01-15", "lines": [line]}
    assert client.post("/api/invoices", headers=staff_h, json={**base, "status": "sent"}).status_code == 201
    assert client.post("/api/invoices", headers=staff_h, json={**base, "status": "draft"}).status_code == 201

    users = client.get("/api/users", headers=tenant["panel_h"]).json()
    staff_id = next(u["id"] for u in users if u["role"] == "staff")
    res = client.get(f"/api/admin/users/{staff_id}/overview", headers=tenant["panel_h"])
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
    assert client.get(f"/api/admin/users/{other['user']['id']}/overview", headers=tenant["panel_h"]).status_code == 404


def _staff_id(client, tenant):
    return next(u["id"] for u in client.get("/api/users", headers=tenant["panel_h"]).json() if u["role"] == "staff")


def test_panel_limits_what_a_staff_user_can_edit(client, tenant):
    staff_id, ph, staff_h = _staff_id(client, tenant), tenant["panel_h"], tenant["staff_h"]
    url = f"/api/admin/users/{staff_id}/module-access"

    res = client.put(url, headers=ph, json={"modules": ["customers", "invoices"]})
    assert res.status_code == 200 and res.json()["moduleAccess"] == ["customers", "invoices"]
    overview = client.get(f"/api/admin/users/{staff_id}/overview", headers=ph).json()
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
    assert client.put(f"/api/admin/users/{admin_id}/module-access", headers=ph, json={"modules": []}).status_code == 400
    other = register_org(client, "OtherOrg")
    assert client.put(f"/api/admin/users/{other['user']['id']}/module-access", headers=ph, json={"modules": []}).status_code == 404


def test_module_access_is_limited_to_the_plan(client, tenant):
    platform_h = platform_admin_headers(client)
    org_id = tenant["admin"]["org"]["id"]
    accepted = client.post(f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_h, json={"modules": ["invoices"]})
    assert accepted.status_code == 200, accepted.text
    staff_id, ph = _staff_id(client, tenant), tenant["panel_h"]

    plan = sorted(module_pricing.resolve([*module_pricing.core_keys(), "invoices"]))
    assert client.get(f"/api/admin/users/{staff_id}/overview", headers=ph).json()["planModules"] == plan
    res = client.put(f"/api/admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices", "payroll"]})
    assert res.status_code == 400 and "payroll" in res.json()["detail"]
    assert client.put(f"/api/admin/users/{staff_id}/module-access", headers=ph, json={"modules": ["invoices"]}).status_code == 200


def test_custom_invite_sets_the_modules_a_staff_user_can_edit(client, tenant):
    from unittest.mock import MagicMock, patch

    ph = tenant["panel_h"]
    assert client.get("/api/plan-modules", headers=ph).json() == {"planModules": None}

    def invite(**body):
        with patch("backend.services.email_service.smtplib.SMTP") as smtp:
            smtp.return_value = MagicMock()
            email = f"custom-{uuid.uuid4().hex[:6]}@orgadmin.example.com"
            return client.post("/api/users", headers=ph, json={"name": "Cara Custom", "email": email, **body})

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
    assert client.get("/api/plan-modules", headers=ph).json() == {"planModules": plan}
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
    out = client.get("/api/admin/app-content", headers=ph).json()
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
    assert client.put("/api/admin/app-content", headers=ph, json=body).status_code == 200
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
    assert client.put("/api/admin/app-content", headers=ph, json=body).status_code == 200
    seen = client.get("/api/app-content", headers=staff_h).json()
    assert seen["texts"][pay_key] == "Not allowed" and seen["branding"]["appName"] == "Hacked Name"
    # Payroll is not in the plan, so its switch stays off even though its texts are editable.
    assert seen["modules"]["payroll"] is False

    # Reset puts back only what the panel may edit.
    assert client.post("/api/admin/app-content/reset", headers=ph).status_code == 200
    seen = client.get("/api/app-content", headers=staff_h).json()
    assert seen["texts"][pay_key] == default_doc["texts"][pay_key] and seen["branding"]["appName"] == default_doc["branding"]["appName"]
    # Back to the plan default.
    back = client.put(f"/api/platform/organizations/{org_id}/panel-content-access", headers=platform_h, json={"keys": None})
    assert back.json()["isDefault"] is True and back.json()["modules"] == plan
    # Staff cannot use the console; tenant sessions never reach the platform side.
    assert client.get("/api/admin/app-content", headers=staff_h).status_code == 403
    assert client.get(f"/api/platform/organizations/{org_id}/panel-content-access", headers=tenant["h"]).status_code == 401


def _login(client, email, password):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return auth(res.json()["accessToken"])


def _staff_email(client, tenant):
    return client.get(f"/api/admin/users/{_staff_id(client, tenant)}/overview", headers=tenant["h"]).json()["user"]["email"]


def test_only_admins_open_the_console(client, tenant):
    assert client.get("/api/admin/dashboard").status_code == 401
    for path in ("/api/admin/dashboard", "/api/admin/changes", "/api/admin/security/logins", "/api/admin/security/sessions"):
        assert client.get(path, headers=tenant["staff_h"]).status_code == 403
        assert client.get(path, headers=tenant["h"]).status_code == 200


def test_every_change_is_logged_down_to_one_rupee(client, tenant):
    h = tenant["h"]
    item = client.post("/api/items", headers=h, json={"name": "Chai", "sku": "CHAI-1", "type": "goods", "sellingPrice": 50, "taxRate": 5})
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]
    assert client.put(f"/api/items/{item_id}", headers=tenant["staff_h"], json={"sellingPrice": 51}).status_code == 200

    changes = client.get("/api/admin/changes", headers=h, params={"entity_type": "items"}).json()["items"]
    update = next(c for c in changes if c["action"] == "update" and c["entityId"] == item_id)
    assert update["changes"]["selling_price"] == ["50", "51"]
    assert update["userName"] == "Sam Staff" and update["userRole"] == "staff" and update["entityLabel"] == "Chai"
    created = next(c for c in changes if c["action"] == "create" and c["entityId"] == item_id)
    assert created["userRole"] == "admin" and created["changes"]["name"] == [None, "Chai"]
    # The whole history of the record, oldest first; filters by user and kind.
    history = client.get(f"/api/admin/changes/items/{item_id}", headers=h).json()
    assert [c["action"] for c in history][:2] == ["create", "update"]
    staff_id = _staff_id(client, tenant)
    mine = client.get("/api/admin/changes", headers=h, params={"user_id": staff_id}).json()["items"]
    assert mine and all(c["userId"] == staff_id for c in mine)
    assert "items" in client.get("/api/admin/changes/types", headers=h).json()
    # Passwords never show.
    client.post(
        "/api/auth/change-password", headers=tenant["staff_h"], json={"currentPassword": "Str0ngPass!", "newPassword": "N3wStr0ngPass!"}
    )
    for row in client.get("/api/admin/changes", headers=h, params={"entity_type": "users"}).json()["items"]:
        if "password_hash" in row["changes"]:
            assert all(value in (None, "•••") for value in row["changes"]["password_hash"])


def test_reviewer_reviews_the_work_of_their_users_and_roles(client, tenant):
    from unittest.mock import MagicMock, patch

    h = tenant["h"]
    staff_id = _staff_id(client, tenant)
    tag = uuid.uuid4().hex[:6]
    # A reviewer needs someone to review.
    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        smtp.return_value = MagicMock()
        empty = client.post(
            "/api/users", headers=h, json={"name": "No Scope", "email": f"ns-{tag}@orgadmin.example.com", "role": "reviewer"}
        )
    assert empty.status_code == 400
    reviewer = invite_and_accept(
        client, h, "Rita Reviewer", f"rev-{tag}@orgadmin.example.com", "reviewer", "Rev1ewPass!", review_scope=["role:staff"]
    )
    assert reviewer["role"] == "reviewer" and reviewer["reviewTargets"] == ["role:staff"]
    rh = _login(client, f"rev-{tag}@orgadmin.example.com", "Rev1ewPass!")
    # Reads like a viewer, writes nothing.
    assert client.get("/api/items", headers=rh).status_code == 200
    assert client.post("/api/items", headers=rh, json={"name": "X", "sku": "X-9", "type": "goods"}).status_code == 403

    admin_item = client.post("/api/items", headers=h, json={"name": "Admin tea", "sku": f"AT-{tag}", "type": "goods", "sellingPrice": 10})
    staff_item = client.post(
        "/api/items", headers=tenant["staff_h"], json={"name": "Staff tea", "sku": f"ST-{tag}", "type": "goods", "sellingPrice": 10}
    )
    assert staff_item.status_code == 201, staff_item.text
    waiting = client.get("/api/reviews", headers=rh).json()["items"]
    assert waiting and all(c["userId"] == staff_id for c in waiting)
    assert admin_item.json()["id"] not in {c["entityId"] for c in waiting}
    summary = client.get("/api/reviews/summary", headers=rh).json()
    assert summary["waiting"] == len(waiting) and summary["scope"] == ["Staff (role)"]

    target = next(c for c in waiting if c["entityId"] == staff_item.json()["id"])
    assert client.post(f"/api/reviews/{target['id']}", headers=rh, json={"status": "flagged"}).status_code == 400
    flagged = client.post(f"/api/reviews/{target['id']}", headers=rh, json={"status": "flagged", "note": "Price should be 12"})
    assert flagged.status_code == 200 and flagged.json()["reviewedByName"] == "Rita Reviewer"
    # The maker sees the flag and the note; staff cannot review.
    mine = client.get("/api/reviews/mine", headers=tenant["staff_h"]).json()["items"]
    assert [c["reviewNote"] for c in mine] == ["Price should be 12"]
    # The maker answers: the change goes back to the reviewer's list with the answer.
    replied = client.post(f"/api/reviews/mine/{target['id']}/reply", headers=tenant["staff_h"], json={"message": "Fixed it to 12."})
    assert replied.status_code == 200 and replied.json()["reviewStatus"] is None and replied.json()["reviewReply"] == "Fixed it to 12."
    assert client.get("/api/reviews/mine", headers=tenant["staff_h"]).json()["items"] == []
    assert client.post(f"/api/reviews/mine/{target['id']}/reply", headers=rh, json={"message": "x"}).status_code == 404
    again = next(c for c in client.get("/api/reviews", headers=rh).json()["items"] if c["id"] == target["id"])
    assert again["reviewNote"] == "Price should be 12" and again["reviewReply"] == "Fixed it to 12."
    # On hold: the maker sees it too; then approve.
    held = client.post(f"/api/reviews/{target['id']}", headers=rh, json={"status": "hold", "note": "Checking with accounts"})
    assert held.json()["reviewStatus"] == "hold" and client.get("/api/reviews/summary", headers=rh).json()["hold"] == 1
    assert [c["reviewStatus"] for c in client.get("/api/reviews/mine", headers=tenant["staff_h"]).json()["items"]] == ["hold"]
    # The maker is told in the bell, and the item itself shows it is on hold.
    bell = client.get("/api/dashboard/notifications", headers=tenant["staff_h"]).json()["items"]
    assert any(n["kind"] == "review_hold" and "on hold" in n["title"] and n["body"] == "Checking with accounts" for n in bell)
    holds = client.get("/api/reviews/holds", headers=tenant["staff_h"], params={"entity_type": "items"}).json()
    assert holds[staff_item.json()["id"]] == {"status": "hold", "note": "Checking with accounts", "by": "Rita Reviewer"}
    assert client.post(f"/api/reviews/{target['id']}", headers=rh, json={"status": "reviewed"}).json()["reviewStatus"] == "reviewed"
    assert client.get("/api/reviews", headers=tenant["staff_h"]).status_code == 403
    rest = [c["id"] for c in waiting if c["id"] != target["id"]]
    if rest:
        done = client.post("/api/reviews/bulk", headers=rh, json={"ids": rest, "status": "reviewed"})
        assert done.status_code == 200 and {c["reviewStatus"] for c in done.json()} == {"reviewed"}
    assert client.get("/api/reviews/summary", headers=rh).json()["waiting"] == 0
    # Not in scope: the admin's own change.
    admin_change = client.get("/api/admin/changes", headers=h, params={"search": f"AT-{tag}"}).json()["items"][0]
    assert client.post(f"/api/reviews/{admin_change['id']}", headers=rh, json={"status": "reviewed"}).status_code == 404

    # Connect to one user instead of a role; never to themself.
    reviewer_id = reviewer["id"]
    moved = client.patch(f"/api/users/{reviewer_id}", headers=h, json={"reviewScope": [f"user:{staff_id}"]})
    assert moved.status_code == 200 and moved.json()["reviewTargets"] == [f"user:{staff_id}"]
    assert client.patch(f"/api/users/{reviewer_id}", headers=h, json={"reviewScope": [f"user:{reviewer_id}"]}).status_code == 400
    # Becoming staff clears the scope.
    assert client.patch(f"/api/users/{reviewer_id}", headers=h, json={"role": "staff"}).json()["reviewTargets"] is None


def test_sign_in_history_and_signing_users_out(client, tenant):
    import time

    h = tenant["h"]
    email = _staff_email(client, tenant)
    staff_id = _staff_id(client, tenant)
    assert client.post("/api/auth/login", json={"email": email, "password": "wrong-Pass1"}).status_code == 401
    staff_h = _login(client, email, "Str0ngPass!")

    logins = client.get("/api/admin/security/logins", headers=h, params={"user_id": staff_id}).json()["items"]
    assert [entry["success"] for entry in logins][:2] == [True, False]
    assert logins[1]["reason"] == "Wrong password" and logins[0]["userName"] == "Sam Staff"
    failed = client.get("/api/admin/security/logins", headers=h, params={"failed_only": True}).json()["items"]
    assert failed and not any(entry["success"] for entry in failed)
    summary = client.get("/api/admin/security/summary", headers=h).json()
    assert summary["failedToday"] >= 1 and summary["signedInSessions"] >= 2

    staff_sessions = [s for s in client.get("/api/admin/security/sessions", headers=h).json() if s["userId"] == staff_id]
    assert staff_sessions
    assert client.post(f"/api/admin/security/sessions/{staff_sessions[0]['id']}/revoke", headers=h).status_code == 200
    left = [s for s in client.get("/api/admin/security/sessions", headers=h).json() if s["userId"] == staff_id]
    assert len(left) == len(staff_sessions) - 1

    time.sleep(1.1)
    assert client.post(f"/api/admin/security/users/{staff_id}/sign-out", headers=h).status_code == 200
    assert client.get("/api/items", headers=staff_h).status_code == 401
    assert not [s for s in client.get("/api/admin/security/sessions", headers=h).json() if s["userId"] == staff_id]
    # Signing in again works.
    time.sleep(1.1)
    assert client.get("/api/items", headers=_login(client, email, "Str0ngPass!")).status_code == 200
    # Another organization's users are out of reach.
    other = register_org(client, "Elsewhere")
    assert client.post(f"/api/admin/security/users/{staff_id}/sign-out", headers=auth(other["token"])).status_code == 404


class _NowThread:
    """Runs a support email at once instead of in the background."""

    def __init__(self, target, daemon):
        self.target = target

    def start(self):
        self.target()


def test_every_role_can_ask_support_and_the_platform_answers(client, tenant):
    from unittest.mock import patch

    sa = platform_admin_headers(client)
    sent = []

    def record(to, subject, body, **kwargs):
        sent.append((to, subject))
        return {"success": True}

    with (
        patch("backend.services.email_service.smtp_configured", return_value=True),
        patch("backend.services.email_service.send_custom_message_email", side_effect=record),
        patch("backend.services.support.threading.Thread", _NowThread),
    ):
        opened = client.post(
            "/api/support/requests",
            headers=tenant["staff_h"],
            json={"subject": "Why was the price changed?", "category": "change", "message": "Chai went from 50 to 51."},
        )
        assert opened.status_code == 201, opened.text
        tid = opened.json()["id"]
        assert any(subject == "[Support] Why was the price changed?" for _, subject in sent)
        answered = client.post(f"/api/platform/requests/{tid}/messages", headers=sa, json={"message": "Your admin did it."})
        assert answered.status_code == 200
    assert (_staff_email(client, tenant), "Re: Why was the price changed?") in sent
    # The staff user sees their own requests; the admin sees all of them.
    assert [t["id"] for t in client.get("/api/support/requests", headers=tenant["staff_h"]).json()] == [tid]
    assert tid in [t["id"] for t in client.get("/api/support/requests", headers=tenant["h"]).json()]
    thread = client.get(f"/api/support/requests/{tid}", headers=tenant["staff_h"]).json()
    assert [m["authorKind"] for m in thread["messages"]] == ["org", "platform"]
    # Another user of the organization (not an admin) cannot open it.
    tag = uuid.uuid4().hex[:6]
    invite_and_accept(client, tenant["h"], "Vee Viewer", f"v-{tag}@orgadmin.example.com", "viewer", "V1ewerPass!")
    vh = _login(client, f"v-{tag}@orgadmin.example.com", "V1ewerPass!")
    assert client.get(f"/api/support/requests/{tid}", headers=vh).status_code == 404
    assert client.get("/api/support/requests", headers=vh).json() == []


def test_org_codes_are_unique_per_name(client):
    from backend.db import SessionLocal
    from backend.models import Organization as Org

    first = register_org(client, "SameName")
    second = register_org(client, "SameName")
    with SessionLocal() as db:
        codes = [db.get(Org, first["org"]["id"]).code, db.get(Org, second["org"]["id"]).code]
    assert len(set(codes)) == 2 and all(codes)
