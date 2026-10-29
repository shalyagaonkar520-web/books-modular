"""Export all of an organization's books as one Excel workbook.

One sheet per kind of record (customers, invoices and their lines, bills,
payments, the journal, payroll, stock...), read generically from every table
that belongs to the organization (its ``organization_id``, or its parent
document's), plus ready-to-read finance sheets: trial balance and customer /
vendor balances. Secrets never leave: password hashes, tokens and API keys are
dropped, and the tables that only hold them are skipped.
"""

from __future__ import annotations

import io
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import Table, func, select
from sqlalchemy.orm import Session

from backend.db import Base
from backend.models import Account, Bill, Contact, Invoice, JournalEntry, JournalLine, Organization
from backend.services import export_service
from backend.services.money import money

# Tables that hold only sign-in, delivery or integration plumbing (or secrets).
SKIP_TABLES = {
    "refresh_tokens",
    "email_verifications",
    "org_panel_admins",
    "org_panel_refresh_tokens",
    "app_connections",
    "idempotency_records",
    "webhook_deliveries",
    "integration_events",
    "pos_scanner_sessions",
    "pos_scans",
    "document_sequences",
    "razorpay_sync_logs",
    "payment_events",
    "outbox",
    "processed_events",
}
_SECRET = re.compile(r"(hash|secret|token|password|api_key|signing)", re.IGNORECASE)
# A line table's own document (not the accounts / items / employees it also points at).
_REFERENCE_PARENTS = {"accounts", "items", "employees", "users", "contacts", "warehouses", "branches"}
# Sheets first in the workbook, in this order; every other table follows alphabetically.
_FIRST = [
    "contacts",
    "items",
    "invoices",
    "invoice_lines",
    "customer_payments",
    "estimates",
    "estimate_lines",
    "sales_orders",
    "sales_order_lines",
    "delivery_challans",
    "delivery_challan_lines",
    "credit_notes",
    "credit_note_lines",
    "bills",
    "bill_lines",
    "vendor_payments",
    "purchase_orders",
    "purchase_order_lines",
    "vendor_credits",
    "vendor_credit_lines",
    "expenses",
    "accounts",
    "journal_entries",
    "journal_lines",
    "bank_accounts",
    "bank_transactions",
]
_NAMES = {"contacts": "Customers & vendors", "estimates": "Quotes", "estimate_lines": "Quote lines", "accounts": "Chart of accounts"}


def _title(table: str) -> str:
    return _NAMES.get(table) or table.replace("_", " ").capitalize()


