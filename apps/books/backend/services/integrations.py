"""Connected apps: scoped API keys, events (outbox) and signed webhooks.

How another app uses Books (docs/INTEGRATIONS.md has the developer guide):

* **Asking** - it calls the normal Books API with ``Authorization: Bearer
  rbk_<prefix>_<secret>``. deps.get_current_user resolves the key to the
  connection's service user and lets the request through only on a path of a
  feature it holds a scope for (``invoices:read`` for GET, ``invoices:write``
  for anything else). The organization's plan still applies.
* **Being told** - when a watched record (contact, item, invoice, payment,
  bill, expense) is created, changed or deleted, ``_collect_events`` writes an
  ``IntegrationEvent`` and one ``WebhookDelivery`` per subscribed app in the
  same flush, so an event exists exactly when the change is saved. The
  dispatcher (services/webhook_dispatcher.py) posts it, signed, with retries.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import secrets
import socket
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend import features
from backend.config import get_settings
from backend.models import (
    AppConnection,
    Bill,
    Contact,
    CustomerPayment,
    Expense,
    IntegrationEvent,
    Invoice,
    Item,
    User,
    VendorPayment,
    WebhookDelivery,
    new_id,
)
from backend.security import hash_token

KEY_PREFIX = "rbk_"
INTEGRATION_ROLE = "integration"
CONNECT_PREFIX = "/api/connect/"
EVENT_VERSION = 1

# --------------------------------------------------------------------------- #
# Watched records -> events
# --------------------------------------------------------------------------- #
# model: (event name, feature whose read scope an app needs to receive it, payload fields)
WATCHED: Dict[type, Tuple[str, str, Tuple[str, ...]]] = {
    Contact: ("contact", "contacts", ("type", "display_name", "company_name", "email", "phone", "gstin", "is_active")),
    Item: ("item", "items", ("name", "type", "sku", "unit", "selling_price", "tax_rate", "is_active")),
    Invoice: ("invoice", "invoices", ("invoice_number", "customer_id", "date", "due_date", "status", "total", "amount_paid")),
    CustomerPayment: ("payment_received", "paymentsReceived", ("payment_number", "customer_id", "invoice_id", "date", "amount", "mode")),
    Bill: ("bill", "bills", ("bill_number", "vendor_id", "date", "due_date", "status", "total", "amount_paid")),
    VendorPayment: ("payment_made", "paymentsMade", ("payment_number", "vendor_id", "bill_id", "date", "amount", "mode")),
    Expense: ("expense", "expenses", ("expense_number", "date", "vendor_id", "customer_id", "total", "status")),
}
ACTIONS = ("created", "updated", "deleted")


def event_catalog() -> List[Dict[str, str]]:
    """Every event type an app can subscribe to, with the feature whose read scope it needs."""
    return [{"type": f"{name}.{action}", "feature": feature} for name, feature, _ in WATCHED.values() for action in ACTIONS]


def event_types() -> List[str]:
    return [e["type"] for e in event_catalog()]


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _snapshot(obj: Any, fields: Iterable[str]) -> Dict[str, Any]:
    data = {"id": obj.id}
    data.update({_camel(f): _json_value(getattr(obj, f, None)) for f in fields})
    return data


# --------------------------------------------------------------------------- #
# Keys, scopes and secrets
# --------------------------------------------------------------------------- #
def generate_key() -> Tuple[str, str]:
    """(full key shown once, display prefix). Only ``hash_token(full key)`` is stored."""
    prefix = secrets.token_hex(4)
    return f"{KEY_PREFIX}{prefix}_{secrets.token_urlsafe(32)}", f"{KEY_PREFIX}{prefix}"


def is_api_key(token: str) -> bool:
    return token.startswith(KEY_PREFIX)


def find_connection(db: Session, token: str) -> Optional[AppConnection]:
    """The active connection a key belongs to, else None."""
    conn = db.execute(select(AppConnection).where(AppConnection.key_hash == hash_token(token))).scalar_one_or_none()
    if conn is None or not conn.is_active or conn.revoked_at is not None:
        return None
    return conn


def parse_list(value: Optional[str]) -> List[str]:
    try:
        data = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    return [str(v) for v in data] if isinstance(data, list) else []


def normalize_scopes(scopes: Iterable[str]) -> List[str]:
    """Known scopes only, catalog order; ``x:write`` also grants ``x:read``. Raises ValueError on an unknown one."""
    known = features.scope_catalog()
    wanted = set(scopes)
    unknown = sorted(wanted - set(known))
    if unknown:
        raise ValueError(f"Unknown scope(s): {', '.join(unknown)}")
    for scope in list(wanted):
        if scope.endswith(":write"):
            wanted.add(scope[: -len("write")] + "read")
    return [s for s in known if s in wanted]


def normalize_events(types: Iterable[str]) -> List[str]:
    known = event_types()
    wanted = set(types)
    unknown = sorted(wanted - set(known))
    if unknown:
        raise ValueError(f"Unknown event type(s): {', '.join(unknown)}")
    return [t for t in known if t in wanted]


def scope_error(conn: AppConnection, method: str, path: str) -> Optional[str]:
    """Why a connected app may not make this request (the 403 detail), else None."""
    if path.startswith(CONNECT_PREFIX):
        return None  # the app's own endpoints (routers/connected_apps.py)
    feature = features.feature_for_path(path)
    if feature is None:
        return "Connected apps cannot use this part of the API."
    level = "read" if method in ("GET", "HEAD", "OPTIONS") else "write"
    if f"{feature.key}:{level}" not in parse_list(conn.scopes):
        return f"This app's key does not have the {feature.key}:{level} permission."
    return None


def signing_secret(conn: AppConnection) -> str:
    """The webhook signing secret, derived from the server secret (rotated by bumping secret_version)."""
    key = get_settings().secret_key.encode("utf-8")
    digest = hmac.new(key, f"webhook:{conn.id}:{conn.secret_version}".encode(), hashlib.sha256).hexdigest()
    return f"whsec_{digest}"


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """``X-Rooman-Signature`` value: ``t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">``."""
    mac = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={mac}"


