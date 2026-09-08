"""Bank accounts, transactions, transfers and reconciliation."""
from __future__ import annotations

from datetime import date, datetime
try:
    from datetime import UTC
except ImportError:
    from datetime import timezone
    UTC = timezone.utc
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Account, BankAccount, BankTransaction, User
from backend.schemas.banking import (
    BankAccountCreate,
    BankAccountOut,
    BankAccountUpdate,
    BankingSummary,
    BankTransactionCreate,
    BankTransactionOut,
    ReconcileRequest,
    TransferCreate,
)
from backend.schemas.common import Message, Page
from backend.services import audit, bank, ledger
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, mask_number, paginate

router = APIRouter(prefix="/api/banking", tags=["Banking"])


def _unreconciled_counts(db: Session, org_id: str) -> dict:
    stmt = (
        select(BankTransaction.bank_account_id, func.count())
        .where(BankTransaction.organization_id == org_id, BankTransaction.is_reconciled.is_(False))
        .group_by(BankTransaction.bank_account_id)
    )
    return dict(db.execute(stmt).all())


def to_out(db: Session, acct: BankAccount, unreconciled: Optional[int] = None) -> BankAccountOut:
    return BankAccountOut(
        id=acct.id, name=acct.name, type=acct.type, bank_name=acct.bank_name, account_number_masked=mask_number(acct.account_number),
        ifsc=acct.ifsc, currency=acct.currency, opening_balance=acct.opening_balance, opening_balance_date=acct.opening_balance_date,
        current_balance=bank.current_balance(db, acct), unreconciled_count=unreconciled or 0, is_active=acct.is_active,
        is_primary=acct.is_primary, ledger_account_id=acct.ledger_account_id, created_at=acct.created_at,
    )


def tx_out(tx: BankTransaction, running: Optional[Decimal] = None) -> BankTransactionOut:
    return BankTransactionOut(
        id=tx.id, bank_account_id=tx.bank_account_id, bank_account_name=tx.bank_account.name, date=tx.date, type=tx.type,
        amount=tx.amount, description=tx.description, reference=tx.reference, source_type=tx.source_type, source_id=tx.source_id,
        counter_account_id=tx.counter_account_id, counter_account_name=None, is_reconciled=tx.is_reconciled,
        reconciled_at=tx.reconciled_at, running_balance=running, created_at=tx.created_at,
    )


