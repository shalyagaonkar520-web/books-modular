"""Expenses paid directly from a bank/cash account."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Account, BankAccount, Contact, Expense, User
from backend.schemas.common import Message, Page
from backend.schemas.purchases import ExpenseCreate, ExpenseOut, ExpenseUpdate
from backend.services import audit, bank, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/expenses", tags=["Purchases"])


def to_out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id, expense_number=e.expense_number, date=e.date, account_id=e.account_id, account_name=e.account.name,
        paid_through_account_id=e.paid_through_account_id, paid_through_name=e.paid_through.name,
        vendor_id=e.vendor_id, vendor_name=e.vendor.display_name if e.vendor else None,
        customer_id=e.customer_id, customer_name=e.customer.display_name if e.customer else None,
        amount=e.amount, tax_rate=e.tax_rate, tax_amount=e.tax_amount, total=e.total, reference=e.reference,
        notes=e.notes, is_billable=e.is_billable, created_at=e.created_at,
    )


def _apply(db: Session, e: Expense, payload: ExpenseCreate, org_id: str) -> None:
    account = get_or_404(db, Account, payload.account_id, org_id, "Expense account")
    if account.type != "expense":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expense must be recorded against an expense account")
    paid_through = get_or_404(db, BankAccount, payload.paid_through_account_id, org_id, "Paid through account")
    if payload.vendor_id:
        vendor = get_or_404(db, Contact, payload.vendor_id, org_id, "Vendor")
        if vendor.type != "vendor":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a vendor")
    if payload.customer_id:
        customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
        if customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    e.date = payload.date
    e.account_id = account.id
    e.paid_through_account_id = paid_through.id
    e.vendor_id = payload.vendor_id
    e.customer_id = payload.customer_id
    e.amount = money(payload.amount)
    e.tax_rate = Decimal(str(payload.tax_rate)).quantize(Decimal("0.01"))
    e.tax_amount = money(e.amount * e.tax_rate / Decimal("100"))
    e.total = money(e.amount + e.tax_amount)
    e.reference = payload.reference
    e.notes = payload.notes
    e.is_billable = payload.is_billable


def _post(db: Session, e: Expense, user: User) -> None:
    org_id = e.organization_id
    input_gst = get_account_by_code(db, org_id, "1300")
    paid_through = db.get(BankAccount, e.paid_through_account_id)
    desc = f"Expense {e.expense_number}: {e.account.name}"
    lines = [(e.account_id, e.amount, Decimal("0"), desc, e.vendor_id)]
    if e.tax_amount > 0:
        lines.append((input_gst.id, e.tax_amount, Decimal("0"), f"GST on {e.expense_number}", e.vendor_id))
    lines.append((paid_through.ledger_account_id, Decimal("0"), e.total, desc, e.vendor_id))
    entry = ledger.post_entry(db, org_id, e.date, lines, "expense", e.id, reference=e.reference or e.expense_number, created_by=user.id)
    bank.record_movement(db, paid_through, e.date, "withdrawal", e.total, desc, "expense", e.id, user.id, e.reference, e.account_id, entry.id)


def _unpost(db: Session, e: Expense, user: User, reason: str) -> None:
    ledger.reverse_entries_for_source(db, e.organization_id, "expense", e.id, date.today(), user.id, reason)
    bank.remove_movements(db, "expense", e.id)


def _query(org_id: str):
    return select(Expense).where(Expense.organization_id == org_id).options(
        selectinload(Expense.account), selectinload(Expense.paid_through), selectinload(Expense.vendor), selectinload(Expense.customer)
    )


@router.get("", response_model=Page[ExpenseOut])
def list_expenses(
    account_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _query(user.organization_id)
    if account_id:
        stmt = stmt.where(Expense.account_id == account_id)
    if vendor_id:
        stmt = stmt.where(Expense.vendor_id == vendor_id)
    if start_date:
        stmt = stmt.where(Expense.date >= start_date)
    if end_date:
        stmt = stmt.where(Expense.date <= end_date)
    stmt = stmt.order_by(Expense.date.desc(), Expense.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_out(e) for e in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.execute(_query(user.organization_id).where(Expense.id == expense_id)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    return to_out(e)


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    e = Expense(organization_id=user.organization_id, expense_number=numbering.next_number(db, user.organization_id, "expense"), created_by=user.id)
    _apply(db, e, payload, user.organization_id)
    db.add(e)
    db.flush()
    db.refresh(e)
    _post(db, e, user)
    audit.record(db, user, "create", "expense", e.id, f"Recorded expense {e.expense_number} of {e.total}")
    db.commit()
    return get_expense(e.id, user, db)


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: str, payload: ExpenseUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    e = get_or_404(db, Expense, expense_id, user.organization_id, "Expense")
    _unpost(db, e, user, "Expense edited")
    _apply(db, e, payload, user.organization_id)
    db.flush()
    db.refresh(e)
    _post(db, e, user)
    audit.record(db, user, "update", "expense", e.id, f"Updated expense {e.expense_number}")
    db.commit()
    return get_expense(e.id, user, db)


@router.delete("/{expense_id}", response_model=Message)
def delete_expense(expense_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    e = get_or_404(db, Expense, expense_id, user.organization_id, "Expense")
    _unpost(db, e, user, "Expense deleted")
    number = e.expense_number
    db.delete(e)
    audit.record(db, user, "delete", "expense", expense_id, f"Deleted expense {number}")
    db.commit()
    return Message(message=f"Expense {number} deleted and reversed")
