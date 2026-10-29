"""Custom roles: No access / View / Edit per feature, enforced on every request."""

import uuid
from datetime import date

import pytest

from backend.services import permissions
from tests.conftest import auth, invite_and_accept, platform_admin_headers, register_org

D = date.today().isoformat()
CASHIER = {"pos": "edit", "invoices": "view", "customers": "edit", "reports": "view"}


@pytest.fixture
def books(client):
    ctx = register_org(client, "Roles")
    h = auth(ctx["token"])
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Walk-in"}).json()
    item = client.post(
        "/api/items", headers=h, json={"name": "Tea", "sku": "TEA-1", "type": "goods", "sellingPrice": 50, "taxRate": 5}
    ).json()
    client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 1000, "openingBalanceDate": "2026-01-01"},
    )
    return {"h": h, "customer": customer, "item": item}


def _role(client, h, name="Cashier", perms=CASHIER):
    res = client.post("/api/roles", headers=h, json={"name": name, "description": "Counter staff", "permissions": perms})
    assert res.status_code == 201, res.text
    return res.json()


def _custom_user(client, h, role_id, email=None):
    email = email or f"cash-{uuid.uuid4().hex[:8]}@roles.example.com"
    invite_and_accept(client, h, "Cash Person", email, "custom", "Cash1Pass!", custom_role_id=role_id)
    token = client.post("/api/auth/login", json={"email": email, "password": "Cash1Pass!"}).json()
    return token["user"], auth(token["accessToken"])


def test_catalog_and_role_crud(client, books):
    h = books["h"]
    catalog = client.get("/api/roles/catalog", headers=h).json()
    keys = {f["key"] for f in catalog}
    assert {"pos", "invoices", "deliveryChallans", "gst", "incomeTax", "payroll", "banking"} <= keys
    role = _role(client, h)
    assert role["permissions"]["pos"] == "edit" and role["permissions"]["banking"] == "none" and role["userCount"] == 0
    assert set(role["permissions"]) == set(permissions.FEATURE_KEYS)

    assert client.post("/api/roles", headers=h, json={"name": "cashier", "permissions": CASHIER}).status_code == 409
    assert client.post("/api/roles", headers=h, json={"name": "Admin", "permissions": CASHIER}).status_code == 400
    assert client.post("/api/roles", headers=h, json={"name": "Empty", "permissions": {}}).status_code == 400
    assert client.post("/api/roles", headers=h, json={"name": "Bad", "permissions": {"nope": "edit"}}).status_code == 422
    assert client.post("/api/roles", headers=h, json={"name": "Bad", "permissions": {"pos": "all"}}).status_code == 422

    updated = client.put(f"/api/roles/{role['id']}", headers=h, json={"name": "Counter", "permissions": {**CASHIER, "banking": "view"}})
    assert updated.status_code == 200 and updated.json()["name"] == "Counter" and updated.json()["permissions"]["banking"] == "view"
    assert [r["name"] for r in client.get("/api/roles", headers=h).json()] == ["Counter"]


def test_custom_user_gets_view_edit_and_no_access(client, books):
    b, h = books, books["h"]
    role = _role(client, h)
    user, ch = _custom_user(client, h, role["id"])
    assert user["role"] == "custom" and user["customRoleName"] == "Cashier"
    assert user["permissions"]["pos"] == "edit" and user["permissions"]["payroll"] == "none"

    # Edit: customers can be created.
    assert client.post("/api/contacts", headers=ch, json={"type": "customer", "displayName": "New buyer"}).status_code == 201
    # View: invoices list opens but a new invoice is refused.
    assert client.get("/api/invoices", headers=ch).status_code == 200
    line = {"itemId": b["item"]["id"], "description": "Tea", "quantity": 1, "rate": 50, "taxRate": 5}
    refused = client.post("/api/invoices", headers=ch, json={"customerId": b["customer"]["id"], "date": D, "lines": [line]})
    assert refused.status_code == 403 and "changing Invoices" in refused.json()["detail"]
    # No access: banking and payroll are closed, even to read.
    assert client.get("/api/banking/accounts", headers=ch).status_code == 403
    assert client.get("/api/payroll/employees", headers=ch).status_code == 403
    # Lookups other screens need stay readable; the items list is one.
    assert client.get("/api/items", headers=ch).status_code == 200
    assert client.post("/api/items", headers=ch, json={"name": "X", "sku": "X-1", "type": "goods"}).status_code == 403
    # Admin-only areas stay admin-only whatever the role says.
    assert client.get("/api/users", headers=ch).status_code == 403
    assert client.post("/api/roles", headers=ch, json={"name": "Boss", "permissions": {"pos": "edit"}}).status_code == 403
    assert client.get("/api/dashboard/summary", headers=ch).status_code == 200


