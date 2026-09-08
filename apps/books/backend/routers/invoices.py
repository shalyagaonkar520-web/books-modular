"""Sales invoices."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Contact, Invoice, InvoiceLine, Project, TimeEntry, User
from backend.schemas.common import Message, Page
from backend.schemas.sales import (
    InvoiceCreate,
    InvoiceListItem,
    InvoiceOut,
    InvoiceStats,
    InvoiceStatusUpdate,
    InvoiceUpdate,
    LineOut,
)
from backend.services import audit, inventory, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import compute_lines, group_by_account, totals
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/invoices", tags=["Sales"])

OPEN_STATUSES = ("sent", "partially_paid")


def effective_status(inv: Invoice, today: Optional[date] = None) -> str:
    today = today or date.today()
    if inv.status in OPEN_STATUSES and inv.due_date < today:
        return "overdue"
    return inv.status


def line_out(line: InvoiceLine) -> LineOut:
    return LineOut(
        id=line.id,
        position=line.position,
        item_id=line.item_id,
        account_id=line.account_id,
        description=line.description,
        quantity=line.quantity,
        rate=line.rate,
        tax_rate=line.tax_rate,
        amount=line.amount,
        tax_amount=line.tax_amount,
        item_name=line.item.name if line.item else None,
    )


def to_out(inv: Invoice) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        customer_id=inv.customer_id,
        customer_name=inv.customer.display_name,
        customer_email=inv.customer.email,
        customer_gstin=inv.customer.gstin,
        customer_billing_address=inv.customer.billing_address,
        project_id=inv.project_id,
        date=inv.date,
        due_date=inv.due_date,
        status=effective_status(inv),
        reference=inv.reference,
        subtotal=inv.subtotal,
        discount_amount=inv.discount_amount,
        tax_total=inv.tax_total,
        total=inv.total,
        amount_paid=inv.amount_paid,
        balance_due=money(inv.balance_due),
        notes=inv.notes,
        terms=inv.terms,
        sent_at=inv.sent_at,
        lines=[line_out(line) for line in inv.lines],
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


def to_list_item(inv: Invoice) -> InvoiceListItem:
    return InvoiceListItem(
        id=inv.id,
        invoice_number=inv.invoice_number,
        customer_id=inv.customer_id,
        customer_name=inv.customer.display_name,
        date=inv.date,
        due_date=inv.due_date,
        status=effective_status(inv),
        total=inv.total,
        amount_paid=inv.amount_paid,
        balance_due=money(inv.balance_due),
        reference=inv.reference,
    )


def _apply_payload(db: Session, inv: Invoice, payload: InvoiceCreate, org_id: str) -> None:
    customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
    if customer.type != "customer":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    if payload.project_id:
        project = get_or_404(db, Project, payload.project_id, org_id, "Project")
        if project.customer_id and project.customer_id != customer.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project belongs to a different customer")
    computed, subtotal, tax_total = compute_lines(db, org_id, payload.lines)
    inv.customer_id = customer.id
    inv.project_id = payload.project_id
    inv.date = payload.date
    inv.due_date = payload.due_date or (payload.date + timedelta(days=customer.payment_terms_days))
    inv.reference = payload.reference
    inv.discount_amount = money(payload.discount_amount)
    inv.notes = payload.notes
    inv.terms = payload.terms
    inv.subtotal = subtotal
    inv.tax_total = tax_total
    inv.total = totals(subtotal, inv.discount_amount, tax_total)
    inv.lines.clear()
    for position, line in enumerate(computed):
        inv.lines.append(
            InvoiceLine(
                item_id=line.item.id if line.item else None,
                account_id=line.account.id if line.account else None,
                position=position,
                description=line.spec.description,
                quantity=line.quantity,
                rate=line.rate,
                tax_rate=line.tax_rate,
                amount=line.amount,
                tax_amount=line.tax_amount,
            )
        )


def post_invoice(db: Session, inv: Invoice, user: User) -> None:
    """Journal: Dr AR total, Dr Discount; Cr income accounts, Cr Output GST. Plus COGS for tracked goods."""
    org_id = inv.organization_id
    ar = get_account_by_code(db, org_id, "1100")
    output_gst = get_account_by_code(db, org_id, "2100")
    default_sales = get_account_by_code(db, org_id, "4000")
    discount_acct = get_account_by_code(db, org_id, "4300")

    income_pairs = []
    for line in inv.lines:
        account_id = line.account_id or (line.item.sales_account_id if line.item and line.item.sales_account_id else default_sales.id)
        income_pairs.append((account_id, line.amount))
    lines = [(ar.id, inv.total, Decimal("0"), f"Invoice {inv.invoice_number}", inv.customer_id)]
    if inv.discount_amount > 0:
        lines.append((discount_acct.id, inv.discount_amount, Decimal("0"), f"Discount on {inv.invoice_number}", inv.customer_id))
    for account_id, amount in group_by_account(income_pairs).items():
        lines.append((account_id, Decimal("0"), amount, f"Invoice {inv.invoice_number}", inv.customer_id))
    if inv.tax_total > 0:
        lines.append((output_gst.id, Decimal("0"), inv.tax_total, f"GST on {inv.invoice_number}", inv.customer_id))
    ledger.post_entry(db, org_id, inv.date, lines, "invoice", inv.id, reference=inv.invoice_number, created_by=user.id)

    # Perpetual inventory: relieve stock and recognise COGS at cost.
    cogs_default = get_account_by_code(db, org_id, "5000")
    inventory_acct = get_account_by_code(db, org_id, "1200")
    cogs_lines = []
    for line in inv.lines:
        item = line.item
        if item and item.track_inventory:
            inventory.adjust_stock(db, item, -line.quantity, inv.date, "invoice_stock", inv.id, f"Sold on {inv.invoice_number}", user.id, rate=Decimal("0"))
            cost = money(line.quantity * money(item.cost_price))
            if cost > 0:
                cogs_account = item.purchase_account_id or cogs_default.id
                cogs_lines.append((cogs_account, cost, Decimal("0"), f"COGS {item.name} ({inv.invoice_number})", None))
                cogs_lines.append((inventory_acct.id, Decimal("0"), cost, f"Stock out {item.name} ({inv.invoice_number})", None))
    if cogs_lines:
        ledger.post_entry(db, org_id, inv.date, cogs_lines, "invoice_cogs", inv.id, reference=inv.invoice_number, created_by=user.id)


def unpost_invoice(db: Session, inv: Invoice, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, inv.organization_id, "invoice", inv.id, today, user.id, reason)
    ledger.reverse_entries_for_source(db, inv.organization_id, "invoice_cogs", inv.id, today, user.id, reason)
    for line in inv.lines:
        if line.item and line.item.track_inventory:
            inventory.adjust_stock(db, line.item, line.quantity, today, "invoice_stock", inv.id, f"{reason} {inv.invoice_number}", user.id, rate=Decimal("0"))


def _base_query(org_id: str):
    return select(Invoice).where(Invoice.organization_id == org_id).options(
        selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item)
    )


@router.get("", response_model=Page[InvoiceListItem])
def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _base_query(user.organization_id)
    today = date.today()
    if status_filter == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status_filter == "unpaid":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES))
    elif status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(Invoice.date >= start_date)
    if end_date:
        stmt = stmt.where(Invoice.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.join(Contact, Contact.id == Invoice.customer_id).where(
            or_(func.lower(Invoice.invoice_number).like(q), func.lower(Contact.display_name).like(q), func.lower(Invoice.reference).like(q))
        )
    stmt = stmt.order_by(Invoice.date.desc(), Invoice.invoice_number.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_list_item(i) for i in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/stats", response_model=InvoiceStats)
def invoice_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    open_invoices = db.execute(
        select(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status.in_(OPEN_STATUSES))
    ).scalars().all()
    overdue = [i for i in open_invoices if i.due_date < today]
    soon = [i for i in open_invoices if today <= i.due_date <= today + timedelta(days=30)]
    drafts = db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status == "draft")
    ).scalar_one()
    return InvoiceStats(
        total_outstanding=money(sum((i.balance_due for i in open_invoices), Decimal("0"))),
        overdue=money(sum((i.balance_due for i in overdue), Decimal("0"))),
        due_within_30_days=money(sum((i.balance_due for i in soon), Decimal("0"))),
        draft_count=drafts,
        unpaid_count=len(open_invoices),
        overdue_count=len(overdue),
    )


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.execute(_base_query(user.organization_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return to_out(inv)


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = Invoice(
        organization_id=user.organization_id,
        invoice_number=numbering.next_number(db, user.organization_id, "invoice"),
        status="draft",
        created_by=user.id,
    )
    _apply_payload(db, inv, payload, user.organization_id)
    db.add(inv)
    db.flush()
    if payload.status == "sent":
        inv.status = "sent"
        inv.sent_at = datetime.now(UTC)
        post_invoice(db, inv, user)
    audit.record(db, user, "create", "invoice", inv.id, f"Created invoice {inv.invoice_number} ({inv.status})")
    db.commit()
    return get_invoice(inv.id, user, db)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, payload: InvoiceUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.status in ("paid", "partially_paid", "void") or inv.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoices with payments or voided invoices cannot be edited")
    was_posted = inv.status == "sent"
    if was_posted:
        unpost_invoice(db, inv, user, "Invoice edited")
    _apply_payload(db, inv, payload, user.organization_id)
    db.flush()
    if payload.status == "sent" or was_posted:
        inv.status = "sent"
        inv.sent_at = inv.sent_at or datetime.now(UTC)
        post_invoice(db, inv, user)
    else:
        inv.status = "draft"
    audit.record(db, user, "update", "invoice", inv.id, f"Updated invoice {inv.invoice_number}")
    db.commit()
    return get_invoice(inv.id, user, db)


@router.post("/{invoice_id}/status", response_model=InvoiceOut)
def change_status(invoice_id: str, payload: InvoiceStatusUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    target = payload.status
    if target == "sent":
        if inv.status != "draft":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft invoices can be marked as sent")
        inv.status = "sent"
        inv.sent_at = datetime.now(UTC)
        post_invoice(db, inv, user)
    elif target == "void":
        if inv.status == "void":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice is already void")
        if inv.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Delete the recorded payments before voiding this invoice")
        if inv.status != "draft":
            unpost_invoice(db, inv, user, "Invoice voided")
        inv.status = "void"
    elif target == "draft":
        if inv.status != "sent" or inv.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only unpaid sent invoices can be reverted to draft")
        unpost_invoice(db, inv, user, "Invoice reverted to draft")
        inv.status = "draft"
    audit.record(db, user, "update", "invoice", inv.id, f"Invoice {inv.invoice_number} marked {inv.status}")
    db.commit()
    return get_invoice(inv.id, user, db)


@router.delete("/{invoice_id}", response_model=Message)
def delete_invoice(invoice_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.status not in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft or void invoices can be deleted. Void the invoice first.")
    if inv.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice has payments recorded")
    for entry in db.execute(select(TimeEntry).where(TimeEntry.invoice_id == inv.id)).scalars():
        entry.invoice_id = None
    number = inv.invoice_number
    db.delete(inv)
    audit.record(db, user, "delete", "invoice", invoice_id, f"Deleted invoice {number}")
    db.commit()
    return Message(message=f"Invoice {number} deleted")
