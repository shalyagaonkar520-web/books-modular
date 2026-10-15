"""Connected apps: the platform admin's management screens and the app's own API.

* ``platform_router`` (``/api/platform``, require_superuser in main.py): connect
  an app to an organization with chosen permissions and events, rotate or
  revoke its key, see and resend its webhook deliveries, send a test ping.
* ``connect_router`` (``/api/connect/v1``): what a connected app calls with its
  key to learn what it may use. Everything else it does through the normal
  Books API (backend/features.py lists which paths each permission opens).
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend import features
from backend.db import get_db
from backend.deps import get_current_superuser, get_current_user
from backend.models import AppConnection, IntegrationEvent, Organization, PlatformAdmin, User, WebhookDelivery
from backend.schemas.integrations import (
    ConnectedAppIn,
    ConnectedAppOut,
    ConnectedAppSecrets,
    ConnectedAppUpdate,
    WebhookDeliveryOut,
    WebhookTestResult,
)
from backend.services import audit, integrations, subscription, webhook_dispatcher

platform_router = APIRouter(prefix="/api/platform", tags=["Platform: connected apps"])
connect_router = APIRouter(prefix="/api/connect/v1", tags=["Connected apps"])


def _counts(db: Session, conn_ids: List[str]) -> Dict[str, Dict[str, int]]:
    if not conn_ids:
        return {}
    rows = db.execute(
        select(WebhookDelivery.connection_id, WebhookDelivery.status, func.count())
        .where(WebhookDelivery.connection_id.in_(conn_ids), WebhookDelivery.status.in_(("pending", "dead")))
        .group_by(WebhookDelivery.connection_id, WebhookDelivery.status)
    ).all()
    out: Dict[str, Dict[str, int]] = {}
    for conn_id, state, count in rows:
        out.setdefault(conn_id, {})[state] = count
    return out


def _out(conn: AppConnection, counts: Optional[Dict[str, int]] = None) -> ConnectedAppOut:
    counts = counts or {}
    return ConnectedAppOut(
        id=conn.id,
        organization_id=conn.organization_id,
        name=conn.name,
        key_prefix=conn.key_prefix,
        scopes=integrations.parse_list(conn.scopes),
        events=integrations.parse_list(conn.events),
        webhook_url=conn.webhook_url,
        is_active=conn.is_active,
        created_by=conn.created_by,
        created_at=conn.created_at,
        last_used_at=conn.last_used_at,
        revoked_at=conn.revoked_at,
        pending_deliveries=counts.get("pending", 0),
        failed_deliveries=counts.get("dead", 0),
    )


def _org(db: Session, org_id: str) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def _conn(db: Session, conn_id: str) -> AppConnection:
    conn = db.get(AppConnection, conn_id)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connected app not found")
    return conn


def _check_url(url: Optional[str]) -> None:
    error = integrations.webhook_url_error(url)
    if error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, error)


def _active(conn: AppConnection) -> None:
    if not conn.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This app has been disconnected. Connect it again to get a new key.")


# --------------------------------------------------------------------------- #
# Platform admin
# --------------------------------------------------------------------------- #
@platform_router.get("/connected-apps/catalog")
def catalog(_admin: PlatformAdmin = Depends(get_current_superuser)) -> Dict[str, Any]:
    """What can be granted: features (read/write) and events."""
    return {
        "features": [
            {"key": f.key, "label": f.label, "description": f.description, "planKeys": list(f.plan_keys)} for f in features.connectable()
        ],
        "events": integrations.event_catalog(),
    }


@platform_router.get("/organizations/{org_id}/connected-apps", response_model=List[ConnectedAppOut])
def list_connected_apps(org_id: str, _admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    _org(db, org_id)
    conns = (
        db.execute(select(AppConnection).where(AppConnection.organization_id == org_id).order_by(AppConnection.created_at.desc()))
        .scalars()
        .all()
    )
    counts = _counts(db, [c.id for c in conns])
    return [_out(c, counts.get(c.id)) for c in conns]


@platform_router.post("/organizations/{org_id}/connected-apps", response_model=ConnectedAppSecrets, status_code=201)
def connect_app(org_id: str, payload: ConnectedAppIn, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    org = _org(db, org_id)
    _check_url(payload.webhook_url)
    conn, key = integrations.create_connection(db, org.id, payload.name, payload.scopes, payload.events, payload.webhook_url, admin.email)
    db.flush()
    audit.record(
        db,
        admin,
        "create",
        "connected_app",
        conn.id,
        f"App '{conn.name}' connected ({', '.join(payload.scopes) or 'no permissions'})",
        org.id,
    )
    db.commit()
    return ConnectedAppSecrets(connection=_out(conn), api_key=key, webhook_secret=integrations.signing_secret(conn))


@platform_router.patch("/connected-apps/{conn_id}", response_model=ConnectedAppOut)
def update_connected_app(
    conn_id: str, payload: ConnectedAppUpdate, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)
):
    conn = _conn(db, conn_id)
    _active(conn)
    fields = payload.model_fields_set
    if "name" in fields and payload.name:
        conn.name = payload.name
    if "scopes" in fields and payload.scopes is not None:
        conn.scopes = json.dumps(payload.scopes)
    if "events" in fields and payload.events is not None:
        conn.events = json.dumps(payload.events)
    if "webhook_url" in fields:
        url = payload.webhook_url or None
        _check_url(url)
        conn.webhook_url = url
    audit.record(db, admin, "update", "connected_app", conn.id, f"App '{conn.name}' permissions or webhook changed", conn.organization_id)
    db.commit()
    return _out(conn, _counts(db, [conn.id]).get(conn.id))


@platform_router.post("/connected-apps/{conn_id}/rotate-key", response_model=ConnectedAppSecrets)
def rotate_app_key(conn_id: str, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    conn = _conn(db, conn_id)
    _active(conn)
    key = integrations.rotate_key(conn)
    audit.record(
        db,
        admin,
        "update",
        "connected_app",
        conn.id,
        f"New API key issued for '{conn.name}' (the old one stopped working)",
        conn.organization_id,
    )
    db.commit()
    return ConnectedAppSecrets(connection=_out(conn), api_key=key)


@platform_router.post("/connected-apps/{conn_id}/rotate-secret", response_model=ConnectedAppSecrets)
def rotate_webhook_secret(conn_id: str, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    conn = _conn(db, conn_id)
    _active(conn)
    conn.secret_version += 1
    audit.record(db, admin, "update", "connected_app", conn.id, f"New webhook signing secret for '{conn.name}'", conn.organization_id)
    db.commit()
    return ConnectedAppSecrets(connection=_out(conn), webhook_secret=integrations.signing_secret(conn))


@platform_router.post("/connected-apps/{conn_id}/revoke", response_model=ConnectedAppOut)
def revoke_app(conn_id: str, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    conn = _conn(db, conn_id)
    if conn.is_active:
        integrations.revoke(conn)
        db.execute(
            WebhookDelivery.__table__.update()
            .where(WebhookDelivery.connection_id == conn.id, WebhookDelivery.status == "pending")
            .values(status="dead", last_error="The app was disconnected.")
        )
        audit.record(
            db, admin, "delete", "connected_app", conn.id, f"App '{conn.name}' disconnected; its key no longer works", conn.organization_id
        )
        db.commit()
    return _out(conn, _counts(db, [conn.id]).get(conn.id))


@platform_router.get("/connected-apps/{conn_id}/deliveries", response_model=List[WebhookDeliveryOut])
def list_deliveries(
    conn_id: str,
    state: Optional[str] = Query(default=None, alias="status", pattern="^(pending|delivered|dead)$"),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: PlatformAdmin = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    _conn(db, conn_id)
    stmt = (
        select(WebhookDelivery, IntegrationEvent)
        .join(IntegrationEvent, IntegrationEvent.id == WebhookDelivery.event_id)
        .where(WebhookDelivery.connection_id == conn_id)
    )
    if state:
        stmt = stmt.where(WebhookDelivery.status == state)
    rows = db.execute(stmt.order_by(WebhookDelivery.created_at.desc()).limit(limit)).all()
    return [
        WebhookDeliveryOut(
            id=d.id,
            event_id=e.id,
            event_type=e.type,
            entity_id=e.entity_id,
            status=d.status,
            attempts=d.attempts,
            next_attempt_at=d.next_attempt_at,
            last_status_code=d.last_status_code,
            last_error=d.last_error,
            delivered_at=d.delivered_at,
            created_at=d.created_at,
        )
        for d, e in rows
    ]


@platform_router.post("/webhook-deliveries/{delivery_id}/resend", response_model=WebhookDeliveryOut)
def resend_delivery(delivery_id: str, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    delivery = db.get(WebhookDelivery, delivery_id)
    if delivery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delivery not found")
    conn = _conn(db, delivery.connection_id)
    _active(conn)
    delivery.status = "pending"
    delivery.attempts = 0
    delivery.next_attempt_at = datetime.now(UTC)
    delivery.last_error = None
    audit.record(
        db, admin, "update", "connected_app", conn.id, f"Event {delivery.event.type} queued again for '{conn.name}'", conn.organization_id
    )
    db.commit()
    e = delivery.event
    return WebhookDeliveryOut(
        id=delivery.id,
        event_id=e.id,
        event_type=e.type,
        entity_id=e.entity_id,
        status=delivery.status,
        attempts=delivery.attempts,
        next_attempt_at=delivery.next_attempt_at,
        last_status_code=delivery.last_status_code,
        last_error=delivery.last_error,
        delivered_at=delivery.delivered_at,
        created_at=delivery.created_at,
    )


@platform_router.post("/connected-apps/{conn_id}/test-webhook", response_model=WebhookTestResult)
def test_webhook(conn_id: str, _admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    """Send a signed ``ping`` now and report what the app answered."""
    conn = _conn(db, conn_id)
    _active(conn)
    if not conn.webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This app has no webhook URL.")
    error = integrations.webhook_url_error(conn.webhook_url)
    if error:
        return WebhookTestResult(ok=False, error=error)
    body = json.dumps(
        {
            "id": f"ping_{int(time.time())}",
            "type": "ping",
            "version": integrations.EVENT_VERSION,
            "source": "books",
            "organizationId": conn.organization_id,
            "occurredAt": datetime.now(UTC).isoformat(),
            "data": {},
        },
        separators=(",", ":"),
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "RoomanBooks-Webhooks/1",
        "X-Rooman-Event": "ping",
        "X-Rooman-Delivery": "ping",
        "X-Rooman-Signature": integrations.sign(integrations.signing_secret(conn), int(time.time()), body),
    }
    try:
        code = webhook_dispatcher._post(conn.webhook_url, body, headers)
    except Exception as exc:
        return WebhookTestResult(ok=False, error=f"Could not reach the app: {type(exc).__name__}")
    return WebhookTestResult(ok=200 <= code < 300, status_code=code, error=None if 200 <= code < 300 else f"The app answered HTTP {code}.")


# --------------------------------------------------------------------------- #
# The connected app itself
# --------------------------------------------------------------------------- #
@connect_router.get("/me")
def whoami(request: Request, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """The app, its organization, what it may use and which events it receives."""
    conn: Optional[AppConnection] = getattr(request.state, "connected_app", None)
    if conn is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a connected app's API key can use this endpoint.")
    org = user.organization
    scopes = integrations.parse_list(conn.scopes)
    granted = []
    for f in features.connectable():
        levels = [lvl for lvl in features.ACCESS_LEVELS if f"{f.key}:{lvl}" in scopes]
        if levels:
            granted.append({"key": f.key, "label": f.label, "access": levels, "paths": list(f.paths), "planKeys": list(f.plan_keys)})
    plan = subscription.paid_modules(org)
    return {
        "app": {"id": conn.id, "name": conn.name, "keyPrefix": conn.key_prefix},
        "organization": {"id": org.id, "name": org.name, "code": org.code, "subscription": subscription.effective_status(org)},
        "planModules": sorted(plan) if plan is not None else None,
        "features": granted,
        "events": integrations.parse_list(conn.events),
        "webhookUrl": conn.webhook_url,
    }
