"""Customer and vendor statements of account.

Built from the ledger, not the documents: every line posted to the contact's
receivable / payable account (and the advances account) with the contact on it.
Invoices, payments, credit notes, refunds, advances and every void or edit
(reversal) are all there, and the closing balance always agrees with the books.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Contact, JournalEntry, JournalLine, Organization
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.export_service import Paragraph
from backend.services.money import money

_LABELS = {
    "invoice": "Invoice",
    "customer_payment": "Payment received",
    "credit_note": "Credit note",
    "refund": "Refund",
    "advance_application": "Advance applied",
    "credit_application": "Credit applied",
    "bill": "Bill",
    "vendor_payment": "Payment made",
    "vendor_credit": "Vendor credit",
    "external_payment": "Payment received",
    "manual": "Journal",
}


@dataclass
class StatementRow:
    date: date
    kind: str
    reference: str
    description: str
    debit: Decimal
    credit: Decimal
    balance: Decimal


@dataclass
class Statement:
    contact: Contact
    start: date
    end: date
    opening: Decimal
    rows: List[StatementRow] = field(default_factory=list)
    charges: Decimal = Decimal("0")
    receipts: Decimal = Decimal("0")

    @property
    def closing(self) -> Decimal:
        return self.rows[-1].balance if self.rows else self.opening


def _accounts(db: Session, contact: Contact) -> set[str]:
    org_id = contact.organization_id
    codes = ("1100", "2400") if contact.type == "customer" else ("2000", "1400")
    ids = {get_account_by_code(db, org_id, code).id for code in codes}
    if contact.ledger_account_id:
        ids.add(contact.ledger_account_id)
    return ids


def build(db: Session, contact: Contact, start: date, end: date) -> Statement:
    """Lines between ``start`` and ``end``; the balance is what the contact owes us
    (customers) or what we owe them (vendors)."""
    sign = Decimal("1") if contact.type == "customer" else Decimal("-1")
    base = (
        select(JournalEntry, JournalLine)
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .where(
            JournalEntry.organization_id == contact.organization_id,
            JournalLine.contact_id == contact.id,
            JournalLine.account_id.in_(_accounts(db, contact)),
        )
    )
    opening = Decimal("0")
    for _entry, line in db.execute(base.where(JournalEntry.date < start)):
        opening += sign * (line.debit - line.credit)
    statement = Statement(contact=contact, start=start, end=end, opening=money(opening))
    running = opening
    rows = db.execute(
        base.where(JournalEntry.date >= start, JournalEntry.date <= end).order_by(
            JournalEntry.date, JournalEntry.created_at, JournalEntry.entry_number
        )
    )
    for entry, line in rows:
        running += sign * (line.debit - line.credit)
        kind = _LABELS.get(entry.source_type, entry.source_type.replace("_", " ").capitalize())
        if entry.is_reversal:
            kind = f"{kind} (reversed)"
        charge, receipt = (line.debit, line.credit) if contact.type == "customer" else (line.credit, line.debit)
        statement.charges += charge
        statement.receipts += receipt
        statement.rows.append(
            StatementRow(
                date=entry.date,
                kind=kind,
                reference=(entry.reference or entry.entry_number)[:60],
                description=(line.description or entry.notes or "")[:200],
                debit=money(charge),
                credit=money(receipt),
                balance=money(running),
            )
        )
    statement.charges, statement.receipts = money(statement.charges), money(statement.receipts)
    return statement


def _fmt(value: Decimal) -> str:
    return f"{value:,.2f}"


def pdf(statement: Statement, org: Optional[Organization]) -> bytes:
    contact = statement.contact
    accent = (org.brand_color if org and org.brand_color else None) or "#2563eb"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=32, leftMargin=32, topMargin=32, bottomMargin=32)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("StSmall", parent=styles["Normal"], fontSize=8.5, leading=11)
    th = ParagraphStyle("StTH", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white)
    td = ParagraphStyle("StTD", fontName="Helvetica", fontSize=8, leading=10)
    num = ParagraphStyle("StNum", parent=td, alignment=2)
    org_name = (org.name if org else None) or ""
    org_bits = [x for x in ((org.address if org else None), (org.gstin and f"GSTIN: {org.gstin}") if org else None) if x]
    who = "Customer" if contact.type == "customer" else "Vendor"
    story = [
        Paragraph(f"<b>{org_name}</b>", styles["Heading2"]),
        Paragraph("<br/>".join(org_bits), small),
        Spacer(1, 10),
        Paragraph(f"<font color='{accent}'><b>Statement of account</b></font>", styles["Heading3"]),
        Paragraph(f"{statement.start.strftime('%d %b %Y')} to {statement.end.strftime('%d %b %Y')}", small),
        Spacer(1, 8),
        Paragraph(f"<b>{who}:</b> {contact.display_name}" + (f"<br/>GSTIN: {contact.gstin}" if contact.gstin else ""), small),
        Spacer(1, 10),
    ]
    charge_label, receipt_label = ("Invoiced", "Received") if contact.type == "customer" else ("Billed", "Paid")
    summary = Table(
        [
            ["Opening balance", _fmt(statement.opening)],
            [charge_label, _fmt(statement.charges)],
            [receipt_label, _fmt(statement.receipts)],
            ["Balance due" if contact.type == "customer" else "Balance payable", _fmt(statement.closing)],
        ],
        colWidths=[140, 100],
        hAlign="RIGHT",
    )
    summary.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
                ("LINEABOVE", (0, 3), (-1, 3), 0.8, colors.HexColor("#0f172a")),
            ]
        )
    )
    story += [summary, Spacer(1, 12)]
    data = [[Paragraph(h, th) for h in ("Date", "Transaction", "Reference", charge_label, receipt_label, "Balance")]]
    data.append(
        [
            Paragraph(statement.start.strftime("%d %b %Y"), td),
            Paragraph("Opening balance", td),
            "",
            "",
            "",
            Paragraph(_fmt(statement.opening), num),
        ]
    )
    for r in statement.rows:
        data.append(
            [
                Paragraph(r.date.strftime("%d %b %Y"), td),
                Paragraph(r.kind, td),
                Paragraph(r.reference, td),
                Paragraph(_fmt(r.debit) if r.debit else "", num),
                Paragraph(_fmt(r.credit) if r.credit else "", num),
                Paragraph(_fmt(r.balance), num),
            ]
        )
    table = Table(data, colWidths=[62, 120, 110, 75, 75, 85], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buffer.getvalue()
