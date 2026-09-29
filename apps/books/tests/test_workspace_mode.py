"""Workspace mode: a platform admin working inside an org is attributed in its audit log."""

import uuid

import jwt

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import PlatformAdmin
from backend.security import ALGORITHM, hash_password
from tests.conftest import auth, register_org


def _platform(client):
    email = f"ws-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="WS Admin", email=email, password_hash=hash_password("WsAdmin123!"), is_active=True))
        db.commit()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": "WsAdmin123!"}).json()["accessToken"]
    return email, auth(token)


def _claims(token):
    return jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])


def _enter(client, ph, ctx):
    uid = client.get("/api/auth/me", headers=auth(ctx["token"])).json()["user"]["id"]
    res = client.post(f"/api/platform/users/{uid}/impersonate", headers=ph)
    assert res.status_code == 200, res.text
    return res.json()["accessToken"]


def test_changes_in_workspace_are_attributed_to_the_platform_admin(client):
    admin_email, ph = _platform(client)
    ctx = register_org(client, "WsOrg")
    tok = _enter(client, ph, ctx)
    assert _claims(tok)["imp"] == admin_email

    item = client.post(
        "/api/items",
        headers=auth(tok),
        json={"name": "Support-made item", "sku": f"WS-{uuid.uuid4().hex[:5]}", "type": "service", "sellingPrice": 100, "taxRate": 18},
    )
    assert item.status_code == 201, item.text

    logs = client.get("/api/audit-logs", headers=auth(ctx["token"])).json()["items"]
    entry = next(log for log in logs if log.get("entityId") == item.json()["id"])
    assert f"[via platform admin {admin_email}]" in entry["summary"]


def test_session_refresh_keeps_the_attribution(client):
    admin_email, ph = _platform(client)
    ctx = register_org(client, "WsMe")
    tok = _enter(client, ph, ctx)
    me = client.get("/api/auth/me", headers=auth(tok))
    assert me.status_code == 200
    assert _claims(me.json()["accessToken"])["imp"] == admin_email


def test_normal_tenant_actions_are_not_annotated(client):
    ctx = register_org(client, "WsPlain")
    h = auth(ctx["token"])
    assert "imp" not in _claims(ctx["token"])
    assert "imp" not in _claims(client.get("/api/auth/me", headers=h).json()["accessToken"])
    item = client.post("/api/items", headers=h, json={"name": "Plain item", "sku": f"PL-{uuid.uuid4().hex[:5]}", "type": "service", "sellingPrice": 50, "taxRate": 0})
    assert item.status_code == 201
    logs = client.get("/api/audit-logs", headers=h).json()["items"]
    entry = next(log for log in logs if log.get("entityId") == item.json()["id"])
    assert "via platform admin" not in (entry["summary"] or "")
