"""Connected apps: scoped API keys, default-deny, events, signed webhooks, idempotent retries."""

import hashlib
import hmac
import json
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import AppConnection, IntegrationEvent, User, WebhookDelivery
from backend.services import integrations, webhook_dispatcher
from tests.conftest import auth, platform_admin_headers, register_org

HOOK = "https://hooks.example.com/rooman"


@pytest.fixture
def tenant(client):
    ctx = register_org(client, "Connect")
    return {"h": auth(ctx["token"]), "org_id": ctx["org"]["id"], "ctx": ctx}


@pytest.fixture
def platform_h(client):
    return platform_admin_headers(client)


def _connect(client, platform_h, org_id, scopes, events=(), webhook_url=None, name="Rooman Bookings"):
    res = client.post(
        f"/api/platform/organizations/{org_id}/connected-apps",
        headers=platform_h,
        json={"name": name, "scopes": list(scopes), "events": list(events), "webhookUrl": webhook_url},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _key_h(created) -> dict:
    return auth(created["apiKey"])


# --------------------------------------------------------------------------- #
# Keys and permissions
# --------------------------------------------------------------------------- #
def test_connect_returns_a_key_once_and_hides_the_service_account(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:write"])
    conn = created["connection"]
    assert created["apiKey"].startswith(conn["keyPrefix"] + "_") and created["webhookSecret"].startswith("whsec_")
    # write implies read
    assert conn["scopes"] == ["contacts:read", "contacts:write"] and conn["isActive"] is True
    listed = client.get(f"/api/platform/organizations/{tenant['org_id']}/connected-apps", headers=platform_h).json()
    assert [c["id"] for c in listed] == [conn["id"]] and "apiKey" not in listed[0]
    with SessionLocal() as db:
        row = db.get(AppConnection, conn["id"])
        assert row.key_hash != created["apiKey"] and created["apiKey"] not in (row.key_prefix, row.scopes)
    # The service account is not one of the organization's users.
    emails = [u["email"] for u in client.get("/api/users", headers=tenant["h"]).json()]
    assert not any(e.endswith("connected-apps.invalid") for e in emails)


def test_scopes_open_only_their_feature(client, tenant, platform_h):
    h = _key_h(_connect(client, platform_h, tenant["org_id"], ["contacts:write", "invoices:read"]))
    assert client.get("/api/contacts", headers=h).status_code == 200
    made = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "From Bookings"})
    assert made.status_code == 201, made.text
    assert client.get("/api/invoices", headers=h).status_code == 200
    refused = client.post("/api/invoices", headers=h, json={})
    assert refused.status_code == 403 and "invoices:write" in refused.json()["detail"]
    # Default deny: anything outside the granted features, and admin areas.
    for path in ("/api/items", "/api/organization", "/api/users", "/api/dashboard/summary", "/api/audit-logs", "/api/subscription"):
        res = client.get(path, headers=h)
        assert res.status_code == 403, (path, res.status_code, res.text)
    # Other token types' areas never accept a key.
    assert client.get("/api/platform/organizations", headers=h).status_code == 401
    assert client.get("/api/org-admin/users", headers=h).status_code == 401


def test_a_key_never_reaches_another_organization(client, tenant, platform_h):
    other = register_org(client, "Elsewhere")
    theirs = client.post("/api/contacts", headers=auth(other["token"]), json={"type": "customer", "displayName": "Not Yours"}).json()
    h = _key_h(_connect(client, platform_h, tenant["org_id"], ["contacts:write"]))
    assert client.get(f"/api/contacts/{theirs['id']}", headers=h).status_code == 404
    names = [c["displayName"] for c in client.get("/api/contacts", headers=h).json()["items"]]
    assert "Not Yours" not in names


def test_the_plan_still_applies(client, tenant, platform_h):
    approved = client.post(
        f"/api/platform/organizations/{tenant['org_id']}/subscription/approve", headers=platform_h, json={"modules": ["invoices"]}
    )
    assert approved.status_code == 200, approved.text
    h = _key_h(_connect(client, platform_h, tenant["org_id"], ["bills:write"]))
    res = client.post("/api/bills", headers=h, json={})
    assert res.status_code == 403 and "subscription plan" in res.json()["detail"]


