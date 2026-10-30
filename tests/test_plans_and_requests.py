"""Plans by users (100 / 500 / 1000 + custom), the user limit, paying, expiry, and requests with chat."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import auth, invite_and_accept, platform_admin_headers, register_org


@pytest.fixture
def org(client):
    ctx = register_org(client, "Plans")
    sa = platform_admin_headers(client)
    return {"h": auth(ctx["token"]), "id": ctx["org"]["id"], "sa": sa}


def _quote(client, h, plan, cycle="monthly", **extra):
    res = client.get("/api/subscription/quote", headers=h, params={"plan_key": plan, "billing_cycle": cycle, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def test_plan_prices(client, org):
    h = org["h"]
    catalog = client.get("/api/subscription/plans", headers=h).json()
    assert [(t["key"], t["users"], t["monthly"]) for t in catalog["tiers"]] == [
        ("u100", 100, 299),
        ("u500", 500, 599),
        ("u1000", 1000, 999),
    ]
    assert _quote(client, h, "u500")["planPrice"] == 599
    assert _quote(client, h, "u1000", "yearly")["planPrice"] == 9990
    every = [f["key"] for f in catalog["features"]]
    # Custom: the price of the plan that covers the users, scaled by features chosen.
    assert _quote(client, h, "custom", users=50, modules=",".join(every))["monthlyPrice"] == 299
    some = _quote(client, h, "custom", users=300, modules="pos")
    assert some["maxUsers"] == 300 and 99 <= some["monthlyPrice"] < 599
    assert _quote(client, h, "custom", users=1500, modules=",".join(every))["monthlyPrice"] == 999 + 5 * 99

    sa = org["sa"]
    tiers = catalog["tiers"]
    tiers[0]["monthly"] = 349
    saved = client.put("/api/platform/plans", headers=sa, json={"tiers": tiers, "payment": {"upiId": "rooman@upi", "payeeName": "Rooman"}})
    assert saved.status_code == 200, saved.text
    assert _quote(client, h, "u100")["planPrice"] == 349
    assert client.get("/api/subscription/plans", headers=h).json()["payment"]["upiId"] == "rooman@upi"


def test_pay_request_approve_and_expiry(client, org):
    h, sa = org["h"], org["sa"]
    req = client.post(
        "/api/subscription/plan-request", headers=h, json={"planKey": "u500", "billingCycle": "monthly", "paymentReference": "UTR123456"}
    )
    assert req.status_code == 200, req.text
    pending = req.json()["pendingRequest"]
    assert pending["planKey"] == "u500" and pending["maxUsers"] == 500 and pending["paymentReference"] == "UTR123456"
    assert client.post("/api/subscription/plan-request", headers=h, json={"planKey": "u500", "paymentReference": "x"}).status_code == 422

    rows = client.get("/api/platform/subscription-requests", headers=sa)
    assert rows.status_code == 200, rows.text
    row = next(r for r in rows.json() if r["organizationId"] == org["id"])
    assert row["paymentReference"] == "UTR123456" and row["maxUsers"] == 500 and row["planKey"] == "u500"

    approved = client.post(f"/api/platform/organizations/{org['id']}/subscription/approve", headers=sa)
    assert approved.status_code == 200, approved.text
    sub = client.get("/api/subscription", headers=h).json()
    assert sub["status"] == "active" and sub["planKey"] == "u500" and sub["maxUsers"] == 500 and sub["userLimit"] == 500
    assert sub["plan"]["monthlyPrice"] == 599 and 27 <= sub["planDaysLeft"] <= 31

    # The paid month runs out: the app locks and staff are told to ask for a renewal.
    invite_and_accept(client, h, "Sia Staff", "sia@plans.example.com", "staff", "Staff1Pass!")
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    set_res = client.put(
        f"/api/platform/organizations/{org['id']}/plan", headers=sa, json={"planKey": "u500", "maxUsers": 500, "planEndsAt": past}
    )
    assert set_res.status_code == 200, set_res.text
    assert client.get("/api/items", headers=h).status_code == 402
    staff = client.post("/api/auth/login", json={"email": "sia@plans.example.com", "password": "Staff1Pass!"})
    assert staff.status_code == 403 and "renew" in staff.json()["detail"]
    assert client.get("/api/subscription", headers=h).json()["locked"] is True


def test_user_limit(client, org):
    h, sa = org["h"], org["sa"]
    later = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    assert (
        client.put(
            f"/api/platform/organizations/{org['id']}/plan", headers=sa, json={"planKey": "custom", "maxUsers": 2, "planEndsAt": later}
        ).status_code
        == 200
    )
    second = invite_and_accept(client, h, "Two", "two@plans.example.com", "staff", "Staff2Pass!")
    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        smtp.return_value = MagicMock()
        third = client.post("/api/users", headers=h, json={"name": "Three", "email": "three@plans.example.com", "role": "staff"})
    assert third.status_code == 400 and "allows 2 users" in third.json()["detail"]
    # A deactivated login frees its seat; switching it back on needs room again.
    assert client.patch(f"/api/users/{second['id']}", headers=h, json={"isActive": False}).status_code == 200
    with patch("backend.services.email_service.smtplib.SMTP") as smtp:
        smtp.return_value = MagicMock()
        assert (
            client.post("/api/users", headers=h, json={"name": "Three", "email": "three@plans.example.com", "role": "staff"}).status_code
            == 201
        )
    assert client.patch(f"/api/users/{second['id']}", headers=h, json={"isActive": True}).status_code == 400
    assert client.get("/api/subscription", headers=h).json()["usersUsed"] == 2


def test_requests_chat_between_the_organization_and_platform(client, org):
    sa = org["sa"]
    ph = org["h"]
    sub = client.get("/api/subscription", headers=ph).json()
    assert sub["canManage"] is True and sub["userLimit"] == 100

    opened = client.post(
        "/api/support/requests", headers=ph, json={"subject": "Need 150 users", "category": "users", "message": "We have 150 staff."}
    )
    assert opened.status_code == 201, opened.text
    tid = opened.json()["id"]
    assert client.get("/api/platform/requests/waiting", headers=sa).json()["count"] >= 1
    listed = client.get("/api/platform/requests", headers=sa, params={"status": "open"}).json()
    assert any(t["id"] == tid and t["organizationName"] for t in listed)

    answered = client.post(f"/api/platform/requests/{tid}/messages", headers=sa, json={"message": "Moved you to the 500-user plan."})
    assert answered.status_code == 200 and answered.json()["lastMessageBy"] == "platform"
    thread = client.get(f"/api/support/requests/{tid}", headers=ph).json()
    assert [m["authorKind"] for m in thread["messages"]] == ["org", "platform"]
    closed = client.post(f"/api/support/requests/{tid}/status", headers=ph, json={"status": "closed"})
    assert closed.json()["status"] == "closed"
    # Another organization cannot see it.
    other = register_org(client, "Plansother")
    assert client.get(f"/api/support/requests/{tid}", headers=auth(other["token"])).status_code == 404

    # The admin chooses and pays for a plan.
    paid = client.post(
        "/api/subscription/plan-request",
        headers=ph,
        json={"planKey": "custom", "users": 150, "modules": ["pos"], "paymentReference": "UTR999"},
    )
    assert paid.status_code == 200 and paid.json()["pendingRequest"]["maxUsers"] == 150


def test_custom_plan_limits_the_organization_to_its_features(client, org):
    h, sa = org["h"], org["sa"]
    catalog = client.get("/api/subscription/plans", headers=h).json()
    assert len(catalog["features"]) == 35
    assert {f["key"] for f in catalog["features"] if f["core"]} == {
        "customers",
        "invoices",
        "paymentsReceived",
        "items",
        "pos",
        "accounting",
        "reports",
    }
    req = client.post(
        "/api/subscription/plan-request",
        headers=h,
        json={"planKey": "custom", "users": 20, "modules": ["gst", "deliveryChallans"], "paymentReference": "UTR555"},
    )
    assert req.status_code == 200, req.text
    assert req.json()["pendingRequest"]["features"] == [
        "customers",
        "deliveryChallans",
        "invoices",
        "paymentsReceived",
        "pos",
        "items",
        "accounting",
        "gst",
        "reports",
    ]
    assert client.post(f"/api/platform/organizations/{org['id']}/subscription/approve", headers=sa).status_code == 200

    sub = client.get("/api/subscription", headers=h).json()
    assert "gst" in sub["planFeatures"] and "payroll" not in sub["planFeatures"]
    me = client.get("/api/auth/me", headers=h).json()["user"]
    assert "deliveryChallans" in me["planFeatures"]
    # In the plan (chosen or core): open. Outside it: closed, even to the admin.
    assert client.get("/api/gst/filing-calendar", headers=h).status_code == 200
    assert client.get("/api/delivery-challans", headers=h).status_code == 200
    assert client.get("/api/invoices", headers=h).status_code == 200
    closed = client.get("/api/payroll/employees", headers=h)
    assert closed.status_code == 403 and "not part of your organization's plan" in closed.json()["detail"]
    assert client.get("/api/sales-orders", headers=h).status_code == 403
    # Lookups other screens need stay readable.
    assert client.get("/api/items", headers=h).status_code == 200
    # Moving to a plan with every feature opens everything again.
    later = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    client.put(f"/api/platform/organizations/{org['id']}/plan", headers=sa, json={"planKey": "u100", "maxUsers": 100, "planEndsAt": later})
    assert client.get("/api/payroll/employees", headers=h).status_code == 200


# --------------------------------------------------------------------------- #
# Paying online (Razorpay): the plan starts at once, no super admin
# --------------------------------------------------------------------------- #
def test_online_payment_starts_the_plan_at_once(client, org):
    h = org["h"]
    order = client.post("/api/subscription/checkout", headers=h, json={"planKey": "u500", "billingCycle": "yearly"})
    assert order.status_code == 200, order.text
    body = order.json()
    assert body["amount"] == 599 * 10 * 100 and body["orderId"].startswith("order_")

    # A signature that does not check out starts nothing.
    bad = {"razorpayOrderId": body["orderId"], "razorpayPaymentId": "pay_plan_1", "razorpaySignature": "bad"}
    assert client.post("/api/subscription/checkout/confirm", headers=h, json=bad).status_code == 400
    assert client.get("/api/subscription", headers=h).json()["status"] == "trial"

    paid = {**bad, "razorpaySignature": "test_sig_plan_1"}
    res = client.post("/api/subscription/checkout/confirm", headers=h, json=paid)
    assert res.status_code == 200, res.text
    sub = res.json()
    assert sub["status"] == "active" and sub["planKey"] == "u500" and sub["maxUsers"] == 500 and sub["pendingRequest"] is None
    assert 360 <= sub["planDaysLeft"] <= 366

    # Confirming again (a double click, or the webhook first) does not add another year.
    again = client.post("/api/subscription/checkout/confirm", headers=h, json=paid)
    assert again.status_code == 200 and again.json()["planEndsAt"] == sub["planEndsAt"]


def test_online_payment_order_belongs_to_its_organization(client, org):
    order = client.post("/api/subscription/checkout", headers=org["h"], json={"planKey": "u100"}).json()
    other = auth(register_org(client, "Other")["token"])
    paid = {"razorpayOrderId": order["orderId"], "razorpayPaymentId": "pay_plan_2", "razorpaySignature": "test_sig_plan_2"}
    assert client.post("/api/subscription/checkout/confirm", headers=other, json=paid).status_code == 404
    assert client.get("/api/subscription", headers=org["h"]).json()["status"] == "trial"


def test_webhook_starts_a_paid_plan(client, org):
    import hashlib
    import hmac
    import json

    order = client.post("/api/subscription/checkout", headers=org["h"], json={"planKey": "u100"}).json()

    def send(event_id, amount):
        body = json.dumps(
            {
                "event_id": event_id,
                "event": "payment.captured",
                "payload": {
                    "payment": {
                        "entity": {
                            "id": f"pay_{event_id}",
                            "order_id": order["orderId"],
                            "amount": amount,
                            "notes": {"purpose": "subscription", "organization_id": org["id"]},
                        }
                    }
                },
            }
        )
        sig = hmac.new(b"test-razorpay-webhook-secret", body.encode(), hashlib.sha256).hexdigest()
        res = client.post("/api/razorpay/webhook", data=body, headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig})
        assert res.status_code == 200, res.text

    send("evt_plan_short", 100)  # not the plan's price: nothing starts
    assert client.get("/api/subscription", headers=org["h"]).json()["status"] == "trial"
    send("evt_plan_ok", order["amount"])
    sub = client.get("/api/subscription", headers=org["h"]).json()
    assert sub["status"] == "active" and sub["planKey"] == "u100"


def test_checkout_refuses_a_plan_too_small(client, org):
    res = client.post("/api/subscription/checkout", headers=org["h"], json={"planKey": "custom", "users": 1, "modules": []})
    assert res.status_code == 200  # the admin alone fits in one user
    with patch("backend.services.plans.users_used", return_value=5):
        res = client.post("/api/subscription/checkout", headers=org["h"], json={"planKey": "custom", "users": 2, "modules": []})
    assert res.status_code == 409


# --------------------------------------------------------------------------- #
# Storage per plan, and the plans on the public website
# --------------------------------------------------------------------------- #
def test_plans_have_storage_and_uploads_stop_when_full(client, org):
    import io

    h = org["h"]
    assert [t["storageGb"] for t in client.get("/api/subscription/plans", headers=h).json()["tiers"]] == [10, 50, 200]
    assert _quote(client, h, "u500")["storageGb"] == 50
    assert _quote(client, h, "custom", users=300, modules="pos")["storageGb"] == 50

    sub = client.get("/api/subscription", headers=h).json()
    assert sub["storageUsedBytes"] == 0 and sub["storageLimitBytes"] == 10 * 1024**3  # trial: the smallest plan's

    ok = client.post("/api/documents", headers=h, files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")})
    assert ok.status_code == 201, ok.text
    assert client.get("/api/subscription", headers=h).json()["storageUsedBytes"] == 5
    with patch("backend.services.plans.storage_limit_bytes", return_value=8):
        full = client.post("/api/documents", headers=h, files={"file": ("b.txt", io.BytesIO(b"world"), "text/plain")})
    assert full.status_code == 413 and "storage is full" in full.json()["detail"]


def test_public_plans_match_the_app(client, org):
    public = client.get("/api/public/plans")
    assert public.status_code == 200, public.text
    body = public.json()
    inside = client.get("/api/subscription/plans", headers=org["h"]).json()
    assert body["tiers"] == inside["tiers"] and body["yearlyMonths"] == inside["yearlyMonths"]
    assert "payment" not in body and body["trialDays"] >= 0



def test_catalog_tells_the_trial_length(client, org):
    assert client.get("/api/subscription/plans", headers=org["h"]).json()["trialDays"] == client.get("/api/public/plans").json()["trialDays"]
