"""Projects and timesheets, plus billing unbilled time into an invoice."""
from __future__ import annotations

from datetime import timezone, date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Contact, Invoice, InvoiceLine, Project, TimeEntry, User
from backend.schemas.common import Message, Page
from backend.schemas.sales import InvoiceOut
from backend.schemas.timetracking import (
    InvoiceFromTimeRequest,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryUpdate,
)
from backend.services import audit, numbering
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api", tags=["Time Tracking"])


def _hours_summary(db: Session, project_ids: List[str]) -> dict:
    if not project_ids:
        return {}
    entries = db.execute(select(TimeEntry).where(TimeEntry.project_id.in_(project_ids))).scalars().all()
    summary: dict = {}
    for e in entries:
        s = summary.setdefault(e.project_id, {"logged": Decimal("0"), "billable": Decimal("0"), "unbilled": Decimal("0")})
        s["logged"] += e.hours
        if e.is_billable:
            s["billable"] += e.hours
            if e.invoice_id is None:
                s["unbilled"] += e.hours
    return summary


def project_out(p: Project, summary: Optional[dict] = None) -> ProjectOut:
    s = summary or {"logged": Decimal("0"), "billable": Decimal("0"), "unbilled": Decimal("0")}
    return ProjectOut(
        id=p.id, name=p.name, customer_id=p.customer_id, customer_name=p.customer.display_name if p.customer else None,
        description=p.description, billing_method=p.billing_method, hourly_rate=p.hourly_rate, budget_hours=p.budget_hours, status=p.status,
        logged_hours=s["logged"], billable_hours=s["billable"], unbilled_hours=s["unbilled"],
        unbilled_amount=money(s["unbilled"] * p.hourly_rate) if p.billing_method == "hourly" else Decimal("0"), created_at=p.created_at,
    )


def entry_out(e: TimeEntry) -> TimeEntryOut:
    return TimeEntryOut(
        id=e.id, project_id=e.project_id, project_name=e.project.name, customer_name=e.project.customer.display_name if e.project.customer else None,
        user_id=e.user_id, user_name=e.user.name, date=e.date, hours=e.hours, description=e.description, is_billable=e.is_billable,
        invoice_id=e.invoice_id, created_at=e.created_at,
    )


