"""Subscriptions: the free trial every new organization gets, the app lock once
it is over, plan requests by the organization's admin and their review by a
super-admin (accept / reject / extend trial / cancel)."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.db import SessionLocal
from backend.models import EmailVerification, Organization, User
from backend.security import hash_password, hash_token
from backend.services import module_pricing
from tests.conftest import auth, create_panel_admin, invite_and_accept, platform_admin_headers, register_org

PASSWORD = "Str0ngPass1"


@pytest.fixture
def platform_h(client):
    return platform_admin_headers(client)


@pytest.fixture
def approval_on(client, platform_h):
    assert client.put("/api/platform/settings", headers=platform_h, json={"requireOrgApproval": True}).status_code == 200
    try:
        yield platform_h
    finally:
        client.put("/api/platform/settings", headers=platform_h, json={"requireOrgApproval": False})


@pytest.fixture(autouse=True)
def no_smtp():
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_smtp.return_value = MagicMock()
        yield


@pytest.fixture
def tenant(client):
    ctx = register_org(client, "Subs")
    ctx["h"] = auth(ctx["token"])
    ctx["org_id"] = ctx["org"]["id"]
    return ctx


def _signup(c: TestClient, **extra):
    n = uuid.uuid4().hex[:8]
    email = f"owner-{n}@subs.example.com"
    with SessionLocal() as db:
        db.add(
            EmailVerification(
                email=email,
                token_hash=hash_token(f"subs-test-{n}"),
                status="VERIFIED",
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
                verified_at=datetime.now(UTC),
            )
        )
        db.commit()
    body = {"name": f"Owner {n}", "email": email, "password": PASSWORD, "organizationName": f"Subs Org {n}", **extra}
    return c.post("/api/auth/register", json=body), email


def _org_row(org_id: str) -> Organization:
    with SessionLocal() as db:
        org = db.get(Organization, org_id)
        db.expunge(org)
        return org


def _set_org(org_id: str, **fields) -> None:
    with SessionLocal() as db:
        org = db.get(Organization, org_id)
        for key, value in fields.items():
            setattr(org, key, value)
        db.commit()


def _expire_trial(org_id: str) -> None:
    _set_org(org_id, trial_ends_at=datetime.now(UTC) - timedelta(minutes=1))


def _enabled_modules(c: TestClient, h: dict) -> set:
    res = c.get("/api/app-content", headers=h)
    assert res.status_code == 200, res.text
    return {k for k, v in res.json()["modules"].items() if v}


def _shared_enabled(c: TestClient) -> set:
    return {k for k, v in c.get("/api/public/app-content").json()["modules"].items() if v}


def _price(keys) -> int:
    cat = module_pricing.catalog()
    prices = {m["key"]: m["price"] for m in cat["modules"]}
    return cat["basePrice"] + sum(prices[k] for k in keys)


def _assert_locked(res) -> None:
    assert res.status_code == 402, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "subscription_required" and detail["status"] == "expired" and detail["message"]


def _request(c: TestClient, h: dict, modules, cycle="monthly"):
    return c.post("/api/subscription/request", headers=h, json={"modules": modules, "billingCycle": cycle})


# --------------------------------------------------------------------------- #
# Trial
# --------------------------------------------------------------------------- #
def test_new_org_gets_trial_of_every_module(client):
    res, _ = _signup(client)
    assert res.status_code == 201, res.text
    body = res.json()
    sub = body["organization"]["subscription"]
    assert sub["status"] == "trial" and sub["trialDaysLeft"] == 3 and sub["locked"] is False
    assert sub["plan"] is None and sub["pendingRequest"] is None and sub["lastRejection"] is None and sub["canManage"] is True
    ends = datetime.fromisoformat(sub["trialEndsAt"].replace("Z", "+00:00"))
    ends = ends if ends.tzinfo else ends.replace(tzinfo=UTC)
    assert timedelta(days=2, hours=23) < ends - datetime.now(UTC) <= timedelta(days=3)
    h = auth(body["accessToken"])
    assert client.get("/api/subscription", headers=h).json()["status"] == "trial"
    assert _enabled_modules(client, h) == _shared_enabled(client)
    assert body["organization"]["requestedModules"] is None

    me = client.get("/api/auth/me", headers=h).json()["organization"]["subscription"]
    assert me["status"] == "trial" and me["trialDaysLeft"] == 3


def test_register_ignores_modules(client):
    res, email = _signup(client, modules=["items"])
    assert res.status_code == 201, res.text
    h = auth(res.json()["accessToken"])
    assert _enabled_modules(client, h) == _shared_enabled(client)
    assert res.json()["organization"]["subscription"]["status"] == "trial"


def test_trial_starts_at_approval(client, approval_on):
    res, email = _signup(client)
    assert res.status_code == 202, res.text
    with SessionLocal() as db:
        org_id = db.query(User.organization_id).filter(User.email == email).scalar()
    row = _org_row(org_id)
    assert row.subscription_status == "trial" and row.trial_ends_at is None
    detail = client.get(f"/api/platform/organizations/{org_id}", headers=approval_on).json()
    assert detail["subscriptionStatus"] == "trial" and detail["trialEndsAt"] is None

    # Approval no longer takes modules; the trial starts now.
    approved = client.post(f"/api/platform/organizations/{org_id}/approve", headers=approval_on, json={})
    assert approved.status_code == 200, approved.text
    assert approved.json()["trialEndsAt"] is not None and approved.json()["subscriptionStatus"] == "trial"
    login = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    assert login.json()["organization"]["subscription"]["trialDaysLeft"] == 3


def test_trial_days_setting(client, platform_h):
    assert client.get("/api/platform/settings", headers=platform_h).json()["trialDays"] == 3
    for bad in (-1, 91, None):
        assert client.put("/api/platform/settings", headers=platform_h, json={"trialDays": bad}).status_code == 422
    res = client.put("/api/platform/settings", headers=platform_h, json={"trialDays": 7})
    assert res.status_code == 200 and res.json()["trialDays"] == 7
    try:
        assert client.get("/api/public/module-pricing").json()["trialDays"] == 7
        signup, _ = _signup(client)
        assert signup.json()["organization"]["subscription"]["trialDaysLeft"] == 7
    finally:
        client.put("/api/platform/settings", headers=platform_h, json={"trialDays": 3})


def test_platform_created_org_starts_trial(client, platform_h):
    email = f"made-{uuid.uuid4().hex[:8]}@subs.example.com"
    res = client.post(
        "/api/platform/organizations",
        headers=platform_h,
        json={"name": "Made By Platform", "adminName": "Made Admin", "adminEmail": email, "adminPassword": PASSWORD},
    )
    assert res.status_code == 201, res.text
    assert res.json()["organization"]["subscriptionStatus"] == "trial"
    assert res.json()["organization"]["trialEndsAt"] is not None


# --------------------------------------------------------------------------- #
# Lock
# --------------------------------------------------------------------------- #
def test_expired_trial_locks_the_app(client, tenant):
    h = tenant["h"]
    assert client.get("/api/items", headers=h).status_code == 200
    _expire_trial(tenant["org_id"])

    for path in ("/api/items", "/api/invoices", "/api/contacts", "/api/organization", "/api/razorpay/config", "/api/dashboard/summary"):
        _assert_locked(client.get(path, headers=h))
    _assert_locked(client.post("/api/items", headers=h, json={"name": "Blocked", "type": "service", "sellingPrice": 1}))

    me = client.get("/api/auth/me", headers=h)
    assert me.status_code == 200
    sub = me.json()["organization"]["subscription"]
    assert sub["status"] == "expired" and sub["locked"] is True and sub["trialDaysLeft"] == 0
    assert client.get("/api/subscription", headers=h).json()["locked"] is True
    assert client.get("/api/app-content", headers=h).status_code == 200
    assert client.get("/api/public/module-pricing").status_code == 200
    login = client.post("/api/auth/login", json={"email": tenant["email"], "password": tenant["password"]})
    assert login.status_code == 200 and login.json()["organization"]["subscription"]["locked"] is True


def test_existing_org_is_unaffected(client):
    """An organization from before subscriptions: active, no plan, no trial."""
    email = f"legacy-{uuid.uuid4().hex[:8]}@subs.example.com"
    with SessionLocal() as db:
        org = Organization(name="Legacy Org")
        db.add(org)
        db.flush()
        db.add(User(organization_id=org.id, name="Legacy Admin", email=email, password_hash=hash_password(PASSWORD), role="admin"))
        db.commit()
        assert org.subscription_status == "active" and org.trial_ends_at is None
    login = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    h = auth(login.json()["accessToken"])
    assert client.get("/api/items", headers=h).status_code == 200
    sub = client.get("/api/subscription", headers=h).json()
    assert sub == {
        "status": "active",
        "trialEndsAt": None,
        "trialDaysLeft": None,
        "locked": False,
        "plan": None,
        "pendingRequest": None,
        "lastRejection": None,
        "canManage": True,
    }
    assert _enabled_modules(client, h) == _shared_enabled(client)


def test_org_admin_panel_works_when_locked(client, tenant, platform_h):
    panel = create_panel_admin(client, platform_h, tenant["org_id"])
    _expire_trial(tenant["org_id"])
    _assert_locked(client.get("/api/items", headers=tenant["h"]))
    res = client.get("/api/org-admin/organization", headers=panel["h"])
    assert res.status_code == 200, res.text
    assert client.get("/api/org-admin/users", headers=panel["h"]).status_code == 200


# --------------------------------------------------------------------------- #
# Requests (tenant admin)
# --------------------------------------------------------------------------- #
def test_admin_requests_monthly_and_yearly(client, tenant):
    h = tenant["h"]
    res = _request(client, h, ["paymentsReceived", "items"])
    assert res.status_code == 200, res.text
    pending = res.json()["pendingRequest"]
    expected = ["items", "customers", "invoices", "paymentsReceived"]
    assert pending["modules"] == expected and pending["billingCycle"] == "monthly"
    assert pending["monthlyPrice"] == pending["planPrice"] == _price(expected) == 499 + 199 + 99 + 299 + 149
    assert pending["requestedAt"] and res.json()["status"] == "trial" and res.json()["plan"] is None

    # A new request replaces the pending one; yearly = 10 x monthly.
    yearly = _request(client, h, ["bills"], "yearly").json()["pendingRequest"]
    assert yearly["modules"] == ["vendors", "bills"] and yearly["billingCycle"] == "yearly"
    assert yearly["monthlyPrice"] == _price(["vendors", "bills"]) and yearly["planPrice"] == 10 * _price(["vendors", "bills"])
    # Requesting does not change the modules during the trial.
    assert _enabled_modules(client, h) == _shared_enabled(client)

    cancelled = client.delete("/api/subscription/request", headers=h)
    assert cancelled.status_code == 200 and cancelled.json()["pendingRequest"] is None
    assert client.delete("/api/subscription/request", headers=h).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"modules": ["invoices", "notAModule"], "billingCycle": "monthly"},
        {"modules": [], "billingCycle": "monthly"},
        {"modules": ["items"], "billingCycle": "weekly"},
        {"billingCycle": "monthly"},
    ],
)
def test_request_validation(client, tenant, body):
    res = client.post("/api/subscription/request", headers=tenant["h"], json=body)
    assert res.status_code == 422, res.text
    assert client.get("/api/subscription", headers=tenant["h"]).json()["pendingRequest"] is None


def test_non_admin_can_read_but_not_request(client, tenant):
    email = f"staff-{uuid.uuid4().hex[:8]}@subs.example.com"
    invite_and_accept(client, tenant["h"], "Sam Staff", email, "staff", PASSWORD)
    token = client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).json()["accessToken"]
    h = auth(token)
    sub = client.get("/api/subscription", headers=h)
    assert sub.status_code == 200 and sub.json()["canManage"] is False and sub.json()["status"] == "trial"
    assert _request(client, h, ["items"]).status_code == 403
    assert client.delete("/api/subscription/request", headers=h).status_code == 403
    # A locked org's staff are locked too, but can still read the state.
    _expire_trial(tenant["org_id"])
    _assert_locked(client.get("/api/items", headers=h))
    assert client.get("/api/subscription", headers=h).json()["locked"] is True


# --------------------------------------------------------------------------- #
# Super-admin review
# --------------------------------------------------------------------------- #
def test_super_admin_approves_request_with_override(client, tenant, platform_h):
    h, org_id = tenant["h"], tenant["org_id"]
    assert _request(client, h, ["bills"], "yearly").status_code == 200
    _expire_trial(org_id)
    _assert_locked(client.get("/api/items", headers=h))

    rows = client.get("/api/platform/subscription-requests", headers=platform_h).json()
    row = next(r for r in rows if r["organizationId"] == org_id)
    assert row["modules"] == ["vendors", "bills"] and row["billingCycle"] == "yearly"
    assert row["planPrice"] == 10 * row["monthlyPrice"] and row["subscriptionStatus"] == "expired" and row["requestedAt"]
    assert row["organizationName"] == tenant["org"]["name"] and row["trialEndsAt"]
    assert client.get("/api/platform/dashboard", headers=platform_h).json()["pendingSubscriptionRequests"] >= 1
    detail = client.get(f"/api/platform/organizations/{org_id}", headers=platform_h).json()
    assert detail["subscriptionStatus"] == "expired" and detail["pendingRequest"]["modules"] == ["vendors", "bills"]
    summary = next(
        o
        for o in client.get(
            "/api/platform/organizations", headers=platform_h, params={"page_size": 100, "search": tenant["org"]["name"]}
        ).json()["items"]
        if o["id"] == org_id
    )
    assert summary["subscriptionStatus"] == "expired" and summary["pendingRequest"]["billingCycle"] == "yearly"

    # Accept, but with other modules (the cycle comes from the request).
    res = client.post(f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_h, json={"modules": ["invoices"]})
    assert res.status_code == 200, res.text
    out = res.json()
    expected = ["customers", "invoices"]
    assert out["subscriptionStatus"] == "active" and out["pendingRequest"] is None
    assert out["plan"] == {
        "modules": expected,
        "billingCycle": "yearly",
        "monthlyPrice": _price(expected),
        "planPrice": 10 * _price(expected),
    }
    assert out["requestedModules"] == expected and out["monthlyPrice"] == _price(expected)

    assert client.get("/api/items", headers=h).status_code == 200
    assert _enabled_modules(client, h) == set(expected) & _shared_enabled(client)
    sub = client.get("/api/subscription", headers=h).json()
    assert sub["status"] == "active" and sub["locked"] is False and sub["trialDaysLeft"] is None and sub["plan"]["modules"] == expected
    assert org_id not in [r["organizationId"] for r in client.get("/api/platform/subscription-requests", headers=platform_h).json()]

    # An active org asking for a change keeps its plan until that is accepted.
    change = _request(client, h, ["payroll"], "monthly").json()
    assert change["status"] == "active" and change["plan"]["modules"] == expected and change["pendingRequest"]["modules"] == ["payroll"]
    assert client.post(f"/api/platform/organizations/{org_id}/subscription/approve", headers=platform_h).status_code == 200
    sub = client.get("/api/subscription", headers=h).json()
    assert sub["plan"] == {
        "modules": ["payroll"],
        "billingCycle": "monthly",
        "monthlyPrice": _price(["payroll"]),
        "planPrice": _price(["payroll"]),
    }
    assert _enabled_modules(client, h) == {"payroll"} & _shared_enabled(client)

    # Cancelling the plan locks the org and switches every module back on.
    cancelled = client.post(f"/api/platform/organizations/{org_id}/subscription/cancel", headers=platform_h)
    assert cancelled.status_code == 200 and cancelled.json()["subscriptionStatus"] == "expired" and cancelled.json()["plan"] is None
    _assert_locked(client.get("/api/items", headers=h))
    assert _enabled_modules(client, h) == _shared_enabled(client)
    assert client.post(f"/api/platform/organizations/{org_id}/subscription/cancel", headers=platform_h).status_code == 400


def test_approve_needs_a_request_or_modules(client, tenant, platform_h):
    url = f"/api/platform/organizations/{tenant['org_id']}/subscription/approve"
    assert client.post(url, headers=platform_h).status_code == 400
    assert client.post(url, headers=platform_h, json={"modules": ["bogus"]}).status_code == 422
    assert client.post(url, headers=platform_h, json={"modules": ["items"], "billingCycle": "daily"}).status_code == 422
    res = client.post(url, headers=platform_h, json={"modules": ["items"], "billingCycle": "yearly"})
    assert res.status_code == 200, res.text
    assert res.json()["plan"] == {
        "modules": ["items"],
        "billingCycle": "yearly",
        "monthlyPrice": _price(["items"]),
        "planPrice": 10 * _price(["items"]),
    }
    assert client.post("/api/platform/organizations/nope/subscription/approve", headers=platform_h).status_code == 404


def test_reject_keeps_locked_and_shows_reason(client, tenant, platform_h):
    h, org_id = tenant["h"], tenant["org_id"]
    url = f"/api/platform/organizations/{org_id}/subscription/reject"
    assert client.post(url, headers=platform_h, json={"reason": "Nothing to reject"}).status_code == 400
    assert _request(client, h, ["items"]).status_code == 200
    assert client.post(url, headers=platform_h, json={"reason": ""}).status_code == 422
    _expire_trial(org_id)

    res = client.post(url, headers=platform_h, json={"reason": "Please add GST details first"})
    assert res.status_code == 200, res.text
    assert res.json()["pendingRequest"] is None and res.json()["subscriptionNote"] == "Please add GST details first"
    assert res.json()["subscriptionStatus"] == "expired"
    _assert_locked(client.get("/api/items", headers=h))
    sub = client.get("/api/subscription", headers=h).json()
    assert sub["lastRejection"]["reason"] == "Please add GST details first" and sub["lastRejection"]["decidedAt"]
    assert sub["pendingRequest"] is None and sub["locked"] is True

    # A fresh request clears the old rejection.
    assert _request(client, h, ["documents"]).json()["lastRejection"] is None


def test_extend_trial_unlocks(client, tenant, platform_h):
    h, org_id = tenant["h"], tenant["org_id"]
    _expire_trial(org_id)
    _assert_locked(client.get("/api/items", headers=h))
    url = f"/api/platform/organizations/{org_id}/trial"
    for bad in (0, 91):
        assert client.post(url, headers=platform_h, json={"days": bad}).status_code == 422
    res = client.post(url, headers=platform_h, json={"days": 2})
    assert res.status_code == 200, res.text
    assert res.json()["subscriptionStatus"] == "trial"
    assert client.get("/api/items", headers=h).status_code == 200
    assert client.get("/api/subscription", headers=h).json()["trialDaysLeft"] == 2

    # Extending a running trial adds to its end.
    client.post(url, headers=platform_h, json={"days": 3})
    assert client.get("/api/subscription", headers=h).json()["trialDaysLeft"] == 5


def test_extend_trial_needs_approval(client, approval_on):
    res, email = _signup(client)
    assert res.status_code == 202
    with SessionLocal() as db:
        org_id = db.query(User.organization_id).filter(User.email == email).scalar()
    r = client.post(f"/api/platform/organizations/{org_id}/trial", headers=approval_on, json={"days": 5})
    assert r.status_code == 400
