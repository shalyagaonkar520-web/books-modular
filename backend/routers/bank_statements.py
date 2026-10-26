"""Bank statement import, matching and automatic reconciliation."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_financial_read, require_financial_write
from backend.models import BankAccount, BankStatementLine, BankTransaction, Bill, CustomerPayment, Invoice, User, VendorPayment, new_id
from backend.schemas.banking import BankTransactionCreate
from backend.schemas.common import APIModel, Message
from backend.schemas.purchases import VendorPaymentCreate
from backend.schemas.sales import CustomerPaymentCreate
from backend.services import audit, bank_statements, fx
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/banking", tags=["Banking"])

MAX_FILE_BYTES = 2 * 1024 * 1024


class CandidateOut(APIModel):
    kind: str
    id: str
    label: str
    date: date
    amount: Decimal
    score: int


class StatementLineOut(APIModel):
    id: str
    date: date
    description: str
    reference: Optional[str] = None
    type: str
    amount: Decimal
    status: str
    transaction_id: Optional[str] = None
    candidates: List[CandidateOut] = []


class ImportResult(APIModel):
    imported: int
    duplicates: int
    auto_matched: int
    errors: List[str] = []


class MatchRequest(APIModel):
    transaction_id: str


class CategorizeRequest(APIModel):
    account_id: str
    description: Optional[str] = Field(default=None, max_length=255)


class ApplyRequest(APIModel):
    invoice_id: Optional[str] = None
    bill_id: Optional[str] = None


def _line_out(db: Session, line: BankStatementLine, with_candidates: bool) -> StatementLineOut:
    out = StatementLineOut(
        id=line.id,
        date=line.date,
        description=line.description,
        reference=line.reference,
        type=line.type,
        amount=line.amount,
        status=line.status,
        transaction_id=line.transaction_id,
    )
    if with_candidates and line.status == "unmatched":
        out.candidates = [CandidateOut(**c.__dict__) for c in bank_statements.candidates(db, line)]
    return out


def _open_line(db: Session, line_id: str, org_id: str) -> BankStatementLine:
    line = get_or_404(db, BankStatementLine, line_id, org_id, "Statement line")
    if line.status != "unmatched":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This statement line has already been dealt with")
    return line


def _match(line: BankStatementLine, tx: BankTransaction) -> None:
    line.status = "matched"
    line.transaction_id = tx.id
    tx.is_reconciled = True
    tx.reconciled_at = datetime.now(UTC)


def _auto_match(db: Session, lines: List[BankStatementLine]) -> int:
    """Match each line whose only candidate is one transaction that no other line also points at."""
    proposals = {}
    for line in lines:
        txs = [c for c in bank_statements.candidates(db, line) if c.kind == "transaction"]
        if len(txs) == 1:
            proposals[line.id] = txs[0].id
    claimed = Counter(proposals.values())
    matched = 0
    for line in lines:
        tx_id = proposals.get(line.id)
        if tx_id and claimed[tx_id] == 1:
            _match(line, db.get(BankTransaction, tx_id))
            matched += 1
    return matched


@router.post("/accounts/{account_id}/statements/import", response_model=ImportResult)
async def import_statement(
    account_id: str,
    file: UploadFile = File(...),
    auto_match: bool = Query(True, alias="autoMatch"),
    user: User = Depends(require_financial_write),
    db: Session = Depends(get_db),
):
    acct = get_or_404(db, BankAccount, account_id, user.organization_id, "Bank account")
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The statement file is larger than 2 MB")
    parsed = bank_statements.parse_csv(content)
    if not parsed.lines and parsed.errors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, parsed.errors[0])
    # How many times each line was imported before; a re-upload skips that many
    # occurrences, so genuine repeats in one file (two SMS charges) still import.
    existing = Counter(
        (r.date, r.type, r.amount, r.description, r.reference or "")
        for r in db.execute(select(BankStatementLine).where(BankStatementLine.bank_account_id == acct.id)).scalars()
    )
    seen: Counter = Counter()
    batch = new_id()
    added: List[BankStatementLine] = []
    duplicates = 0
    for p in parsed.lines:
        key = (p.date, p.type, p.amount, p.description, p.reference or "")
        seen[key] += 1
        if seen[key] <= existing[key]:
            duplicates += 1
            continue
        line = BankStatementLine(
            organization_id=user.organization_id,
            bank_account_id=acct.id,
            date=p.date,
            description=p.description,
            reference=p.reference,
            type=p.type,
            amount=p.amount,
            import_batch=batch,
        )
        db.add(line)
        added.append(line)
    db.flush()
    matched = _auto_match(db, added) if auto_match else 0
    audit.record(db, user, "create", "bank_statement", acct.id, f"Imported {len(added)} statement lines into {acct.name}")
    db.commit()
    return ImportResult(imported=len(added), duplicates=duplicates, auto_matched=matched, errors=parsed.errors)


@router.get("/accounts/{account_id}/statement-lines", response_model=List[StatementLineOut])
def statement_lines(
    account_id: str,
    line_status: Optional[Literal["unmatched", "matched", "ignored"]] = Query("unmatched", alias="status"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    acct = get_or_404(db, BankAccount, account_id, user.organization_id, "Bank account")
    stmt = select(BankStatementLine).where(BankStatementLine.bank_account_id == acct.id)
    if line_status:
        stmt = stmt.where(BankStatementLine.status == line_status)
    rows = db.execute(stmt.order_by(BankStatementLine.date.desc(), BankStatementLine.created_at).limit(500)).scalars()
    return [_line_out(db, r, with_candidates=True) for r in rows]


@router.post("/accounts/{account_id}/statements/auto-match", response_model=Message)
def auto_match(account_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    acct = get_or_404(db, BankAccount, account_id, user.organization_id, "Bank account")
    lines = list(
        db.execute(
            select(BankStatementLine).where(BankStatementLine.bank_account_id == acct.id, BankStatementLine.status == "unmatched")
        ).scalars()
    )
    matched = _auto_match(db, lines)
    if matched:
        audit.record(db, user, "update", "bank_statement", acct.id, f"Auto-matched {matched} statement lines in {acct.name}")
    db.commit()
    return Message(message=f"{matched} line(s) matched and reconciled")


@router.post("/statement-lines/{line_id}/match", response_model=StatementLineOut)
def match_line(line_id: str, payload: MatchRequest, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    line = _open_line(db, line_id, user.organization_id)
    tx = get_or_404(db, BankTransaction, payload.transaction_id, user.organization_id, "Transaction")
    if tx.bank_account_id != line.bank_account_id or tx.type != line.type or tx.amount != line.amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The transaction's account, direction or amount does not match the statement line")
    if tx.is_reconciled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That transaction is already reconciled")
    _match(line, tx)
    db.commit()
    return _line_out(db, line, with_candidates=False)


@router.post("/statement-lines/{line_id}/categorize", response_model=StatementLineOut)
def categorize_line(line_id: str, payload: CategorizeRequest, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    """Book the line to an account (bank charges, interest, a sale...) and reconcile it."""
    from backend.routers.banking import create_transaction

    line = _open_line(db, line_id, user.organization_id)
    out = create_transaction(
        line.bank_account_id,
        BankTransactionCreate(
            date=line.date,
            type=line.type,
            amount=line.amount,
            description=(payload.description or line.description)[:255],
            reference=line.reference,
            counter_account_id=payload.account_id,
        ),
        user,
        db,
    )
    line = db.get(BankStatementLine, line_id)
    _match(line, db.get(BankTransaction, out.id))
    line.created_kind = "transaction"
    db.commit()
    return _line_out(db, line, with_candidates=False)


@router.post("/statement-lines/{line_id}/apply", response_model=StatementLineOut)
def apply_line(line_id: str, payload: ApplyRequest, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    """Record the line as the payment of an open invoice (deposit) or bill (withdrawal), then reconcile it."""
    from backend.routers.payments import create_customer_payment, create_vendor_payment

    line = _open_line(db, line_id, user.organization_id)
    if line.type == "deposit":
        if not payload.invoice_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose the invoice this money was received for")
        inv = get_or_404(db, Invoice, payload.invoice_id, user.organization_id, "Invoice")
        if fx.is_foreign(db, user.organization_id, inv.currency):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Record foreign-currency payments from the invoice, with the exchange rate")
        created = create_customer_payment(
            CustomerPaymentCreate(
                customer_id=inv.customer_id,
                invoice_id=inv.id,
                bank_account_id=line.bank_account_id,
                date=line.date,
                amount=line.amount,
                reference=line.reference,
                notes=f"From bank statement: {line.description}"[:500],
            ),
            user,
            db,
        )
        source = ("customer_payment", db.get(CustomerPayment, created.id).id)
    else:
        if not payload.bill_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose the bill this payment was for")
        bill = get_or_404(db, Bill, payload.bill_id, user.organization_id, "Bill")
        if fx.is_foreign(db, user.organization_id, bill.currency):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Record foreign-currency payments from the bill, with the exchange rate")
        created = create_vendor_payment(
            VendorPaymentCreate(
                vendor_id=bill.vendor_id,
                bill_id=bill.id,
                bank_account_id=line.bank_account_id,
                date=line.date,
                amount=line.amount,
                reference=line.reference,
                notes=f"From bank statement: {line.description}"[:500],
            ),
            user,
            db,
        )
        source = ("vendor_payment", db.get(VendorPayment, created.id).id)
    tx = db.execute(
        select(BankTransaction).where(BankTransaction.source_type == source[0], BankTransaction.source_id == source[1])
    ).scalar_one()
    line = db.get(BankStatementLine, line_id)
    _match(line, tx)
    line.created_kind = source[0]
    db.commit()
    return _line_out(db, line, with_candidates=False)


@router.post("/statement-lines/{line_id}/ignore", response_model=StatementLineOut)
def ignore_line(line_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    line = _open_line(db, line_id, user.organization_id)
    line.status = "ignored"
    db.commit()
    return _line_out(db, line, with_candidates=False)


@router.post("/statement-lines/{line_id}/undo", response_model=StatementLineOut)
def undo_line(line_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    """Put a matched or ignored line back to unmatched (the matched transaction is unreconciled)."""
    line = get_or_404(db, BankStatementLine, line_id, user.organization_id, "Statement line")
    tx = db.get(BankTransaction, line.transaction_id) if line.transaction_id else None
    if tx is not None:
        tx.is_reconciled = False
        tx.reconciled_at = None
        db.flush()
        # A transaction or payment this line created goes too, or booking it again would count it twice.
        if line.created_kind == "transaction":
            from backend.routers.banking import delete_transaction

            delete_transaction(tx.id, user, db)
        elif line.created_kind == "customer_payment":
            from backend.routers.payments import delete_customer_payment

            delete_customer_payment(tx.source_id, user, db)
        elif line.created_kind == "vendor_payment":
            from backend.routers.payments import delete_vendor_payment

            delete_vendor_payment(tx.source_id, user, db)
        line = db.get(BankStatementLine, line_id)
    line.status, line.transaction_id, line.created_kind = "unmatched", None, None
    db.commit()
    return _line_out(db, line, with_candidates=True)


@router.delete("/statement-lines/{line_id}", response_model=Message)
def delete_line(line_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    line = _open_line(db, line_id, user.organization_id)
    db.delete(line)
    db.commit()
    return Message(message="Statement line deleted")