def _cell(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return (value.astimezone(UTC) if value.tzinfo else value).replace(tzinfo=None)
    if isinstance(value, (bytes, bytearray)):
        return None
    return value


def _org_tables() -> List[Tuple[Table, Optional[Tuple[str, str]]]]:
    """(table, None) for tables with organization_id; (table, (fk column, parent table)) for their line tables."""
    org_tables = {t.name for t in Base.metadata.sorted_tables if "organization_id" in t.c}
    out: List[Tuple[Table, Optional[Tuple[str, str]]]] = []
    for table in Base.metadata.sorted_tables:
        if table.name in SKIP_TABLES or table.name == "organizations":
            continue
        if "organization_id" in table.c:
            out.append((table, None))
            continue
        parents = [
            (col.name, fk.column.table.name)
            for col in table.c
            for fk in col.foreign_keys
            if fk.column.table.name in org_tables and fk.column.table.name not in _REFERENCE_PARENTS
        ]
        if len(parents) == 1:
            out.append((table, parents[0]))
    order = {name: i for i, name in enumerate(_FIRST)}
    return sorted(out, key=lambda pair: (order.get(pair[0].name, len(order)), pair[0].name))


def _rows(db: Session, org_id: str, table: Table, parent: Optional[Tuple[str, str]]):
    columns = [c for c in table.c if not _SECRET.search(c.name)]
    stmt = select(*columns)
    if parent is None:
        stmt = stmt.where(table.c.organization_id == org_id)
    else:
        fk_col, parent_name = parent
        parent_table = Base.metadata.tables[parent_name]
        stmt = stmt.where(table.c[fk_col].in_(select(parent_table.c.id).where(parent_table.c.organization_id == org_id)))
    if "created_at" in table.c:
        stmt = stmt.order_by(table.c.created_at)
    return [c.name for c in columns], db.execute(stmt).all()


def _trial_balance(db: Session, org_id: str) -> Tuple[List[str], List[list]]:
    totals = dict(
        db.execute(
            select(JournalLine.account_id, func.sum(JournalLine.debit) - func.sum(JournalLine.credit))
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .where(JournalEntry.organization_id == org_id)
            .group_by(JournalLine.account_id)
        ).all()
    )
    rows = []
    for acct in db.execute(select(Account).where(Account.organization_id == org_id).order_by(Account.code)).scalars():
        net = money(totals.get(acct.id) or 0)
        if net == 0:
            continue
        rows.append([acct.code, acct.name, acct.type, float(net) if net > 0 else 0.0, float(-net) if net < 0 else 0.0])
    debit, credit = sum(r[3] for r in rows), sum(r[4] for r in rows)
    rows.append(["", "Total", "", round(debit, 2), round(credit, 2)])
    return ["Code", "Account", "Type", "Debit", "Credit"], rows


def _balances(db: Session, org_id: str, model, party_col, label: str) -> Tuple[List[str], List[list]]:
    sums = db.execute(
        select(party_col, func.count(), func.sum(model.total), func.sum(model.total - model.amount_paid))
        .where(model.organization_id == org_id, model.status.notin_(("draft", "void")))
        .group_by(party_col)
    ).all()
    names = dict(db.execute(select(Contact.id, Contact.display_name).where(Contact.organization_id == org_id)).all())
    rows = [[names.get(cid, cid), n, float(money(total or 0)), float(money(due or 0))] for cid, n, total, due in sums]
    rows.sort(key=lambda r: -r[3])
    return [label, "Documents", "Total", "Balance due"], rows


def _write(wb: Workbook, title: str, header: List[str], rows) -> None:
    ws = wb.create_sheet(title[:31])
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="EFF6FF")
    for row in rows:
        ws.append([_cell(v) for v in row])
    for i, name in enumerate(header, start=1):
        ws.column_dimensions[get_column_letter(i)].width = min(max(12, len(str(name)) + 2), 40)
    ws.freeze_panes = "A2"


def export_workbook(db: Session, org_id: str) -> Tuple[bytes, str]:
    """(xlsx bytes, file name) with every record of the organization."""
    org = db.get(Organization, org_id)
    wb = Workbook()
    readme = wb.active
    readme.title = "Read me"
    counts: Dict[str, int] = {}

    _write(wb, "Trial balance", *_trial_balance(db, org_id))
    _write(wb, "Customer balances", *_balances(db, org_id, Invoice, Invoice.customer_id, "Customer"))
    _write(wb, "Vendor balances", *_balances(db, org_id, Bill, Bill.vendor_id, "Vendor"))

    org_cols = [c for c in Organization.__table__.c if not _SECRET.search(c.name)]
    org_row = db.execute(select(*org_cols).where(Organization.id == org_id)).one()
    _write(wb, "Organization", [c.name for c in org_cols], [org_row])

    used = {ws.title for ws in wb.worksheets}
    for table, parent in _org_tables():
        header, rows = _rows(db, org_id, table, parent)
        if not rows:
            continue
        title = _title(table.name)[:31]
        while title in used:
            title = title[:28] + "_" + str(len(used))
        used.add(title)
        _write(wb, title, header, rows)
        counts[title] = len(rows)

    readme.append([f"Books export: {org.name if org else org_id}"])
    readme["A1"].font = Font(bold=True, size=14)
    readme.append([f"Exported {datetime.now(UTC).strftime('%d %b %Y %H:%M')} UTC"])
    readme.append(
        ["Every record of the organization, one sheet per kind. Amounts are in the base currency; *_id columns link rows across sheets."]
    )
    readme.append(
        ["Finance summaries: Trial balance, Customer balances, Vendor balances. Passwords, tokens and API keys are never exported."]
    )
    readme.append([])
    readme.append(["Sheet", "Rows"])
    readme["A6"].font = readme["B6"].font = Font(bold=True)
    for title, n in counts.items():
        readme.append([title, n])
    readme.column_dimensions["A"].width = 40

    buf = io.BytesIO()
    export_service._save(wb, buf)
    stamp = date.today().isoformat()
    safe = re.sub(r"[^A-Za-z0-9]+", "-", (org.name if org else "organization")).strip("-") or "organization"
    return buf.getvalue(), f"{safe}-books-{stamp}.xlsx"
