"""Vendor bills."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Bill, BillLine, Contact, User
from backend.schemas.common import Message, Page
from backend.schemas.purchases import BillCreate, BillListItem, BillOut, BillStats, BillStatusUpdate, BillUpdate
from backend.schemas.sales import LineOut
from backend.services import audit, inventory, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import compute_lines, group_by_account, totals
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/bills", tags=["Purchases"])
OPEN_STATUSES = ("open", "partially_paid")


def effective_status(bill: Bill, today: Optional[date] = None) -> str:
    today = today or date.today()
    if bill.status in OPEN_STATUSES and bill.due_date < today:
        return "overdue"
    return bill.status


def line_out(line: BillLine) -> LineOut:
    return LineOut(
        id=line.id, position=line.position, item_id=line.item_id, account_id=line.account_id, description=line.description,
        quantity=line.quantity, rate=line.rate, tax_rate=line.tax_rate, amount=line.amount, tax_amount=line.tax_amount,
        item_name=line.item.name if line.item else None,
    )


def to_out(bill: Bill) -> BillOut:
    return BillOut(
        id=bill.id, bill_number=bill.bill_number, vendor_bill_number=bill.vendor_bill_number, vendor_id=bill.vendor_id,
        vendor_name=bill.vendor.display_name, date=bill.date, due_date=bill.due_date, status=effective_status(bill),
        subtotal=bill.subtotal, discount_amount=bill.discount_amount, tax_total=bill.tax_total, total=bill.total,
        amount_paid=bill.amount_paid, balance_due=money(bill.balance_due), notes=bill.notes,
        lines=[line_out(line) for line in bill.lines], created_at=bill.created_at, updated_at=bill.updated_at,
    )


def to_list_item(bill: Bill) -> BillListItem:
    return BillListItem(
        id=bill.id, bill_number=bill.bill_number, vendor_bill_number=bill.vendor_bill_number, vendor_id=bill.vendor_id,
        vendor_name=bill.vendor.display_name, date=bill.date, due_date=bill.due_date, status=effective_status(bill),
        total=bill.total, amount_paid=bill.amount_paid, balance_due=money(bill.balance_due),
    )


def _apply_payload(db: Session, bill: Bill, payload: BillCreate, org_id: str) -> None:
    vendor = get_or_404(db, Contact, payload.vendor_id, org_id, "Vendor")
    if vendor.type != "vendor":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a vendor")
    computed, subtotal, tax_total = compute_lines(db, org_id, payload.lines)
    bill.vendor_id = vendor.id
    bill.vendor_bill_number = payload.vendor_bill_number
    bill.date = payload.date
    bill.due_date = payload.due_date or (payload.date + timedelta(days=vendor.payment_terms_days))
    bill.discount_amount = money(payload.discount_amount)
    bill.notes = payload.notes
    bill.subtotal = subtotal
    bill.tax_total = tax_total
    bill.total = totals(subtotal, bill.discount_amount, tax_total)
    bill.lines.clear()
    for position, line in enumerate(computed):
        bill.lines.append(
            BillLine(
                item_id=line.item.id if line.item else None, account_id=line.account.id if line.account else None, position=position,
                description=line.spec.description, quantity=line.quantity, rate=line.rate, tax_rate=line.tax_rate,
                amount=line.amount, tax_amount=line.tax_amount,
            )
        )


def post_bill(db: Session, bill: Bill, user: User) -> None:
    """Journal: Dr expense/inventory accounts, Dr Input GST; Cr AP total, Cr Purchase Discounts."""
    org_id = bill.organization_id
    ap = get_account_by_code(db, org_id, "2000")
    input_gst = get_account_by_code(db, org_id, "1300")
    inventory_acct = get_account_by_code(db, org_id, "1200")
    default_expense = get_account_by_code(db, org_id, "5000")
    discount_acct = get_account_by_code(db, org_id, "5900")

    debit_pairs = []
    for line in bill.lines:
        item = line.item
        if item and item.track_inventory:
            debit_pairs.append((inventory_acct.id, line.amount))
            unit_cost = money(line.rate)
            inventory.adjust_stock(db, item, line.quantity, bill.date, "bill_stock", bill.id, f"Received on {bill.bill_number}", user.id, rate=Decimal("0"))
            # Keep the item's cost price in sync with the latest purchase rate.
            if unit_cost > 0:
                item.cost_price = unit_cost
        else:
            account_id = line.account_id or (item.purchase_account_id if item and item.purchase_account_id else default_expense.id)
            debit_pairs.append((account_id, line.amount))
    lines = []
    for account_id, amount in group_by_account(debit_pairs).items():
        lines.append((account_id, amount, Decimal("0"), f"Bill {bill.bill_number}", bill.vendor_id))
    if bill.tax_total > 0:
        lines.append((input_gst.id, bill.tax_total, Decimal("0"), f"GST on {bill.bill_number}", bill.vendor_id))
    if bill.discount_amount > 0:
        lines.append((discount_acct.id, Decimal("0"), bill.discount_amount, f"Discount on {bill.bill_number}", bill.vendor_id))
    lines.append((ap.id, Decimal("0"), bill.total, f"Bill {bill.bill_number}", bill.vendor_id))
    ledger.post_entry(db, org_id, bill.date, lines, "bill", bill.id, reference=bill.vendor_bill_number or bill.bill_number, created_by=user.id)


def unpost_bill(db: Session, bill: Bill, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, bill.organization_id, "bill", bill.id, today, user.id, reason)
    for line in bill.lines:
        if line.item and line.item.track_inventory:
            inventory.adjust_stock(db, line.item, -line.quantity, today, "bill_stock", bill.id, f"{reason} {bill.bill_number}", user.id, rate=Decimal("0"), allow_negative=True)


def _base_query(org_id: str):
    return select(Bill).where(Bill.organization_id == org_id).options(selectinload(Bill.vendor), selectinload(Bill.lines).selectinload(BillLine.item))


@router.get("", response_model=Page[BillListItem])
def list_bills(
    status_filter: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[str] = None,
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
        stmt = stmt.where(Bill.status.in_(OPEN_STATUSES), Bill.due_date < today)
    elif status_filter == "unpaid":
        stmt = stmt.where(Bill.status.in_(OPEN_STATUSES))
    elif status_filter:
        stmt = stmt.where(Bill.status == status_filter)
    if vendor_id:
        stmt = stmt.where(Bill.vendor_id == vendor_id)
    if start_date:
        stmt = stmt.where(Bill.date >= start_date)
    if end_date:
        stmt = stmt.where(Bill.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.join(Contact, Contact.id == Bill.vendor_id).where(
            or_(func.lower(Bill.bill_number).like(q), func.lower(Bill.vendor_bill_number).like(q), func.lower(Contact.display_name).like(q))
        )
    stmt = stmt.order_by(Bill.date.desc(), Bill.bill_number.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_list_item(b) for b in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/stats", response_model=BillStats)
def bill_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    open_bills = db.execute(select(Bill).where(Bill.organization_id == user.organization_id, Bill.status.in_(OPEN_STATUSES))).scalars().all()
    overdue = [b for b in open_bills if b.due_date < today]
    soon = [b for b in open_bills if today <= b.due_date <= today + timedelta(days=30)]
    drafts = db.execute(select(func.count()).select_from(Bill).where(Bill.organization_id == user.organization_id, Bill.status == "draft")).scalar_one()
    return BillStats(
        total_outstanding=money(sum((b.balance_due for b in open_bills), Decimal("0"))),
        overdue=money(sum((b.balance_due for b in overdue), Decimal("0"))),
        due_within_30_days=money(sum((b.balance_due for b in soon), Decimal("0"))),
        draft_count=drafts, unpaid_count=len(open_bills), overdue_count=len(overdue),
    )


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(bill_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bill = db.execute(_base_query(user.organization_id).where(Bill.id == bill_id)).scalar_one_or_none()
    if bill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
    return to_out(bill)


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(payload: BillCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    bill = Bill(organization_id=user.organization_id, bill_number=numbering.next_number(db, user.organization_id, "bill"), status="draft", created_by=user.id)
    _apply_payload(db, bill, payload, user.organization_id)
    db.add(bill)
    db.flush()
    if payload.status == "open":
        bill.status = "open"
        post_bill(db, bill, user)
    audit.record(db, user, "create", "bill", bill.id, f"Created bill {bill.bill_number} ({bill.status})")
    db.commit()
    return get_bill(bill.id, user, db)


@router.put("/{bill_id}", response_model=BillOut)
def update_bill(bill_id: str, payload: BillUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    bill = get_or_404(db, Bill, bill_id, user.organization_id, "Bill")
    if bill.status in ("paid", "partially_paid", "void") or bill.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bills with payments or voided bills cannot be edited")
    was_posted = bill.status == "open"
    if was_posted:
        unpost_bill(db, bill, user, "Bill edited")
    _apply_payload(db, bill, payload, user.organization_id)
    db.flush()
    if payload.status == "open" or was_posted:
        bill.status = "open"
        post_bill(db, bill, user)
    else:
        bill.status = "draft"
    audit.record(db, user, "update", "bill", bill.id, f"Updated bill {bill.bill_number}")
    db.commit()
    return get_bill(bill.id, user, db)


@router.post("/{bill_id}/status", response_model=BillOut)
def change_status(bill_id: str, payload: BillStatusUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    bill = get_or_404(db, Bill, bill_id, user.organization_id, "Bill")
    target = payload.status
    if target == "open":
        if bill.status != "draft":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft bills can be opened")
        bill.status = "open"
        post_bill(db, bill, user)
    elif target == "void":
        if bill.status == "void":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bill is already void")
        if bill.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Delete the recorded payments before voiding this bill")
        if bill.status != "draft":
            unpost_bill(db, bill, user, "Bill voided")
        bill.status = "void"
    elif target == "draft":
        if bill.status != "open" or bill.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only unpaid open bills can be reverted to draft")
        unpost_bill(db, bill, user, "Bill reverted to draft")
        bill.status = "draft"
    audit.record(db, user, "update", "bill", bill.id, f"Bill {bill.bill_number} marked {bill.status}")
    db.commit()
    return get_bill(bill.id, user, db)


@router.delete("/{bill_id}", response_model=Message)
def delete_bill(bill_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    bill = get_or_404(db, Bill, bill_id, user.organization_id, "Bill")
    if bill.status not in ("draft", "void") or bill.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft or void bills can be deleted. Void the bill first.")
    number = bill.bill_number
    db.delete(bill)
    audit.record(db, user, "delete", "bill", bill_id, f"Deleted bill {number}")
    db.commit()
    return Message(message=f"Bill {number} deleted")
