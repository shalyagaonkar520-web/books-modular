"""Chart of accounts, manual journals, general ledger and trial balance."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Account, JournalEntry, JournalLine, User
from backend.schemas.accounting import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    JournalCreate,
    JournalLineOut,
    JournalOut,
    LedgerLine,
    LedgerReport,
    TrialBalance,
    TrialBalanceRow,
)
from backend.schemas.common import Message, Page
from backend.services import audit, ledger
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/accounting", tags=["Accountant"])


def account_out(acct: Account, balance: Decimal = Decimal("0")) -> AccountOut:
    data = AccountOut.model_validate(acct)
    data.balance = money(balance)
    return data


@router.get("/accounts", response_model=List[AccountOut])
def list_accounts(
    type: Optional[str] = Query(None, pattern="^(asset|liability|equity|income|expense)$"),
    include_inactive: bool = False,
    as_of: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Account).where(Account.organization_id == user.organization_id)
    if type:
        stmt = stmt.where(Account.type == type)
    if not include_inactive:
        stmt = stmt.where(Account.is_active.is_(True))
    rows = db.execute(stmt.order_by(Account.code)).scalars().all()
    balances = ledger.account_balances(db, user.organization_id, end=as_of)
    out = []
    for acct in rows:
        d, c = balances.get(acct.id, (Decimal("0"), Decimal("0")))
        out.append(account_out(acct, ledger.natural_balance(acct.type, d, c)))
    return out


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    exists = db.execute(select(Account.id).where(Account.organization_id == user.organization_id, Account.code == payload.code)).first()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Account code {payload.code} already exists")
    acct = Account(organization_id=user.organization_id, **payload.model_dump())
    db.add(acct)
    db.flush()
    audit.record(db, user, "create", "account", acct.id, f"Created account {acct.code} {acct.name}")
    db.commit()
    return account_out(acct)


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: str, payload: AccountUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    acct = get_or_404(db, Account, account_id, user.organization_id, "Account")
    data = payload.model_dump(exclude_unset=True)
    if acct.is_system and data.get("is_active") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System accounts cannot be deactivated")
    for field, value in data.items():
        setattr(acct, field, value)
    audit.record(db, user, "update", "account", acct.id, f"Updated account {acct.code}")
    db.commit()
    d, c = ledger.account_balances(db, user.organization_id, account_ids=[acct.id]).get(acct.id, (Decimal("0"), Decimal("0")))
    return account_out(acct, ledger.natural_balance(acct.type, d, c))


@router.delete("/accounts/{account_id}", response_model=Message)
def delete_account(account_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    acct = get_or_404(db, Account, account_id, user.organization_id, "Account")
    if acct.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System accounts cannot be deleted")
    used = db.execute(select(JournalLine.id).where(JournalLine.account_id == acct.id).limit(1)).first()
    if used:
        acct.is_active = False
        db.commit()
        return Message(message="Account has transactions and has been deactivated instead")
    db.delete(acct)
    audit.record(db, user, "delete", "account", account_id, f"Deleted account {acct.code}")
    db.commit()
    return Message(message="Account deleted")


def journal_out(entry: JournalEntry) -> JournalOut:
    return JournalOut(
        id=entry.id, entry_number=entry.entry_number, date=entry.date, reference=entry.reference, notes=entry.notes,
        source_type=entry.source_type, source_id=entry.source_id, is_reversal=entry.is_reversal, total=entry.total,
        lines=[
            JournalLineOut(id=ln.id, account_id=ln.account_id, account_code=ln.account.code, account_name=ln.account.name,
                           description=ln.description, debit=ln.debit, credit=ln.credit, contact_id=ln.contact_id)
            for ln in entry.lines
        ],
        created_at=entry.created_at,
    )


@router.get("/journals", response_model=Page[JournalOut])
def list_journals(
    source_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(JournalEntry).where(JournalEntry.organization_id == user.organization_id).options(selectinload(JournalEntry.lines).selectinload(JournalLine.account))
    if source_type:
        stmt = stmt.where(JournalEntry.source_type == source_type)
    if start_date:
        stmt = stmt.where(JournalEntry.date >= start_date)
    if end_date:
        stmt = stmt.where(JournalEntry.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(func.lower(JournalEntry.entry_number).like(q) | func.lower(JournalEntry.reference).like(q) | func.lower(JournalEntry.notes).like(q))
    stmt = stmt.order_by(JournalEntry.date.desc(), JournalEntry.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[journal_out(e) for e in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/journals/{entry_id}", response_model=JournalOut)
def get_journal(entry_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = get_or_404(db, JournalEntry, entry_id, user.organization_id, "Journal entry")
    return journal_out(entry)


@router.post("/journals", response_model=JournalOut, status_code=status.HTTP_201_CREATED)
def create_journal(payload: JournalCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    lines = [(ln.account_id, ln.debit, ln.credit, ln.description, ln.contact_id) for ln in payload.lines]
    entry = ledger.post_entry(db, user.organization_id, payload.date, lines, "manual", None, reference=payload.reference, notes=payload.notes, created_by=user.id)
    entry.source_id = entry.id
    audit.record(db, user, "create", "journal", entry.id, f"Manual journal {entry.entry_number} for {entry.total}")
    db.commit()
    db.refresh(entry)
    return journal_out(entry)


@router.post("/journals/{entry_id}/reverse", response_model=JournalOut)
def reverse_journal(entry_id: str, reversal_date: Optional[date] = None, user: User = Depends(require_write), db: Session = Depends(get_db)):
    entry = get_or_404(db, JournalEntry, entry_id, user.organization_id, "Journal entry")
    if entry.source_type != "manual":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only manual journals can be reversed here. Void the source document instead.")
    if entry.is_reversal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This entry is already a reversal")
    reversals = ledger.reverse_entries_for_source(db, user.organization_id, "manual", entry.source_id or entry.id, reversal_date or date.today(), user.id, "Manual reversal")
    if not reversals:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This journal has already been reversed")
    audit.record(db, user, "create", "journal", reversals[0].id, f"Reversed {entry.entry_number}")
    db.commit()
    return journal_out(reversals[0])


@router.get("/ledger/{account_id}", response_model=LedgerReport)
def general_ledger(
    account_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    acct = get_or_404(db, Account, account_id, user.organization_id, "Account")
    opening = Decimal("0")
    if start_date:
        d, c = ledger.account_balances(db, user.organization_id, end=start_date.__class__.fromordinal(start_date.toordinal() - 1), account_ids=[acct.id]).get(acct.id, (Decimal("0"), Decimal("0")))
        opening = ledger.natural_balance(acct.type, d, c)
    stmt = (
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.organization_id == user.organization_id, JournalLine.account_id == acct.id)
    )
    if start_date:
        stmt = stmt.where(JournalEntry.date >= start_date)
    if end_date:
        stmt = stmt.where(JournalEntry.date <= end_date)
    stmt = stmt.order_by(JournalEntry.date, JournalEntry.created_at, JournalLine.position)
    balance = opening
    lines: List[LedgerLine] = []
    sign = 1 if acct.type in ("asset", "expense") else -1
    for line, entry in db.execute(stmt):
        balance = money(balance + sign * (line.debit - line.credit))
        lines.append(LedgerLine(date=entry.date, entry_id=entry.id, entry_number=entry.entry_number, source_type=entry.source_type,
                                reference=entry.reference, description=line.description, debit=line.debit, credit=line.credit, balance=balance))
    return LedgerReport(account=account_out(acct, balance), start_date=start_date, end_date=end_date, opening_balance=money(opening), lines=lines, closing_balance=money(balance))


@router.get("/trial-balance", response_model=TrialBalance)
def trial_balance(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    accounts = db.execute(select(Account).where(Account.organization_id == user.organization_id).order_by(Account.code)).scalars().all()
    balances = ledger.account_balances(db, user.organization_id, end=as_of)
    rows: List[TrialBalanceRow] = []
    total_debit = total_credit = Decimal("0")
    for acct in accounts:
        d, c = balances.get(acct.id, (Decimal("0"), Decimal("0")))
        net = money(d - c)
        if net == 0:
            continue
        debit = net if net > 0 else Decimal("0")
        credit = -net if net < 0 else Decimal("0")
        total_debit += debit
        total_credit += credit
        rows.append(TrialBalanceRow(account_id=acct.id, code=acct.code, name=acct.name, type=acct.type, debit=debit, credit=credit))
    return TrialBalance(as_of=as_of, rows=rows, total_debit=money(total_debit), total_credit=money(total_credit))
