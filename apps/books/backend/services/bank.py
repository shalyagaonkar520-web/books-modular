"""Bank account helpers: balances, ledger account creation, movements."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.models import Account, BankAccount, BankTransaction
from backend.services import ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money


def create_ledger_account(db: Session, org_id: str, name: str, account_type: str) -> Account:
    subtype = "cash" if account_type == "cash" else ("credit_card" if account_type == "credit_card" else "bank")
    acc_type = "liability" if account_type == "credit_card" else "asset"
    base = 2500 if account_type == "credit_card" else 1010
    existing = set(db.execute(select(Account.code).where(Account.organization_id == org_id)).scalars())
    code = base
    while str(code) in existing:
        code += 1
    account = Account(organization_id=org_id, code=str(code), name=name, type=acc_type, subtype=subtype, is_system=True)
    db.add(account)
    db.flush()
    return account


def post_opening_balance(db: Session, bank: BankAccount, created_by: Optional[str]) -> None:
    amount = money(bank.opening_balance)
    if amount == 0:
        return
    opening = get_account_by_code(db, bank.organization_id, "3100")
    desc = f"Opening balance {bank.name}"
    if amount > 0:
        lines = [(bank.ledger_account_id, amount, Decimal("0"), desc, None), (opening.id, Decimal("0"), amount, desc, None)]
    else:
        lines = [(opening.id, -amount, Decimal("0"), desc, None), (bank.ledger_account_id, Decimal("0"), -amount, desc, None)]
    ledger.post_entry(db, bank.organization_id, bank.opening_balance_date, lines, "bank_opening", bank.id, reference=bank.name, created_by=created_by)


def record_movement(
    db: Session,
    bank: BankAccount,
    tx_date: date,
    tx_type: str,
    amount: Decimal,
    description: str,
    source_type: str,
    source_id: Optional[str],
    created_by: Optional[str],
    reference: Optional[str] = None,
    counter_account_id: Optional[str] = None,
    journal_entry_id: Optional[str] = None,
) -> BankTransaction:
    tx = BankTransaction(
        organization_id=bank.organization_id,
        bank_account_id=bank.id,
        date=tx_date,
        type=tx_type,
        amount=money(amount),
        description=description[:255],
        reference=reference,
        source_type=source_type,
        source_id=source_id,
        counter_account_id=counter_account_id,
        journal_entry_id=journal_entry_id,
        created_by=created_by,
    )
    db.add(tx)
    db.flush()
    return tx


def remove_movements(db: Session, source_type: str, source_id: str) -> None:
    for tx in db.execute(
        select(BankTransaction).where(BankTransaction.source_type == source_type, BankTransaction.source_id == source_id)
    ).scalars():
        db.delete(tx)


def current_balance(db: Session, bank: BankAccount, as_of: Optional[date] = None) -> Decimal:
    stmt = select(
        func.coalesce(func.sum(case((BankTransaction.type == "deposit", BankTransaction.amount), else_=-BankTransaction.amount)), 0)
    ).where(BankTransaction.bank_account_id == bank.id)
    if as_of:
        stmt = stmt.where(BankTransaction.date <= as_of)
    movement = db.execute(stmt).scalar_one()
    return money(Decimal(str(bank.opening_balance)) + Decimal(str(movement)))


def balances_for_org(db: Session, org_id: str) -> dict:
    banks = db.execute(select(BankAccount).where(BankAccount.organization_id == org_id, BankAccount.is_active.is_(True))).scalars().all()
    return {bank.id: current_balance(db, bank) for bank in banks}
