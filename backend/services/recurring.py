"""Recurring invoices and bills: generate documents from a saved template on a schedule.

A profile keeps the body POST /api/invoices (or /api/bills) takes, minus its
dates. Each run creates one document dated on the scheduled day, so a profile
that was not run for a while catches up with correctly dated documents. Runs
happen from the hourly background loop below, from "Run due profiles" in the
app, or on demand for a single profile.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import RecurringProfile, User
from backend.schemas.documents_flow import GeneratedDocument, RecurringRunResult
from backend.schemas.purchases import BillCreate
from backend.schemas.sales import InvoiceCreate
from backend.services import doc_flow
from backend.services.documents import compute_lines, totals
from backend.services.periods import add_months

logger = logging.getLogger("roomanbooks.recurring")

_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}
# Keys of the template that each run sets itself.
_RUN_KEYS = {"date", "dueDate", "due_date", "status"}
# A long-paused profile catches up at most this many documents in one run.
MAX_CATCH_UP = 24


def occurrence(start: date, frequency: str, interval: int, index: int) -> date:
    """The index-th scheduled date (0 = start). Months are counted from the start,
    so a profile on the 31st lands on the last day of shorter months and back on
    the 31st after them."""
    if frequency == "weekly":
        return start + timedelta(weeks=interval * index)
    return add_months(start, _MONTHS[frequency] * interval * index)


def next_after(start: date, frequency: str, interval: int, current: date) -> date:
    """The first scheduled date strictly after ``current``."""
    if current < start:
        return start
    if frequency == "weekly":
        index = (current - start).days // (7 * interval)
    else:
        months = (current.year - start.year) * 12 + current.month - start.month
        index = max(0, months // (_MONTHS[frequency] * interval) - 1)
    while occurrence(start, frequency, interval, index) <= current:
        index += 1
    return occurrence(start, frequency, interval, index)


def first_on_or_after(start: date, frequency: str, interval: int, day: date) -> date:
    return start if day <= start else next_after(start, frequency, interval, day - timedelta(days=1))


def clean_template(template: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in template.items() if k not in _RUN_KEYS}


def build_payload(profile_kind: str, template: Dict[str, Any], run_date: date, issue: bool):
    body = {**clean_template(template), "date": run_date.isoformat()}
    try:
        if profile_kind == "invoice":
            return InvoiceCreate.model_validate({**body, "status": "sent" if issue else "draft"})
        return BillCreate.model_validate({**body, "status": "open" if issue else "draft"})
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first.get("loc", ()))
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Template is not a valid {profile_kind}: {where} {first.get('msg')}") from exc


def validate_template(db: Session, org_id: str, kind: str, template: Dict[str, Any], start: date):
    """Check the template prices like a real document; returns (contact, total)."""
    payload = build_payload(kind, template, start, issue=False)
    party = "customer" if kind == "invoice" else "vendor"
    contact = doc_flow.get_party(db, org_id, getattr(payload, f"{party}_id"), party)
    _, subtotal, tax_total = compute_lines(db, org_id, payload.lines, kind=kind, discount=payload.discount_amount)
    return contact, totals(subtotal, payload.discount_amount, tax_total)


def _create(db: Session, profile: RecurringProfile, user: User, run_date: date):
    # Imported here: the routers import this module's callers.
    from backend.routers.bills import create_bill_record
    from backend.routers.invoices import create_invoice_record

    payload = build_payload(profile.kind, json.loads(profile.template), run_date, profile.auto_issue)
    if profile.kind == "invoice":
        doc = create_invoice_record(db, user, payload, recurring_profile_id=profile.id)
        return GeneratedDocument(id=doc.id, number=doc.invoice_number, date=doc.date, status=doc.status, total=doc.total)
    doc = create_bill_record(db, user, payload, recurring_profile_id=profile.id)
    return GeneratedDocument(id=doc.id, number=doc.bill_number, date=doc.date, status=doc.status, total=doc.total)


def _acting_user(db: Session, profile: RecurringProfile) -> Optional[User]:
    """Who generated documents are recorded as: the profile's creator, else any active admin."""
    user = db.get(User, profile.created_by) if profile.created_by else None
    if user and user.is_active and user.organization_id == profile.organization_id:
        return user
    return (
        db.execute(select(User).where(User.organization_id == profile.organization_id, User.role == "admin", User.is_active.is_(True)))
        .scalars()
        .first()
    )


def run_profile(db: Session, profile: RecurringProfile, today: Optional[date] = None, user: Optional[User] = None) -> RecurringRunResult:
    """Create every document now due on the profile, committing each one with the schedule move."""
    today = today or date.today()
    result = RecurringRunResult()
    user = user or _acting_user(db, profile)
    if user is None:
        result.errors.append(f"{profile.name}: no active admin to record the documents as")
        return result
    profile_id = profile.id
    while profile.status == "active" and profile.next_run_date and profile.next_run_date <= today and len(result.created) < MAX_CATCH_UP:
        run_date = profile.next_run_date
        if profile.end_date and run_date > profile.end_date:
            break
        try:
            created = _create(db, profile, user, run_date)
            profile.runs_count += 1
            profile.last_run_date = run_date
            profile.last_error = None
            profile.next_run_date = next_after(profile.start_date, profile.frequency, profile.interval_count, run_date)
            db.commit()
            result.created.append(created)
        except HTTPException as exc:
            db.rollback()
            profile = db.get(RecurringProfile, profile_id)
            profile.last_error = str(exc.detail)[:500]
            db.commit()
            result.errors.append(f"{profile.name}: {exc.detail}")
            break
    if profile.status == "active" and profile.end_date and profile.next_run_date and profile.next_run_date > profile.end_date:
        profile.status = "completed"
        profile.next_run_date = None
        db.commit()
    return result


def run_now(db: Session, profile: RecurringProfile, user: User, today: Optional[date] = None) -> GeneratedDocument:
    """One extra document dated today, outside the schedule."""
    created = _create(db, profile, user, today or date.today())
    profile.runs_count += 1
    profile.last_run_date = created.date
    profile.last_error = None
    db.commit()
    return created


def run_due(db: Session, organization_id: Optional[str] = None, today: Optional[date] = None) -> RecurringRunResult:
    today = today or date.today()
    stmt = select(RecurringProfile.id).where(
        RecurringProfile.status == "active", RecurringProfile.next_run_date.is_not(None), RecurringProfile.next_run_date <= today
    )
    if organization_id:
        stmt = stmt.where(RecurringProfile.organization_id == organization_id)
    total = RecurringRunResult()
    for profile_id in list(db.execute(stmt).scalars()):
        profile = db.get(RecurringProfile, profile_id)
        result = run_profile(db, profile, today)
        total.created.extend(result.created)
        total.errors.extend(result.errors)
    return total


# --------------------------------------------------------------------------- #
# Background loop
# --------------------------------------------------------------------------- #
_task: asyncio.Task | None = None
_INTERVAL_SECONDS = 3600


async def _loop() -> None:
    await asyncio.sleep(90)
    while True:
        try:

            def work() -> List[str]:
                with SessionLocal() as db:
                    result = run_due(db)
                    if result.created:
                        logger.info("Recurring profiles created %d document(s)", len(result.created))
                    return result.errors

            for error in await asyncio.to_thread(work):
                logger.warning("Recurring profile failed: %s", error)
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - the loop must never die
            logger.exception("Recurring profiles tick failed")
        await asyncio.sleep(_INTERVAL_SECONDS)


def start() -> None:
    global _task
    if get_settings().environment == "test":
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="recurring-profiles")


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
