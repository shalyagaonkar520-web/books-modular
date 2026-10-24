"""Workflow rules: when a record is created / updated (or an invoice falls overdue)
and its fields match the conditions, run the actions (email someone, call a webhook).

Matching happens in a before_flush listener, the same way connected-app events
are captured (services/integrations): a WorkflowRun is queued with a snapshot of
the record, and the background loop below runs the actions after the change is
committed, so a slow mail server never holds up the user's request and a
rolled-back change never fires a rule.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
import urllib.request
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import (
    Bill,
    Contact,
    CustomerPayment,
    Estimate,
    Expense,
    Invoice,
    Organization,
    VendorPayment,
    WorkflowRule,
    WorkflowRun,
    new_id,
)

logger = logging.getLogger("roomanbooks.workflows")

# entity name -> (model, fields offered to conditions and message placeholders)
ENTITIES: Dict[str, Tuple[type, Tuple[str, ...]]] = {
    "invoice": (Invoice, ("invoice_number", "status", "total", "balance_due", "date", "due_date", "customer_id", "reference")),
    "bill": (Bill, ("bill_number", "status", "total", "balance_due", "date", "due_date", "vendor_id")),
    "estimate": (Estimate, ("estimate_number", "status", "total", "date", "customer_id")),
    "payment_received": (CustomerPayment, ("payment_number", "amount", "date", "customer_id", "invoice_id", "mode")),
    "payment_made": (VendorPayment, ("payment_number", "amount", "date", "vendor_id", "bill_id", "mode")),
    "expense": (Expense, ("expense_number", "total", "date", "category", "vendor_id")),
    "contact": (Contact, ("display_name", "type", "email", "gstin", "is_active")),
}
_BY_MODEL = {model: name for name, (model, _) in ENTITIES.items()}
TRIGGERS = ("created", "updated", "deleted", "overdue")
OPERATORS = ("equals", "not_equals", "greater_than", "less_than", "contains", "is_empty", "is_not_empty")
MAX_ATTEMPTS = 3


def event_names() -> List[str]:
    names = [f"{entity}.{trigger}" for entity in ENTITIES for trigger in ("created", "updated", "deleted")]
    return names + ["invoice.overdue", "bill.overdue"]


def _value(obj: Any, field: str) -> Any:
    value = getattr(obj, field, None)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def snapshot(entity: str, obj: Any) -> Dict[str, Any]:
    _, fields = ENTITIES[entity]
    data = {field: _value(obj, field) for field in fields}
    data["id"] = obj.id
    return data


def _compare(actual: Any, op: str, expected: Any) -> bool:
    if op == "is_empty":
        return actual in (None, "", 0)
    if op == "is_not_empty":
        return actual not in (None, "", 0)
    if op == "contains":
        return str(expected).lower() in str(actual or "").lower()
    if op in ("greater_than", "less_than"):
        try:
            a, e = float(actual), float(expected)
        except (TypeError, ValueError):
            a, e = str(actual or ""), str(expected or "")
        return a > e if op == "greater_than" else a < e
    equal = str(actual).lower() == str(expected).lower() if actual is not None else expected in (None, "")
    return equal if op == "equals" else not equal


def matches(conditions: List[Dict[str, Any]], data: Dict[str, Any]) -> bool:
    """All conditions must hold (an empty list always matches)."""
    return all(_compare(data.get(c.get("field")), c.get("operator", "equals"), c.get("value")) for c in conditions)


def render(template: str, data: Dict[str, Any]) -> str:
    """Fill {field} placeholders from the record; unknown ones are left as typed."""
    out = template or ""
    for key, value in data.items():
        out = out.replace("{" + key + "}", "" if value is None else str(value))
    return out


# --------------------------------------------------------------------------- #
# Capture
# --------------------------------------------------------------------------- #
def _rules_for(session: Session, org_ids: set) -> Dict[Tuple[str, str], List[WorkflowRule]]:
    rows = session.execute(
        select(WorkflowRule).where(WorkflowRule.organization_id.in_(org_ids), WorkflowRule.is_active.is_(True))
    ).scalars()
    out: Dict[Tuple[str, str], List[WorkflowRule]] = {}
    for rule in rows:
        out.setdefault((rule.organization_id, rule.event), []).append(rule)
    return out


def queue(session: Session, rule: WorkflowRule, entity: str, obj: Any, data: Optional[Dict[str, Any]] = None) -> Optional[WorkflowRun]:
    data = data if data is not None else snapshot(entity, obj)
    if not matches(json.loads(rule.conditions or "[]"), data):
        return None
    run = WorkflowRun(
        id=new_id(),
        organization_id=rule.organization_id,
        rule_id=rule.id,
        entity_type=entity,
        entity_id=data.get("id"),
        event=rule.event,
        payload=json.dumps(data),
        status="pending",
        attempts=0,
        created_at=datetime.now(UTC),
    )
    session.add(run)
    return run


def _collect(session: Session, _flush_context, _instances) -> None:
    changes = []
    for obj in session.new:
        if type(obj) in _BY_MODEL:
            changes.append((obj, "created"))
    for obj in session.dirty:
        if type(obj) in _BY_MODEL and session.is_modified(obj, include_collections=False):
            changes.append((obj, "updated"))
    for obj in session.deleted:
        if type(obj) in _BY_MODEL:
            changes.append((obj, "deleted"))
    changes = [(o, a) for o, a in changes if getattr(o, "organization_id", None)]
    if not changes:
        return
    with session.no_autoflush:
        rules = _rules_for(session, {o.organization_id for o, _ in changes})
        if not rules:
            return
        for obj, action in changes:
            entity = _BY_MODEL[type(obj)]
            for rule in rules.get((obj.organization_id, f"{entity}.{action}"), []):
                if obj.id is None:
                    obj.id = new_id()
                queue(session, rule, entity, obj)


event.listen(Session, "before_flush", _collect)


def queue_overdue(db: Session, today: Optional[date] = None) -> int:
    """Fire invoice.overdue / bill.overdue once per document that has fallen overdue."""
    today = today or date.today()
    queued = 0
    for model, entity, open_statuses in ((Invoice, "invoice", ("sent", "partially_paid")), (Bill, "bill", ("open", "partially_paid"))):
        rules = (
            db.execute(select(WorkflowRule).where(WorkflowRule.event == f"{entity}.overdue", WorkflowRule.is_active.is_(True)))
            .scalars()
            .all()
        )
        for rule in rules:
            docs = db.execute(
                select(model).where(model.organization_id == rule.organization_id, model.status.in_(open_statuses), model.due_date < today)
            ).scalars()
            fired = set(db.execute(select(WorkflowRun.entity_id).where(WorkflowRun.rule_id == rule.id)).scalars())
            for doc in docs:
                if doc.id not in fired and queue(db, rule, entity, doc):
                    queued += 1
    db.commit()
    return queued


# --------------------------------------------------------------------------- #
# Actions
# --------------------------------------------------------------------------- #
def _email(org: Organization, action: Dict[str, Any], data: Dict[str, Any]) -> None:
    from backend.services.email_service import send_custom_message_email

    to = render(action.get("to", ""), data).strip()
    if "@" not in to:
        raise ValueError(f"No email address to send to ({to or 'blank'})")
    result = send_custom_message_email(
        to_email=to,
        subject=render(action.get("subject", "Notification"), data),
        message=render(action.get("message", ""), data),
        company_name=org.name,
    )
    if not result.get("success"):
        raise RuntimeError(result.get("error") or "Email could not be sent")


def _webhook(org: Organization, rule: WorkflowRule, action: Dict[str, Any], run: WorkflowRun, data: Dict[str, Any]) -> None:
    from backend.services.integrations import webhook_url_error

    url = action.get("url", "")
    error = webhook_url_error(url)
    if error:
        raise ValueError(error)
    body = json.dumps({"event": run.event, "rule": rule.name, "organizationId": org.id, "data": data}).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new((rule.id + org.id).encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-Rooman-Timestamp": timestamp, "X-Rooman-Signature": f"sha256={signature}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - URL checked by webhook_url_error
        if resp.status >= 300:
            raise RuntimeError(f"Webhook answered {resp.status}")


def execute(db: Session, run: WorkflowRun) -> None:
    rule = db.get(WorkflowRule, run.rule_id)
    org = db.get(Organization, run.organization_id)
    run.attempts += 1
    if rule is None or org is None or not rule.is_active:
        run.status, run.finished_at = "skipped", datetime.now(UTC)
        return
    data = json.loads(run.payload)
    try:
        for action in json.loads(rule.actions or "[]"):
            kind = action.get("type")
            if kind == "email":
                _email(org, action, data)
            elif kind == "webhook":
                _webhook(org, rule, action, run, data)
        run.status, run.error, run.finished_at = "done", None, datetime.now(UTC)
        rule.run_count = (rule.run_count or 0) + 1
        rule.last_run_at = datetime.now(UTC)
    except Exception as exc:  # noqa: BLE001 - every failure is recorded on the run
        run.error = str(exc)[:500]
        run.status = "failed" if run.attempts >= MAX_ATTEMPTS else "pending"
        if run.status == "failed":
            run.finished_at = datetime.now(UTC)


def process_pending(db: Session, limit: int = 50) -> int:
    runs = (
        db.execute(select(WorkflowRun).where(WorkflowRun.status == "pending").order_by(WorkflowRun.created_at).limit(limit)).scalars().all()
    )
    for run in runs:
        execute(db, run)
        db.commit()
    return len(runs)


# --------------------------------------------------------------------------- #
# Background loop (also sends scheduled reports)
# --------------------------------------------------------------------------- #
_task: asyncio.Task | None = None
_TICK = 60


async def _loop() -> None:
    await asyncio.sleep(30)
    last_daily: Optional[date] = None
    while True:
        try:

            def work() -> None:
                nonlocal last_daily
                from backend.services import report_schedules

                with SessionLocal() as db:
                    if last_daily != date.today():
                        queue_overdue(db)
                        report_schedules.send_due(db)
                        last_daily = date.today()
                    process_pending(db)

            await asyncio.to_thread(work)
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - the loop must never die
            logger.exception("Workflow tick failed")
        await asyncio.sleep(_TICK)


def start() -> None:
    global _task
    if get_settings().environment == "test":
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="workflows")


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):  # noqa: B014 - shutdown must not raise
        pass
    _task = None