@router.get("/accounts", response_model=List[BankAccountOut])
def list_accounts(include_inactive: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(BankAccount).where(BankAccount.organization_id == user.organization_id)
    if not include_inactive:
        stmt = stmt.where(BankAccount.is_active.is_(True))
    rows = db.execute(stmt.order_by(BankAccount.is_primary.desc(), BankAccount.name)).scalars().all()
    counts = _unreconciled_counts(db, user.organization_id)
    return [to_out(db, a, counts.get(a.id)) for a in rows]


@router.get("/summary", response_model=BankingSummary)
def banking_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    accounts = list_accounts(False, user, db)
    total = sum((a.current_balance if a.type != "credit_card" else -a.current_balance for a in accounts), Decimal("0"))
    return BankingSummary(total_balance=money(total), accounts=accounts, unreconciled_count=sum(a.unreconciled_count for a in accounts))


@router.post("/accounts", response_model=BankAccountOut, status_code=status.HTTP_201_CREATED)
def create_account(payload: BankAccountCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    ledger_account = bank.create_ledger_account(db, org_id, payload.name, payload.type)
    acct = BankAccount(
        organization_id=org_id, name=payload.name, type=payload.type, bank_name=payload.bank_name, account_number=payload.account_number,
        ifsc=payload.ifsc, opening_balance=money(payload.opening_balance), opening_balance_date=payload.opening_balance_date,
        ledger_account_id=ledger_account.id, is_primary=payload.is_primary,
    )
    if payload.is_primary:
        for other in db.execute(select(BankAccount).where(BankAccount.organization_id == org_id)).scalars():
            other.is_primary = False
    db.add(acct)
    db.flush()
    bank.post_opening_balance(db, acct, user.id)
    audit.record(db, user, "create", "bank_account", acct.id, f"Added {acct.type} account {acct.name}")
    db.commit()
    db.refresh(acct)
    return to_out(db, acct)


@router.put("/accounts/{account_id}", response_model=BankAccountOut)
def update_account(account_id: str, payload: BankAccountUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    acct = get_or_404(db, BankAccount, account_id, user.organization_id, "Bank account")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        for other in db.execute(select(BankAccount).where(BankAccount.organization_id == user.organization_id)).scalars():
            other.is_primary = False
    for field, value in data.items():
        setattr(acct, field, value)
    if "name" in data:
        ledger_account = db.get(Account, acct.ledger_account_id)
        if ledger_account:
            ledger_account.name = acct.name
    audit.record(db, user, "update", "bank_account", acct.id, f"Updated account {acct.name}")
    db.commit()
    return to_out(db, acct, _unreconciled_counts(db, user.organization_id).get(acct.id))


@router.get("/transactions", response_model=Page[BankTransactionOut])
def list_transactions(
    bank_account_id: Optional[str] = None,
    reconciled: Optional[bool] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(BankTransaction).where(BankTransaction.organization_id == user.organization_id).options(selectinload(BankTransaction.bank_account))
    if bank_account_id:
        stmt = stmt.where(BankTransaction.bank_account_id == bank_account_id)
    if reconciled is not None:
        stmt = stmt.where(BankTransaction.is_reconciled.is_(reconciled))
    if start_date:
        stmt = stmt.where(BankTransaction.date >= start_date)
    if end_date:
        stmt = stmt.where(BankTransaction.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(func.lower(BankTransaction.description).like(q) | func.lower(BankTransaction.reference).like(q))
    stmt = stmt.order_by(BankTransaction.date.desc(), BankTransaction.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    account_names = {a.id: a.name for a in db.execute(select(Account).where(Account.organization_id == user.organization_id)).scalars()}
    items = []
    for tx in rows:
        out = tx_out(tx)
        out.counter_account_name = account_names.get(tx.counter_account_id) if tx.counter_account_id else None
        items.append(out)
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/accounts/{account_id}/transactions", response_model=BankTransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(account_id: str, payload: BankTransactionCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    acct = get_or_404(db, BankAccount, account_id, org_id, "Bank account")
    counter = get_or_404(db, Account, payload.counter_account_id, org_id, "Account")
    if counter.id == acct.ledger_account_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Counter account cannot be the same bank account")
    amount = money(payload.amount)
    if payload.type == "deposit":
        lines = [(acct.ledger_account_id, amount, Decimal("0"), payload.description, None), (counter.id, Decimal("0"), amount, payload.description, None)]
    else:
        lines = [(counter.id, amount, Decimal("0"), payload.description, None), (acct.ledger_account_id, Decimal("0"), amount, payload.description, None)]
    tx = bank.record_movement(db, acct, payload.date, payload.type, amount, payload.description, "manual", None, user.id, payload.reference, counter.id)
    entry = ledger.post_entry(db, org_id, payload.date, lines, "bank_transaction", tx.id, reference=payload.reference, notes=payload.description, created_by=user.id)
    tx.source_id = tx.id
    tx.journal_entry_id = entry.id
    audit.record(db, user, "create", "bank_transaction", tx.id, f"{payload.type.title()} of {amount} in {acct.name}")
    db.commit()
    db.refresh(tx)
    out = tx_out(tx)
    out.counter_account_name = counter.name
    return out


@router.post("/transfers", response_model=Message, status_code=status.HTTP_201_CREATED)
def transfer(payload: TransferCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose two different accounts")
    src = get_or_404(db, BankAccount, payload.from_account_id, org_id, "Source account")
    dst = get_or_404(db, BankAccount, payload.to_account_id, org_id, "Destination account")
    amount = money(payload.amount)
    desc = payload.description or f"Transfer from {src.name} to {dst.name}"
    entry = ledger.post_entry(
        db, org_id, payload.date,
        [(dst.ledger_account_id, amount, Decimal("0"), desc, None), (src.ledger_account_id, Decimal("0"), amount, desc, None)],
        "transfer", None, reference=payload.reference, notes=desc, created_by=user.id,
    )
    entry.source_id = entry.id
    bank.record_movement(db, src, payload.date, "withdrawal", amount, desc, "transfer", entry.id, user.id, payload.reference, dst.ledger_account_id, entry.id)
    bank.record_movement(db, dst, payload.date, "deposit", amount, desc, "transfer", entry.id, user.id, payload.reference, src.ledger_account_id, entry.id)
    audit.record(db, user, "create", "transfer", entry.id, desc)
    db.commit()
    return Message(message="Transfer recorded")


@router.delete("/transactions/{transaction_id}", response_model=Message)
def delete_transaction(transaction_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    tx = get_or_404(db, BankTransaction, transaction_id, user.organization_id, "Transaction")
    if tx.source_type not in ("manual", "transfer"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This transaction was created by a {tx.source_type.replace('_', ' ')}. Delete that record instead.")
    if tx.is_reconciled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unreconcile the transaction before deleting it")
    source_type = "bank_transaction" if tx.source_type == "manual" else "transfer"
    ledger.reverse_entries_for_source(db, user.organization_id, source_type, tx.source_id or tx.id, date.today(), user.id, "Transaction deleted")
    bank.remove_movements(db, tx.source_type, tx.source_id or tx.id)
    audit.record(db, user, "delete", "bank_transaction", transaction_id, f"Deleted {tx.type} of {tx.amount}")
    db.commit()
    return Message(message="Transaction deleted and reversed")


@router.post("/transactions/reconcile", response_model=Message)
def reconcile(payload: ReconcileRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    rows = db.execute(
        select(BankTransaction).where(BankTransaction.organization_id == user.organization_id, BankTransaction.id.in_(payload.transaction_ids))
    ).scalars().all()
    if len(rows) != len(set(payload.transaction_ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more transactions were not found")
    now = datetime.now(UTC)
    for tx in rows:
        tx.is_reconciled = payload.reconciled
        tx.reconciled_at = now if payload.reconciled else None
    audit.record(db, user, "update", "bank_transaction", None, f"{'Reconciled' if payload.reconciled else 'Unreconciled'} {len(rows)} transactions")
    db.commit()
    return Message(message=f"{len(rows)} transaction(s) updated")