@router.get("/projects", response_model=List[ProjectOut])
def list_projects(status_filter: Optional[str] = Query(None, alias="status"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Project).where(Project.organization_id == user.organization_id).options(selectinload(Project.customer))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    rows = db.execute(stmt.order_by(Project.created_at.desc())).scalars().all()
    summary = _hours_summary(db, [p.id for p in rows])
    return [project_out(p, summary.get(p.id)) for p in rows]


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_or_404(db, Project, project_id, user.organization_id, "Project")
    return project_out(p, _hours_summary(db, [p.id]).get(p.id))


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    if payload.customer_id:
        customer = get_or_404(db, Contact, payload.customer_id, user.organization_id, "Customer")
        if customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    p = Project(organization_id=user.organization_id, **payload.model_dump())
    db.add(p)
    db.flush()
    audit.record(db, user, "create", "project", p.id, f"Created project {p.name}")
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, payload: ProjectUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    p = get_or_404(db, Project, project_id, user.organization_id, "Project")
    data = payload.model_dump(exclude_unset=True)
    if data.get("customer_id"):
        customer = get_or_404(db, Contact, data["customer_id"], user.organization_id, "Customer")
        if customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    for field, value in data.items():
        setattr(p, field, value)
    audit.record(db, user, "update", "project", p.id, f"Updated project {p.name}")
    db.commit()
    db.refresh(p)
    return project_out(p, _hours_summary(db, [p.id]).get(p.id))


@router.delete("/projects/{project_id}", response_model=Message)
def delete_project(project_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    p = get_or_404(db, Project, project_id, user.organization_id, "Project")
    billed = db.execute(select(TimeEntry.id).where(TimeEntry.project_id == p.id, TimeEntry.invoice_id.is_not(None)).limit(1)).first()
    linked = db.execute(select(Invoice.id).where(Invoice.project_id == p.id).limit(1)).first()
    if billed or linked:
        p.status = "completed"
        db.commit()
        return Message(message="Project has invoiced time and was marked completed instead of deleted")
    db.delete(p)
    audit.record(db, user, "delete", "project", project_id, f"Deleted project {p.name}")
    db.commit()
    return Message(message="Project deleted")


@router.get("/time-entries", response_model=Page[TimeEntryOut])
def list_time_entries(
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    unbilled_only: bool = False,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(TimeEntry).where(TimeEntry.organization_id == user.organization_id).options(
        selectinload(TimeEntry.project).selectinload(Project.customer), selectinload(TimeEntry.user)
    )
    if project_id:
        stmt = stmt.where(TimeEntry.project_id == project_id)
    if user_id:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    if start_date:
        stmt = stmt.where(TimeEntry.date >= start_date)
    if end_date:
        stmt = stmt.where(TimeEntry.date <= end_date)
    if unbilled_only:
        stmt = stmt.where(TimeEntry.is_billable.is_(True), TimeEntry.invoice_id.is_(None))
    stmt = stmt.order_by(TimeEntry.date.desc(), TimeEntry.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[entry_out(e) for e in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/time-entries", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED)
def create_time_entry(payload: TimeEntryCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    project = get_or_404(db, Project, payload.project_id, user.organization_id, "Project")
    if project.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Time can only be logged on active projects")
    target_user_id = user.id
    if payload.user_id and payload.user_id != user.id:
        if user.role != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can log time for other users")
        target = db.get(User, payload.user_id)
        if target is None or target.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        target_user_id = target.id
    entry = TimeEntry(
        organization_id=user.organization_id, project_id=project.id, user_id=target_user_id, date=payload.date,
        hours=payload.hours, description=payload.description, is_billable=payload.is_billable,
    )
    db.add(entry)
    db.flush()
    audit.record(db, user, "create", "time_entry", entry.id, f"Logged {entry.hours}h on {project.name}")
    db.commit()
    db.refresh(entry)
    return entry_out(entry)


@router.put("/time-entries/{entry_id}", response_model=TimeEntryOut)
def update_time_entry(entry_id: str, payload: TimeEntryUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    entry = get_or_404(db, TimeEntry, entry_id, user.organization_id, "Time entry")
    if entry.invoice_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoiced time entries cannot be edited")
    if entry.user_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own time entries")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry_out(entry)


@router.delete("/time-entries/{entry_id}", response_model=Message)
def delete_time_entry(entry_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    entry = get_or_404(db, TimeEntry, entry_id, user.organization_id, "Time entry")
    if entry.invoice_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoiced time entries cannot be deleted")
    if entry.user_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own time entries")
    db.delete(entry)
    db.commit()
    return Message(message="Time entry deleted")


@router.post("/time-entries/invoice", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def invoice_unbilled_time(payload: InvoiceFromTimeRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    from backend.routers.invoices import get_invoice, post_invoice  # local import to avoid cycle

    org_id = user.organization_id
    project = get_or_404(db, Project, payload.project_id, org_id, "Project")
    if not project.customer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project must be linked to a customer to invoice time")
    if project.billing_method != "hourly" or project.hourly_rate <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project needs an hourly billing rate")
    stmt = select(TimeEntry).where(TimeEntry.project_id == project.id, TimeEntry.is_billable.is_(True), TimeEntry.invoice_id.is_(None))
    if payload.time_entry_ids:
        stmt = stmt.where(TimeEntry.id.in_(payload.time_entry_ids))
    entries = db.execute(stmt.order_by(TimeEntry.date)).scalars().all()
    if not entries:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No unbilled billable time entries found")
    hours = sum((e.hours for e in entries), Decimal("0"))
    customer = db.get(Contact, project.customer_id)
    inv = Invoice(
        organization_id=org_id, invoice_number=numbering.next_number(db, org_id, "invoice"), customer_id=customer.id, project_id=project.id,
        date=payload.date, due_date=payload.due_date or (payload.date + timedelta(days=customer.payment_terms_days)), status="sent",
        sent_at=datetime.now(timezone.utc), created_by=user.id, reference=f"Project: {project.name}",
    )
    amount = money(hours * project.hourly_rate)
    tax = money(amount * Decimal(str(payload.tax_rate)) / Decimal("100"))
    inv.subtotal = amount
    inv.tax_total = tax
    inv.discount_amount = Decimal("0")
    inv.total = money(amount + tax)
    first, last = entries[0].date, entries[-1].date
    inv.lines.append(InvoiceLine(position=0, description=f"{project.name}: {hours} hours of professional services ({first} to {last})",
                                 quantity=hours, rate=project.hourly_rate, tax_rate=payload.tax_rate, amount=amount, tax_amount=tax))
    db.add(inv)
    db.flush()
    for e in entries:
        e.invoice_id = inv.id
    post_invoice(db, inv, user)
    audit.record(db, user, "create", "invoice", inv.id, f"Invoiced {hours}h on {project.name} as {inv.invoice_number}")
    db.commit()
    return get_invoice(inv.id, user, db)
