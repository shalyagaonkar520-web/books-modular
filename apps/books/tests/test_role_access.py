"""What each role may reach.

Staff may create contacts and items but may NOT read the chart of accounts -
that is Admin/Viewer only. Entry forms therefore must not require accounts just
to open, or a Staff user is locked out of work they are entitled to do with a
bare "Insufficient permissions".
"""

import uuid

import pytest

from tests.conftest import auth, invite_and_accept, register_org


@pytest.fixture
def roles(client):
    """An org with its admin and a staff member.

    User emails are unique across the whole database and this fixture runs once
    per test, so each staff member gets their own address.
    """
    ctx = register_org(client, "RoleAccess")
    admin = auth(ctx["token"])
    email = f"staff-{uuid.uuid4().hex[:8]}@example.com"
    invite_and_accept(client, admin, "Staffer", email, "staff", "Staff12345")
    staff = auth(client.post("/api/auth/login", json={"email": email, "password": "Staff12345"}).json()["accessToken"])
    return {"admin": admin, "staff": staff}


def test_staff_may_create_contacts_and_items(roles, client):
    staff = roles["staff"]
    contact = client.post(
        "/api/contacts", headers=staff, json={"type": "customer", "displayName": "Staff Made", "email": f"sm-{uuid.uuid4().hex[:6]}@x.com"}
    )
    assert contact.status_code == 201, contact.text
    item = client.post(
        "/api/items", headers=staff, json={"name": "Staff Item", "sku": f"STAFF-{uuid.uuid4().hex[:6]}", "sellingPrice": 100}
    )
    assert item.status_code == 201, item.text


def test_the_chart_of_accounts_stays_admin_and_viewer_only(roles, client):
    """Pins the asymmetry the entry forms have to work around."""
    assert client.get("/api/accounting/accounts", headers=roles["staff"]).status_code == 403
    assert client.get("/api/accounting/accounts", headers=roles["admin"]).status_code == 200


def test_a_contact_saves_without_an_account_override(roles, client):
    """What a Staff user sends: no ledgerAccountId, because the picker that
    needs the chart of accounts is not shown to them."""
    res = client.post(
        "/api/contacts",
        headers=roles["staff"],
        json={"type": "vendor", "displayName": "No Account Vendor", "ledgerAccountId": None},
    )
    assert res.status_code == 201, res.text
    assert res.json()["ledgerAccountId"] is None
