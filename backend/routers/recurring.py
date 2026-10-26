"""Recurring invoice and bill profiles."""

from __future__ import annotations

import json
from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import ROLE_ADMIN, get_current_user, module_write_error, require_write
from backend.models import Bill, Invoice, JournalEntry, RecurringProfile, User
from backend.schemas.common import Message, Page
from backend.schemas.documents_flow import (
    GeneratedDocument,
    RecurringProfileCreate,
    RecurringProfileOut,
    RecurringProfileUpdate,
    RecurringRunResult,
)
from backend.services import audit, recurring
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/recurring-profiles", tags=["Recurring"])

_KIND_MODULE = {"invoice": "invoices", "bill": "bills", "journal": "accounting"}


def _check_module(user: User, kind: str) -> None:
    # Journals post straight to the ledger: the same admins who write manual journals.
    if kind == "journal" and user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can set up recurring journals")
    error = module_write_error(user, (_KIND_MODULE[kind],))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)


def profile_out(p: RecurringProfile) -> RecurringProfileOut:
    return RecurringProfileOut(
        id=p.id,
        name=p.name,
        kind=p.kind,
        contact_id=p.contact_id,
        contact_name=p.contact.display_name if p.contact else "",
        frequency=p.frequency,
        interval_count=p.interval_count,
        start_date=p.start_date,
        end_date=p.end_date,
        next_run_date=p.next_run_date,
        status=p.status,
        auto_issue=p.auto_issue,
        template=json.loads(p.template),
        total=p.total,
        runs_count=p.runs_count,
        last_run_date=p.last_run_date,
        last_error=p.last_error,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _apply(db: Session, profile: RecurringProfile, payload: RecurringProfileCreate, org_id: str) -> None:
    template = recurring.clean_template(payload.template)
    contact, total = recurring.validate_template(db, org_id, payload.kind, template, payload.start_date)
    schedule_changed = (
        profile.start_date != payload.start_date
        or profile.frequency != payload.frequency
        or profile.interval_count != payload.interval_count
    )
    profile.name = payload.name
    profile.kind = payload.kind
    profile.contact_id = contact.id if contact else None
    profile.frequency = payload.frequency
    profile.interval_count = payload.interval_count
    profile.start_date = payload.start_date
    profile.end_date = payload.end_date
    profile.auto_issue = payload.auto_issue
    profile.template = json.dumps(template)
    profile.total = total
    if schedule_changed or profile.next_run_date is None:
        # A new schedule starts from today: nothing already past is backfilled
        # except on a brand-new profile, whose start date may be in the past.
        base = payload.start_date if not profile.runs_count else max(payload.start_date, date.today())
        profile.next_run_date = recurring.first_on_or_after(payload.start_date, payload.frequency, payload.interval_count, base)
    if profile.end_date and profile.next_run_date and profile.next_run_date > profile.end_date:
        profile.status, profile.next_run_date = "completed", None
    elif profile.status == "completed":
        profile.status = "active"


def _load(db: Session, profile_id: str, org_id: str) -> RecurringProfile:
    return get_or_404(db, RecurringProfile, profile_id, org_id, "Recurring profile")


@router.get("", response_model=Page[RecurringProfileOut])
def list_profiles(
    kind: Optional[Literal["invoice", "bill", "journal"]] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(RecurringProfile)
        .where(RecurringProfile.organization_id == user.organization_id)
        .options(selectinload(RecurringProfile.contact))
    )
    if kind:
        stmt = stmt.where(RecurringProfile.kind == kind)
    if status_filter:
        stmt = stmt.where(RecurringProfile.status == status_filter)
    rows, total = paginate(db, stmt.order_by(RecurringProfile.created_at.desc()), pagination)
    return Page(items=[profile_out(p) for p in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/run-due", response_model=RecurringRunResult)
def run_due_profiles(user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Create every document now due on this organization's active profiles."""
    return recurring.run_due(db, user.organization_id)


@router.get("/{profile_id}", response_model=RecurringProfileOut)
def get_profile(profile_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_out(_load(db, profile_id, user.organization_id))


@router.get("/{profile_id}/documents", response_model=List[GeneratedDocument])
def generated_documents(profile_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = _load(db, profile_id, user.organization_id)
    if profile.kind == "journal":
        entries = db.execute(
            select(JournalEntry).where(JournalEntry.recurring_profile_id == profile.id).order_by(JournalEntry.date.desc())
        ).scalars()
        return [GeneratedDocument(id=e.id, number=e.entry_number, date=e.date, status="posted", total=e.total) for e in entries]
    if profile.kind == "invoice":
        rows = db.execute(select(Invoice).where(Invoice.recurring_profile_id == profile.id).order_by(Invoice.date.desc())).scalars()
        return [GeneratedDocument(id=i.id, number=i.invoice_number, date=i.date, status=i.status, total=i.total) for i in rows]
    rows = db.execute(select(Bill).where(Bill.recurring_profile_id == profile.id).order_by(Bill.date.desc())).scalars()
    return [GeneratedDocument(id=b.id, number=b.bill_number, date=b.date, status=b.status, total=b.total) for b in rows]


@router.post("", response_model=RecurringProfileOut, status_code=status.HTTP_201_CREATED)
def create_profile(payload: RecurringProfileCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    _check_module(user, payload.kind)
    profile = RecurringProfile(organization_id=user.organization_id, status="active", runs_count=0, created_by=user.id)
    _apply(db, profile, payload, user.organization_id)
    db.add(profile)
    db.flush()
    audit.record(db, user, "create", "recurring_profile", profile.id, f"Created recurring {profile.kind} profile '{profile.name}'")
    db.commit()
    db.refresh(profile)
    return profile_out(profile)


@router.put("/{profile_id}", response_model=RecurringProfileOut)
def update_profile(profile_id: str, payload: RecurringProfileUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    profile = _load(db, profile_id, user.organization_id)
    if payload.kind != profile.kind:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A profile's type cannot be changed; create a new profile instead")
    if profile.status == "stopped":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A stopped profile cannot be edited")
    _check_module(user, profile.kind)
    _apply(db, profile, payload, user.organization_id)
    audit.record(db, user, "update", "recurring_profile", profile.id, f"Updated recurring profile '{profile.name}'")
    db.commit()
    db.refresh(profile)
    return profile_out(profile)


def _change_state(profile_id: str, action: str, user: User, db: Session) -> RecurringProfileOut:
    profile = _load(db, profile_id, user.organization_id)
    _check_module(user, profile.kind)
    if action == "pause":
        if profile.status != "active":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {profile.status} profile cannot be paused")
        profile.status = "paused"
    elif action == "resume":
        if profile.status != "paused":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {profile.status} profile cannot be resumed")
        profile.status = "active"
        # Dates missed while paused are skipped, not backfilled.
        profile.next_run_date = recurring.first_on_or_after(profile.start_date, profile.frequency, profile.interval_count, date.today())
        if profile.end_date and profile.next_run_date > profile.end_date:
            profile.status, profile.next_run_date = "completed", None
    else:
        if profile.status in ("stopped", "completed"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The profile is already {profile.status}")
        profile.status, profile.next_run_date = "stopped", None
    audit.record(db, user, "update", "recurring_profile", profile.id, f"Recurring profile '{profile.name}' {profile.status}")
    db.commit()
    db.refresh(profile)
    return profile_out(profile)


@router.post("/{profile_id}/pause", response_model=RecurringProfileOut)
def pause_profile(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    return _change_state(profile_id, "pause", user, db)


@router.post("/{profile_id}/resume", response_model=RecurringProfileOut)
def resume_profile(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    return _change_state(profile_id, "resume", user, db)


@router.post("/{profile_id}/stop", response_model=RecurringProfileOut)
def stop_profile(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    return _change_state(profile_id, "stop", user, db)


@router.post("/{profile_id}/run", response_model=RecurringRunResult)
def run_profile(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Create whatever is due on this profile now."""
    profile = _load(db, profile_id, user.organization_id)
    _check_module(user, profile.kind)
    return recurring.run_profile(db, profile, user=user)


@router.post("/{profile_id}/run-now", response_model=GeneratedDocument)
def run_now(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Create one document dated today, outside the schedule."""
    profile = _load(db, profile_id, user.organization_id)
    _check_module(user, profile.kind)
    if profile.status == "stopped":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A stopped profile cannot create documents")
    return recurring.run_now(db, profile, user)


@router.delete("/{profile_id}", response_model=Message)
def delete_profile(profile_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Remove the profile; documents it already created are kept."""
    profile = _load(db, profile_id, user.organization_id)
    _check_module(user, profile.kind)
    name = profile.name
    model = {"invoice": Invoice, "bill": Bill, "journal": JournalEntry}[profile.kind]
    for doc in db.execute(select(model).where(model.recurring_profile_id == profile.id)).scalars():
        doc.recurring_profile_id = None
    db.delete(profile)
    audit.record(db, user, "delete", "recurring_profile", profile_id, f"Deleted recurring profile '{name}'")
    db.commit()
    return Message(message=f"Recurring profile '{name}' deleted")
