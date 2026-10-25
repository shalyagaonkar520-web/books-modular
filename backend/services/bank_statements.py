"""Bank statement import and matching.

A CSV downloaded from the bank becomes statement lines. Each line is then
matched to a transaction already in the books (a receipt, payment, expense...),
turned into a payment against an open invoice or bill, or booked to an account
- and the matched transaction is marked reconciled.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.models import BankStatementLine, BankTransaction, Bill, Invoice
from backend.services.money import money

MAX_ROWS = 5000
# A bank posts a payment a few days either side of the date it was recorded.
MATCH_WINDOW_DAYS = 7

_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d/%m/%y",
    "%d-%m-%y",
    "%d-%b-%Y",
    "%d %b %Y",
    "%d-%b-%y",
    "%d %b %y",
    "%d %B %Y",
    "%b %d, %Y",
    "%Y/%m/%d",
)


@dataclass
class ParsedLine:
    date: date
    description: str
    reference: Optional[str]
    type: str
    amount: Decimal


@dataclass
class ParseResult:
    lines: List[ParsedLine] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def _date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    value = value.split(" ")[0] if re.match(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4} \d", value) else value
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _amount(value: str) -> Optional[Decimal]:
    text = (value or "").strip()
    if not text or text in ("-", "--"):
        return None
    negative = text.startswith("(") and text.endswith(")")
    suffix = text[-2:].upper()
    text = re.sub(r"[^0-9.\-]", "", text.replace("CR", "").replace("DR", "").replace("Cr", "").replace("Dr", ""))
    if not text or text in ("-", "."):
        return None
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    if negative or suffix == "DR":
        number = -abs(number)
    return number


def _find(headers: List[str], *needles: str, exclude: tuple = ()) -> Optional[str]:
    for needle in needles:
        for h in headers:
            low = h.lower()
            if needle in low and not any(x in low for x in exclude):
                return h
    return None


def parse_csv(content: bytes) -> ParseResult:
    """Read a bank statement CSV. Understands separate withdrawal / deposit (debit /
    credit) columns, or one signed amount column with an optional Dr/Cr column."""
    result = ParseResult()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    rows = list(csv.reader(io.StringIO(text), delimiter=_delimiter(text)))
    # Banks put account details above the table: the header is the first row
    # that names a date column and something that looks like an amount.
    header_index = None
    for i, row in enumerate(rows[:40]):
        cells = [c.strip().lower() for c in row]
        if any("date" in c for c in cells) and any(k in c for c in cells for k in ("amount", "debit", "credit", "withdrawal", "deposit")):
            header_index = i
            break
    if header_index is None:
        result.errors.append("Could not find the header row: the file needs a date column and amount (or debit / credit) columns")
        return result
    headers = [h.strip() for h in rows[header_index]]
    date_col = _find(headers, "txn date", "transaction date", "tran date", "posting date", "date", exclude=("value",)) or _find(
        headers, "date"
    )
    desc_col = _find(headers, "narration", "description", "particulars", "details", "remarks", "transaction")
    ref_col = _find(headers, "ref", "cheque", "chq", "utr")
    out_col = _find(headers, "withdrawal", "debit", "paid out", "dr amount")
    in_col = _find(headers, "deposit", "credit", "paid in", "cr amount")
    amount_col = _find(headers, "amount", exclude=("balance",))
    sign_col = _find(headers, "dr/cr", "cr/dr", "type")
    if out_col == in_col:
        out_col = in_col = None
    if not desc_col or desc_col == date_col:
        desc_col = None
    index = {h: i for i, h in enumerate(headers)}

    def cell(row: List[str], col: Optional[str]) -> str:
        if col is None or index[col] >= len(row):
            return ""
        return row[index[col]].strip()

    for row in rows[header_index + 1 :]:
        if not any(c.strip() for c in row):
            continue
        if len(result.lines) >= MAX_ROWS:
            result.errors.append(f"Only the first {MAX_ROWS} rows were read")
            break
        when = _date(cell(row, date_col))
        if when is None:
            # Footer rows ("Closing balance", totals) carry no date.
            continue
        if out_col or in_col:
            out_amt, in_amt = _amount(cell(row, out_col)), _amount(cell(row, in_col))
            if out_amt:
                kind, amount = "withdrawal", abs(out_amt)
            elif in_amt:
                kind, amount = "deposit", abs(in_amt)
            else:
                continue
        elif amount_col:
            value = _amount(cell(row, amount_col))
            if not value:
                continue
            marker = cell(row, sign_col).lower()
            if marker.startswith("d") or marker in ("withdrawal", "debit"):
                value = -abs(value)
            elif marker.startswith("c") or marker in ("deposit", "credit"):
                value = abs(value)
            kind, amount = ("deposit", value) if value > 0 else ("withdrawal", -value)
        else:
            result.errors.append("No amount column found")
            break
        amount = money(amount)
        if amount <= 0:
            continue
        description = cell(row, desc_col) or "Bank statement line"
        result.lines.append(ParsedLine(when, description[:255], (cell(row, ref_col) or None) and cell(row, ref_col)[:120], kind, amount))
    return result


def _delimiter(text: str) -> str:
    sample = "\n".join(text.splitlines()[:20])
    counts = {d: sample.count(d) for d in (",", ";", "\t", "|")}
    return max(counts, key=counts.get) if any(counts.values()) else ","


@dataclass
class Candidate:
    kind: str  # transaction | invoice | bill
    id: str
    label: str
    date: date
    amount: Decimal
    score: int


def candidates(db: Session, line: BankStatementLine, taken: Optional[set] = None) -> List[Candidate]:
    """What the line could be: unreconciled transactions of the same amount, or an
    open invoice / bill with that balance. Closest date first."""
    taken = taken or set()
    window = timedelta(days=MATCH_WINDOW_DAYS)
    out: List[Candidate] = []
    txs = db.execute(
        select(BankTransaction).where(
            BankTransaction.organization_id == line.organization_id,
            BankTransaction.bank_account_id == line.bank_account_id,
            BankTransaction.type == line.type,
            BankTransaction.amount == line.amount,
            BankTransaction.is_reconciled.is_(False),
            BankTransaction.date >= line.date - window,
            BankTransaction.date <= line.date + window,
        )
    ).scalars()
    for tx in txs:
        if tx.id in taken:
            continue
        gap = abs((tx.date - line.date).days)
        score = 100 - gap * 5 + (10 if line.reference and tx.reference and line.reference.strip() == tx.reference.strip() else 0)
        out.append(Candidate("transaction", tx.id, tx.description, tx.date, tx.amount, score))
    if line.type == "deposit":
        docs = db.execute(
            select(Invoice).where(
                Invoice.organization_id == line.organization_id,
                Invoice.status.in_(("sent", "partially_paid")),
                Invoice.date <= line.date,
                Invoice.total - Invoice.amount_paid == line.amount,
                # Foreign-currency invoices are settled in their own currency, one by one.
                or_(Invoice.exchange_rate == 1, Invoice.currency.is_(None)),
            )
        ).scalars()
        for inv in docs:
            mentioned = inv.invoice_number.lower() in line.description.lower()
            out.append(
                Candidate(
                    "invoice",
                    inv.id,
                    f"{inv.invoice_number} - {inv.customer.display_name}",
                    inv.date,
                    line.amount,
                    60 + (30 if mentioned else 0),
                )
            )
    else:
        docs = db.execute(
            select(Bill).where(
                Bill.organization_id == line.organization_id,
                Bill.status.in_(("open", "partially_paid")),
                Bill.date <= line.date,
                Bill.total - Bill.amount_paid == line.amount,
                or_(Bill.exchange_rate == 1, Bill.currency.is_(None)),
            )
        ).scalars()
        for bill in docs:
            out.append(Candidate("bill", bill.id, f"{bill.bill_number} - {bill.vendor.display_name}", bill.date, line.amount, 55))
    out.sort(key=lambda c: -c.score)
    return out[:10]