def test_role_changes_apply_at_once_and_delete_rules(client, books):
    h = books["h"]
    role = _role(client, h)
    user, ch = _custom_user(client, h, role["id"])
    assert client.get("/api/banking/accounts", headers=ch).status_code == 403
    client.put(f"/api/roles/{role['id']}", headers=h, json={"name": "Cashier", "permissions": {**CASHIER, "banking": "view"}})
    assert client.get("/api/banking/accounts", headers=ch).status_code == 200

    # A role in use cannot be deleted; move the user to a built-in role first.
    assert client.delete(f"/api/roles/{role['id']}", headers=h).status_code == 400
    moved = client.patch(f"/api/users/{user['id']}", headers=h, json={"role": "staff"})
    assert moved.status_code == 200 and moved.json()["role"] == "staff" and moved.json()["customRoleId"] is None
    assert client.delete(f"/api/roles/{role['id']}", headers=h).status_code == 200


def test_custom_role_must_exist_and_belong_to_the_organization(client, books):
    h = books["h"]
    other = auth(register_org(client, "Otherroles")["token"])
    foreign = _role(client, other, name="Theirs")
    payload = {"name": "Someone", "email": "someone@roles.example.com", "role": "custom"}
    assert client.post("/api/users", headers=h, json=payload).status_code == 400
    assert client.post("/api/users", headers=h, json={**payload, "customRoleId": foreign["id"]}).status_code == 404
    assert client.post("/api/users", headers=h, json={**payload, "role": "staff", "customRoleId": foreign["id"]}).status_code == 400


def test_request_rules():
    perms = permissions.normalize({"pos": "edit", "invoices": "view"})
    assert permissions.request_error(perms, "POST", "/api/pos/sales") is None
    assert permissions.request_error(perms, "GET", "/api/invoices/abc/pdf") is None
    assert permissions.request_error(perms, "POST", "/api/invoices") is not None
    assert permissions.request_error(perms, "GET", "/api/payroll/pay-runs") is not None
    assert permissions.request_error(perms, "PATCH", "/api/users/1") == "Only an administrator can do this."
    assert permissions.request_error(perms, "GET", "/api/subscription") is None
    assert permissions.request_error(perms, "POST", "/api/subscription/request") == "Only an administrator can do this."
    assert permissions.feature_for_path("/api/accounting/account-options") == "accounting"
    assert permissions.request_error(perms, "GET", "/api/accounting/account-options") is None
    assert permissions.request_error(perms, "GET", "/api/accounting/accounts") is not None


def test_super_admin_edits_keep_or_clear_the_custom_role(client, books):
    h = books["h"]
    role = _role(client, h)
    user, _ = _custom_user(client, h, role["id"])
    sa = platform_admin_headers(client)
    renamed = client.patch(f"/api/platform/users/{user['id']}", headers=sa, json={"name": "Renamed Cashier"})
    assert renamed.status_code == 200 and renamed.json()["role"] == "custom"
    other = register_org(client, "Movetarget")
    moved = client.patch(f"/api/platform/users/{user['id']}", headers=sa, json={"organizationId": other["org"]["id"]})
    assert moved.status_code == 400 and "custom role" in moved.json()["detail"]
    staff = client.patch(f"/api/platform/users/{user['id']}", headers=sa, json={"role": "staff"})
    assert staff.status_code == 200 and staff.json()["role"] == "staff"
    listed = next(u for u in client.get("/api/users", headers=h).json() if u["id"] == user["id"])
    assert listed["customRoleId"] is None


def test_org_admin_panel_manages_roles_and_invites_with_them(client, books):
    from unittest.mock import MagicMock, patch

    from tests.conftest import create_panel_admin

    org_id = client.get("/api/auth/me", headers=books["h"]).json()["user"]["organizationId"]
    panel = create_panel_admin(client, platform_admin_headers(client), org_id)
    ph = panel["h"]
    assert {"key": "pos", "label": "Point of Sale", "group": "Sales"} in client.get("/api/org-admin/roles/catalog", headers=ph).json()
    role = client.post("/api/org-admin/roles", headers=ph, json={"name": "Store manager", "permissions": {"pos": "edit", "items": "edit"}})
    assert role.status_code == 201, role.text
    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        smtp.return_value = MagicMock()
        invited = client.post(
            "/api/org-admin/users",
            headers=ph,
            json={
                "name": "Meena Manager",
                "email": f"meena-{uuid.uuid4().hex[:6]}@roles.example.com",
                "role": "custom",
                "customRoleId": role.json()["id"],
            },
        )
    assert invited.status_code == 201, invited.text
    assert invited.json()["role"] == "custom" and invited.json()["customRoleName"] == "Store manager"
    assert [r["userCount"] for r in client.get("/api/org-admin/roles", headers=ph).json()] == [1]
    # The tenant's own users never reach the panel's role routes.
    assert client.get("/api/org-admin/roles", headers=books["h"]).status_code in (401, 403)
