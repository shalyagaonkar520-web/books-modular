"""Double-entry journal posting.

Every financial document (invoice, payment, bill, expense, payroll, inventory
adjustment) posts a balanced journal entry. Voiding a document posts a reversal.
Reports (trial balance, P&L, balance sheet) are derived from journal lines.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Account, JournalEntry, JournalLine
from backend.services import numbering
from backend.services.money import money

# (account_id, debit, credit, description, contact_id)
LineSpec = Tuple[str, Decimal, Decimal, Optional[str], Optional[str]]


def post_entry(
    db: Session,
    organization_id: str,
    entry_date: date,
    lines: Sequence[LineSpec],
    source_type: str,
    source_id: Optional[str] = None,
    reference: Optional[str] = None,
    notes: Optional[str] = None,
    created_by: Optional[str] = None,
    is_reversal: bool = False,
) -> JournalEntry:
    cleaned: List[LineSpec] = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for account_id, debit, credit, description, contact_id in lines:
        debit = money(debit)
        credit = money(credit)
        if debit == 0 and credit == 0:
            continue
        if debit < 0 or credit < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Journal amounts cannot be negative")
        cleaned.append((account_id, debit, credit, description, contact_id))
        total_debit += debit
        total_credit += credit

    if not cleaned:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A journal entry needs at least one non-zero line")
    if total_debit != total_credit:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Journal entry is not balanced (debits {total_debit} != credits {total_credit})",
        )

    account_ids = {line[0] for line in cleaned}
    found = db.execute(
        select(Account.id).where(Account.organization_id == organization_id, Account.id.in_(account_ids))
    ).scalars().all()
    if len(set(found)) != len(account_ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more accounts do not belong to this organization")

    entry = JournalEntry(
        organization_id=organization_id,
        entry_number=numbering.next_number(db, organization_id, "journal"),
        date=entry_date,
        reference=reference,
        notes=notes,
        source_type=source_type,
        source_id=source_id,
        is_reversal=is_reversal,
        total=total_debit,
        created_by=created_by,
    )
    for position, (account_id, debit, credit, description, contact_id) in enumerate(cleaned):
        entry.lines.append(
            JournalLine(
                account_id=account_id,
                position=position,
                description=description,
                debit=debit,
                credit=credit,
                contact_id=contact_id,
            )
        )
    db.add(entry)
    db.flush()
    return entry


def reverse_entries_for_source(
    db: Session,
    organization_id: str,
    source_type: str,
    source_id: str,
    reversal_date: date,
    created_by: Optional[str] = None,
    note: str = "Reversal",
) -> List[JournalEntry]:
    """Post reversing entries for every non-reversed entry attached to a source document."""
    entries = db.execute(
        select(JournalEntry).where(
            JournalEntry.organization_id == organization_id,
            JournalEntry.source_type == source_type,
            JournalEntry.source_id == source_id,
            JournalEntry.is_reversal.is_(False),
        )
    ).scalars().all()
    reversals: List[JournalEntry] = []
    for entry in entries:
        already = db.execute(
            select(JournalEntry.id).where(
                JournalEntry.source_type == source_type,
                JournalEntry.source_id == source_id,
                JournalEntry.is_reversal.is_(True),
                JournalEntry.reference == f"REV:{entry.entry_number}",
            )
        ).first()
        if already:
            continue
        lines: List[LineSpec] = [
            (line.account_id, line.credit, line.debit, line.description, line.contact_id) for line in entry.lines
        ]
        reversals.append(
            post_entry(
                db,
                organization_id,
                reversal_date,
                lines,
                source_type=source_type,
                source_id=source_id,
                reference=f"REV:{entry.entry_number}",
                notes=f"{note} of {entry.entry_number}",
                created_by=created_by,
                is_reversal=True,
            )
        )
    return reversals


def account_balances(
    db: Session,
    organization_id: str,
    start: Optional[date] = None,
    end: Optional[date] = None,
    account_ids: Optional[Iterable[str]] = None,
) -> dict:
    """Return {account_id: (debit_total, credit_total)} for the period."""
    stmt = (
        select(JournalLine.account_id, JournalLine.debit, JournalLine.credit)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.organization_id == organization_id)
    )
    if start:
        stmt = stmt.where(JournalEntry.date >= start)
    if end:
        stmt = stmt.where(JournalEntry.date <= end)
    if account_ids is not None:
        stmt = stmt.where(JournalLine.account_id.in_(list(account_ids)))
    totals: dict = {}
    for account_id, debit, credit in db.execute(stmt):
        d, c = totals.get(account_id, (Decimal("0"), Decimal("0")))
        totals[account_id] = (d + (debit or 0), c + (credit or 0))
    return totals


def natural_balance(account_type: str, debit: Decimal, credit: Decimal) -> Decimal:
    """Positive balance in the account's natural direction."""
    if account_type in ("asset", "expense"):
        return money(debit - credit)
    return money(credit - debit)
