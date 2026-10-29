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


def test_super_admin_makes_roles_and_gives_them_to_users(client, books):
    h = books["h"]
    sa = platform_admin_headers(client)
    org_id = client.get("/api/auth/me", headers=h).json()["user"]["organizationId"]
    base = f"/api/platform/organizations/{org_id}/roles"
    assert len(client.get(f"{base}/catalog", headers=sa).json()) == len(permissions.FEATURES)
    made = client.post(base, headers=sa, json={"name": "Store helper", "permissions": {"invoices": "edit", "customers": "view"}})
    assert made.status_code == 201, made.text
    role = made.json()
    assert [r["id"] for r in client.get(base, headers=sa).json()] == [role["id"]]
    # Visible to the organization's own admins too.
    assert role["id"] in [r["id"] for r in client.get("/api/roles", headers=h).json()]

    email = f"helper-{uuid.uuid4().hex[:8]}@roles.example.com"
    created = client.post(
        "/api/platform/users",
        headers=sa,
        json={
            "organizationId": org_id,
            "name": "Store Helper",
            "email": email,
            "password": "Helper1Pass!",
            "role": "custom",
            "customRoleId": role["id"],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["role"] == "custom" and body["customRoleId"] == role["id"] and body["customRoleName"] == "Store helper"
    listed = client.get("/api/platform/users", headers=sa, params={"organization_id": org_id}).json()["items"]
    assert next(u for u in listed if u["id"] == body["id"])["customRoleName"] == "Store helper"

    # A custom role needs one of this organization's roles.
    missing = client.post(
        "/api/platform/users",
        headers=sa,
        json={
            "organizationId": org_id,
            "name": "No Role",
            "email": f"x-{uuid.uuid4().hex[:6]}@roles.example.com",
            "password": "Helper1Pass!",
            "role": "custom",
        },
    )
    assert missing.status_code == 400
    other = register_org(client, "Otherroles")
    foreign = client.post(
        f"/api/platform/organizations/{other['org']['id']}/roles", headers=sa, json={"name": "Elsewhere", "permissions": {"pos": "edit"}}
    ).json()
    wrong = client.patch(f"/api/platform/users/{body['id']}", headers=sa, json={"customRoleId": foreign["id"]})
    assert wrong.status_code == 404

    # Edit: switch a staff user onto the role, then edit and delete the role.
    staff = client.patch(f"/api/platform/users/{body['id']}", headers=sa, json={"role": "staff"}).json()
    assert staff["customRoleId"] is None
    back = client.patch(f"/api/platform/users/{body['id']}", headers=sa, json={"role": "custom", "customRoleId": role["id"]}).json()
    assert back["customRoleId"] == role["id"]
    login = client.post("/api/auth/login", json={"email": email, "password": "Helper1Pass!"}).json()
    uh = auth(login["accessToken"])
    assert client.get("/api/invoices", headers=uh).status_code == 200
    assert client.get("/api/bills", headers=uh).status_code == 403
    upd = client.put(f"{base}/{role['id']}", headers=sa, json={"name": "Store helper", "permissions": {"bills": "view"}})
    assert upd.status_code == 200
    assert client.get("/api/bills", headers=uh).status_code == 200
    assert client.delete(f"{base}/{role['id']}", headers=sa).status_code == 400  # still has a user
    client.patch(f"/api/platform/users/{body['id']}", headers=sa, json={"role": "viewer"})
    assert client.delete(f"{base}/{role['id']}", headers=sa).status_code == 200
