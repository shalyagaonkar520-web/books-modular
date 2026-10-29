"""Every saved change, field by field: who changed what, from what, to what.

A ``before_flush`` hook on every session writes one ``ChangeLog`` row per
inserted, updated or deleted record of an organization, with each changed
column's old and new value. Nothing has to call it, so no change (even ₹1
on one line) can be missed. Who made the change comes from ``session.info``
(see ``set_actor``), filled in by the sign-in dependencies.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from backend.models import ChangeLog, Organization, new_id

# Bookkeeping that is not a business change, or has its own log.
SKIP_TABLES = frozenset(
    {
        "change_logs",
        "audit_logs",
        "login_events",
        "refresh_tokens",
        "platform_refresh_tokens",
        "org_panel_refresh_tokens",
        "org_panel_admins",
        "platform_admins",
        "platform_settings",
        "email_verifications",
        "document_sequences",
        "idempotency_records",
        "integration_events",
        "webhook_deliveries",
        "payment_events",
        "razorpay_sync_logs",
        "workflow_runs",
        "pos_scanner_sessions",
        "pos_scans",
        "support_tickets",
        "support_messages",
    }
)
# Columns that change on their own or must never be shown.
SKIP_COLUMNS = frozenset({"created_at", "updated_at", "last_login_at", "invite_token_expires_at", "sessions_revoked_at"})
SECRET_HINTS = ("password", "token", "secret", "_hash", "api_key")
LABEL_FIELDS = ("number", "invoice_number", "bill_number", "display_name", "name", "sku", "title", "code", "email", "reference")
MAX_TEXT = 300


def set_actor(db: Session, user: Any, name: Optional[str] = None, role: Optional[str] = None) -> None:
    """Who the changes in this session are by (a tenant user, or a platform admin with ``user=None``)."""
    db.info["change_actor"] = {
        "user_id": getattr(user, "id", None) if user is not None else None,
        "name": name or (getattr(user, "name", None) if user is not None else None),
        "role": role or (getattr(user, "role", None) if user is not None else None),
    }


def _plain(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, Decimal):
        return format(value.normalize(), "f") if value == value.to_integral() else str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    text = str(value)
    return text if len(text) <= MAX_TEXT else text[: MAX_TEXT - 1] + "…"


def _secret(column: str) -> bool:
    return any(hint in column for hint in SECRET_HINTS)


def _org_id(obj: Any) -> Optional[str]:
    if isinstance(obj, Organization):
        return obj.id
    return getattr(obj, "organization_id", None)


def _label(obj: Any) -> Optional[str]:
    for field in LABEL_FIELDS:
        value = getattr(obj, field, None)
        if isinstance(value, str) and value.strip():
            return value.strip()[:200]
    return None


def _columns(obj: Any):
    mapper = inspect(obj).mapper
    for attr in mapper.column_attrs:
        if attr.key in SKIP_COLUMNS:
            continue
        yield attr.key


def _diff(obj: Any) -> Dict[str, list]:
    state = inspect(obj)
    out: Dict[str, list] = {}
    for key in _columns(obj):
        hist = state.attrs[key].history
        if not hist.has_changes():
            continue
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else None
        if _plain(old) == _plain(new):
            continue
        out[key] = ["•••", "•••"] if _secret(key) else [_plain(old), _plain(new)]
    return out


def _snapshot(obj: Any) -> Dict[str, list]:
    out: Dict[str, list] = {}
    for key in _columns(obj):
        value = getattr(obj, key, None)
        if value is None or key in ("id", "organization_id"):
            continue
        out[key] = [None, "•••" if _secret(key) else _plain(value)]
    return out


def _entity_id(obj: Any) -> Optional[str]:
    ident = inspect(obj).identity
    if ident:
        return str(ident[0])
    value = getattr(obj, "id", None)
    return str(value) if value is not None else None


def _record(session: Session, obj: Any, action: str, changes: Dict[str, list]) -> None:
    org_id = _org_id(obj)
    if not org_id:
        return
    actor = session.info.get("change_actor") or {}
    session.add(
        ChangeLog(
            organization_id=org_id,
            user_id=actor.get("user_id"),
            user_name=actor.get("name") or "System",
            user_role=actor.get("role"),
            action=action,
            entity_type=obj.__class__.__tablename__,
            entity_id=_entity_id(obj),
            entity_label=_label(obj),
            changes=json.dumps(changes, ensure_ascii=False, default=str),
        )
    )


def _loggable(obj: Any) -> bool:
    table = getattr(obj.__class__, "__tablename__", None)
    return bool(table) and table not in SKIP_TABLES


@event.listens_for(Session, "before_flush")
def _capture(session: Session, flush_context, instances) -> None:  # noqa: ARG001
    if session.info.get("change_log_off"):
        return
    for obj in list(session.new):
        if not _loggable(obj):
            continue
        # Give it its id now, so the log can point at it.
        mapper = inspect(obj).mapper
        if "id" in mapper.columns and getattr(obj, "id", None) is None and mapper.columns["id"].default is not None:
            if getattr(mapper.columns["id"].default, "arg", None) is not None and mapper.columns["id"].type.python_type is str:
                obj.id = new_id()
        _record(session, obj, "create", _snapshot(obj))
    for obj in list(session.dirty):
        if not _loggable(obj) or not session.is_modified(obj, include_collections=False):
            continue
        changes = _diff(obj)
        if changes:
            _record(session, obj, "update", changes)
    for obj in list(session.deleted):
        if _loggable(obj):
            _record(session, obj, "delete", {})