# --------------------------------------------------------------------------- #
# Webhook URL safety
# --------------------------------------------------------------------------- #
def webhook_url_error(url: Optional[str]) -> Optional[str]:
    """Why a webhook URL is refused, else None.

    https only in production; never an address on this server or the private
    network unless its host is listed in WEBHOOK_ALLOWED_HOSTS (internal
    Rooman apps), so a webhook cannot be aimed at internal services.
    """
    if not url:
        return None
    settings = get_settings()
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        return "The webhook URL must start with https:// and include a host."
    if parsed.username or parsed.password:
        return "The webhook URL must not contain a user name or password."
    if parsed.scheme != "https" and settings.is_production:
        return "The webhook URL must use https."
    host = parsed.hostname.lower()
    if host in settings.webhook_allowed_hosts or settings.webhook_allow_private:
        return None
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))}
    except OSError:
        return "The webhook host could not be found."
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        private = ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified
        if private and not settings.webhook_allow_private:
            return "The webhook URL points to a private or local address. Ask to add its host to WEBHOOK_ALLOWED_HOSTS."
    return None


# --------------------------------------------------------------------------- #
# Connections
# --------------------------------------------------------------------------- #
def create_connection(
    db: Session,
    org_id: str,
    name: str,
    scopes: Iterable[str],
    events: Iterable[str],
    webhook_url: Optional[str],
    created_by: Optional[str],
) -> Tuple[AppConnection, str]:
    """A new connection and its service user (not committed). Returns (connection, full key)."""
    conn_id = new_id()
    service_user = User(
        id=new_id(),
        organization_id=org_id,
        name=f"{name} (connected app)"[:120],
        email=f"app-{conn_id}@connected-apps.invalid",
        password_hash=None,
        role=INTEGRATION_ROLE,
        is_active=True,
    )
    db.add(service_user)
    key, prefix = generate_key()
    conn = AppConnection(
        id=conn_id,
        organization_id=org_id,
        name=name,
        key_prefix=prefix,
        key_hash=hash_token(key),
        scopes=json.dumps(normalize_scopes(scopes)),
        events=json.dumps(normalize_events(events)),
        webhook_url=webhook_url or None,
        service_user_id=service_user.id,
        created_by=created_by,
    )
    db.add(conn)
    return conn, key


def rotate_key(conn: AppConnection) -> str:
    key, prefix = generate_key()
    conn.key_hash = hash_token(key)
    conn.key_prefix = prefix
    return key


def revoke(conn: AppConnection) -> None:
    conn.is_active = False
    conn.revoked_at = datetime.now(UTC)
    if conn.service_user is not None:
        conn.service_user.is_active = False


def envelope(evt: IntegrationEvent) -> Dict[str, Any]:
    return {
        "id": evt.id,
        "type": evt.type,
        "version": EVENT_VERSION,
        "source": "books",
        "organizationId": evt.organization_id,
        "occurredAt": _json_value(evt.created_at),
        "data": json.loads(evt.payload),
    }


# --------------------------------------------------------------------------- #
# Outbox: events written in the same flush as the change
# --------------------------------------------------------------------------- #
def _subscribers(session: Session, org_ids: set) -> Dict[str, List[AppConnection]]:
    rows = (
        session.execute(
            select(AppConnection).where(
                AppConnection.organization_id.in_(org_ids),
                AppConnection.is_active.is_(True),
                AppConnection.webhook_url.is_not(None),
            )
        )
        .scalars()
        .all()
    )
    out: Dict[str, List[AppConnection]] = {}
    for conn in rows:
        out.setdefault(conn.organization_id, []).append(conn)
    return out


def _collect_events(session: Session, _flush_context, _instances) -> None:
    changes: List[Tuple[Any, str]] = []
    for obj in session.new:
        if type(obj) in WATCHED:
            changes.append((obj, "created"))
    for obj in session.dirty:
        if type(obj) in WATCHED and session.is_modified(obj, include_collections=False):
            changes.append((obj, "updated"))
    for obj in session.deleted:
        if type(obj) in WATCHED:
            changes.append((obj, "deleted"))
    changes = [(obj, action) for obj, action in changes if getattr(obj, "organization_id", None)]
    if not changes:
        return
    with session.no_autoflush:
        subscribers = _subscribers(session, {obj.organization_id for obj, _ in changes})
    if not subscribers:
        return
    now = datetime.now(UTC)
    for obj, action in changes:
        conns = subscribers.get(obj.organization_id)
        if not conns:
            continue
        name, feature, fields = WATCHED[type(obj)]
        if obj.id is None:
            obj.id = new_id()
        evt_type = f"{name}.{action}"
        targets = [c for c in conns if evt_type in parse_list(c.events) and f"{feature}:read" in parse_list(c.scopes)]
        if not targets:
            continue
        evt = IntegrationEvent(
            id=new_id(),
            organization_id=obj.organization_id,
            type=evt_type,
            entity_id=obj.id,
            payload=json.dumps(_snapshot(obj, fields)),
            created_at=now,
        )
        session.add(evt)
        for conn in targets:
            session.add(WebhookDelivery(id=new_id(), event_id=evt.id, connection_id=conn.id, next_attempt_at=now, created_at=now))


event.listen(Session, "before_flush", _collect_events)