def test_revoked_and_rotated_keys_stop_working(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:read"])
    conn_id = created["connection"]["id"]
    rotated = client.post(f"/api/platform/connected-apps/{conn_id}/rotate-key", headers=platform_h).json()
    assert client.get("/api/contacts", headers=_key_h(created)).status_code == 401
    assert client.get("/api/contacts", headers=_key_h(rotated)).status_code == 200
    revoked = client.post(f"/api/platform/connected-apps/{conn_id}/revoke", headers=platform_h)
    assert revoked.status_code == 200 and revoked.json()["isActive"] is False
    assert client.get("/api/contacts", headers=_key_h(rotated)).status_code == 401
    assert client.post(f"/api/platform/connected-apps/{conn_id}/rotate-key", headers=platform_h).status_code == 400
    assert client.get("/api/contacts", headers={"Authorization": "Bearer rbk_nope_nope"}).status_code == 401


def test_service_account_cannot_sign_in(client, tenant, platform_h):
    conn = _connect(client, platform_h, tenant["org_id"], ["contacts:read"])["connection"]
    with SessionLocal() as db:
        email = db.get(AppConnection, conn["id"]).service_user.email
    # Refused either as an invalid address or as unknown credentials - never a session.
    assert client.post("/api/auth/login", json={"email": email, "password": "anything-at-all"}).status_code in (401, 422)
    with SessionLocal() as db:
        from backend.security import create_access_token

        user_id = db.get(AppConnection, conn["id"]).service_user_id
    # Even a hand-made session token for it is refused.
    token = create_access_token(user_id, tenant["org_id"], "admin")
    assert client.get("/api/contacts", headers=auth(token)).status_code == 401


def test_only_platform_admins_manage_connections(client, tenant):
    res = client.post(
        f"/api/platform/organizations/{tenant['org_id']}/connected-apps", headers=tenant["h"], json={"name": "Sneaky", "scopes": []}
    )
    assert res.status_code == 401


def test_validation(client, tenant, platform_h):
    url = f"/api/platform/organizations/{tenant['org_id']}/connected-apps"
    assert client.post(url, headers=platform_h, json={"name": "X1", "scopes": ["organization:write"]}).status_code == 422
    assert client.post(url, headers=platform_h, json={"name": "X1", "scopes": [], "events": ["nope.created"]}).status_code == 422
    assert client.post(url, headers=platform_h, json={"name": "X1", "scopes": [], "webhookUrl": "ftp://x"}).status_code == 422
    assert client.post("/api/platform/organizations/nope/connected-apps", headers=platform_h, json={"name": "X1"}).status_code == 404


def test_me_describes_the_app(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["invoices:write"], ["invoice.created"], HOOK)
    me = client.get("/api/connect/v1/me", headers=_key_h(created)).json()
    assert me["app"]["name"] == "Rooman Bookings" and me["organization"]["id"] == tenant["org_id"]
    assert me["features"][0]["key"] == "invoices" and me["features"][0]["access"] == ["read", "write"]
    assert me["events"] == ["invoice.created"] and me["planModules"] is None
    assert client.get("/api/connect/v1/me", headers=tenant["h"]).status_code == 403


# --------------------------------------------------------------------------- #
# Idempotent retries
# --------------------------------------------------------------------------- #
def test_a_retried_write_is_done_once(client, tenant, platform_h):
    h = {**_key_h(_connect(client, platform_h, tenant["org_id"], ["contacts:write"])), "Idempotency-Key": f"k-{uuid.uuid4().hex}"}
    body = {"type": "customer", "displayName": f"Once {uuid.uuid4().hex[:6]}"}
    first = client.post("/api/contacts", headers=h, json=body)
    second = client.post("/api/contacts", headers=h, json=body)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"] and second.headers.get("idempotent-replayed") == "true"
    names = [c["displayName"] for c in client.get("/api/contacts", headers=h, params={"search": body["displayName"]}).json()["items"]]
    assert names.count(body["displayName"]) == 1
    changed = client.post("/api/contacts", headers=h, json={**body, "displayName": "Other"})
    assert changed.status_code == 422


# --------------------------------------------------------------------------- #
# Events and webhooks
# --------------------------------------------------------------------------- #
def _deliveries(conn_id):
    with SessionLocal() as db:
        rows = db.execute(select(WebhookDelivery).where(WebhookDelivery.connection_id == conn_id)).scalars().all()
        return [(d.id, db.get(IntegrationEvent, d.event_id).type, json.loads(db.get(IntegrationEvent, d.event_id).payload)) for d in rows]


def test_changes_become_events_for_subscribed_apps_only(client, tenant, platform_h):
    subscribed = _connect(client, platform_h, tenant["org_id"], ["contacts:read"], ["contact.created", "contact.updated"], HOOK)
    no_scope = _connect(client, platform_h, tenant["org_id"], ["invoices:read"], ["contact.created"], HOOK, name="No scope")
    made = client.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": "Evented Ltd", "email": "e@x.com"})
    assert made.status_code == 201
    got = _deliveries(subscribed["connection"]["id"])
    assert [t for _, t, _ in got] == ["contact.created"]
    assert got[0][2]["id"] == made.json()["id"] and got[0][2]["displayName"] == "Evented Ltd" and "bankAccountNumber" not in got[0][2]
    assert _deliveries(no_scope["connection"]["id"]) == []
    client.put(f"/api/contacts/{made.json()['id']}", headers=tenant["h"], json={**made.json(), "displayName": "Evented Two"})
    assert sorted(t for _, t, _ in _deliveries(subscribed["connection"]["id"])) == ["contact.created", "contact.updated"]


def test_delivery_is_signed_and_retried(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:read"], ["contact.created"], HOOK)
    client.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": "Signed Ltd"})
    sent = {}

    def fake_post(url, body, headers):
        sent.update(url=url, body=body, headers=headers)
        return 503

    with SessionLocal() as db:
        delivery = db.execute(select(WebhookDelivery).where(WebhookDelivery.connection_id == created["connection"]["id"])).scalar_one()
        with patch.object(webhook_dispatcher, "_post", fake_post):
            assert webhook_dispatcher.deliver(db, delivery) is False
        assert delivery.status == "pending" and delivery.attempts == 1 and "503" in delivery.last_error
        # The receiver checks the signature with the secret it was given.
        t, v1 = (part.split("=", 1)[1] for part in sent["headers"]["X-Rooman-Signature"].split(","))
        expected = hmac.new(created["webhookSecret"].encode(), f"{t}.".encode() + sent["body"], hashlib.sha256).hexdigest()
        assert hmac.compare_digest(v1, expected) and sent["url"] == HOOK
        envelope = json.loads(sent["body"])
        assert envelope["type"] == "contact.created" and envelope["organizationId"] == tenant["org_id"] and envelope["version"] == 1
        with patch.object(webhook_dispatcher, "_post", lambda *a: 200):
            assert webhook_dispatcher.deliver(db, delivery) is True
        assert delivery.status == "delivered" and delivery.delivered_at is not None
        # A delivery that keeps failing ends as dead.
        delivery.status, delivery.attempts = "pending", webhook_dispatcher.MAX_ATTEMPTS - 1
        with patch.object(webhook_dispatcher, "_post", lambda *a: 500):
            webhook_dispatcher.deliver(db, delivery)
        assert delivery.status == "dead"
        db.commit()
        delivery_id = delivery.id
    listed = client.get(f"/api/platform/connected-apps/{created['connection']['id']}/deliveries", headers=platform_h).json()
    assert listed[0]["status"] == "dead" and listed[0]["eventType"] == "contact.created"
    resent = client.post(f"/api/platform/webhook-deliveries/{delivery_id}/resend", headers=platform_h).json()
    assert resent["status"] == "pending" and resent["attempts"] == 0


def test_webhook_urls_cannot_target_internal_addresses(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "webhook_allow_private", False)
    monkeypatch.setattr(settings, "webhook_allowed_hosts", ["books-internal.lan"])
    assert "private" in integrations.webhook_url_error("http://127.0.0.1:8000/hook")
    assert "private" in integrations.webhook_url_error("http://169.254.169.254/latest")
    assert integrations.webhook_url_error("https://user:pw@example.com/x") is not None
    assert integrations.webhook_url_error("https://books-internal.lan/hook") is None
    monkeypatch.setattr(settings, "environment", "production")
    assert "https" in integrations.webhook_url_error("http://hooks.example.com/x")


def test_rotating_the_webhook_secret_changes_it(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:read"], [], HOOK)
    rotated = client.post(f"/api/platform/connected-apps/{created['connection']['id']}/rotate-secret", headers=platform_h).json()
    assert rotated["webhookSecret"] and rotated["webhookSecret"] != created["webhookSecret"] and rotated["apiKey"] is None


def test_service_user_role_is_never_stored_as_admin(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:write"])
    client.post("/api/contacts", headers=_key_h(created), json={"type": "customer", "displayName": "Role Check"})
    with SessionLocal() as db:
        user = db.get(AppConnection, created["connection"]["id"]).service_user
        assert db.execute(select(User.role).where(User.id == user.id)).scalar_one() == "integration"


def test_dispatcher_sends_each_due_delivery_once(client, tenant, platform_h):
    created = _connect(client, platform_h, tenant["org_id"], ["contacts:read"], ["contact.created"], HOOK)
    client.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": "Once Only"})
    calls = []
    with patch.object(webhook_dispatcher, "_post", lambda url, body, headers: calls.append(headers["X-Rooman-Delivery"]) or 204):
        webhook_dispatcher.run_once()
        webhook_dispatcher.run_once()  # a second worker / tick finds nothing left to send
    mine = [d for d, _, _ in _deliveries(created["connection"]["id"])]
    assert [c for c in calls if c in mine] == mine and len(mine) == 1
    with SessionLocal() as db:
        assert db.get(WebhookDelivery, mine[0]).status == "delivered"
