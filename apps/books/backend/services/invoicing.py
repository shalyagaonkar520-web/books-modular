"""Invoices: their API shape and their journal postings.

Shared by every module that creates or shows invoices - the invoices router,
time tracking's "invoice unbilled time" and the Excel import - so none of them
imports another module's router.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models import Invoice, InvoiceLine, User
from backend.schemas.sales import InvoiceListItem, InvoiceOut, LineOut
from backend.services import inventory, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import group_by_account
from backend.services.money import money

OPEN_STATUSES = ("sent", "partially_paid")


def effective_status(inv: Invoice, today: Optional[date] = None) -> str:
    today = today or date.today()
    if inv.status in OPEN_STATUSES and inv.due_date < today:
        return "overdue"
    return inv.status


def line_out(line: InvoiceLine) -> LineOut:
    return LineOut(
        id=line.id,
        position=line.position,
        item_id=line.item_id,
        account_id=line.account_id,
        description=line.description,
        quantity=line.quantity,
        rate=line.rate,
        tax_rate=line.tax_rate,
        amount=line.amount,
        tax_amount=line.tax_amount,
        item_name=line.item.name if line.item else None,
    )


def to_out(inv: Invoice) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        customer_id=inv.customer_id,
        customer_name=inv.customer.display_name,
        customer_email=inv.customer.email,
        customer_gstin=inv.customer.gstin,
        customer_billing_address=inv.customer.billing_address,
        project_id=inv.project_id,
        date=inv.date,
        due_date=inv.due_date,
        status=effective_status(inv),
        reference=inv.reference,
        order_number=inv.order_number,
        subject=inv.subject,
        salesperson=inv.salesperson,
        subtotal=inv.subtotal,
        discount_amount=inv.discount_amount,
        tax_total=inv.tax_total,
        total=inv.total,
        amount_paid=inv.amount_paid,
        balance_due=money(inv.balance_due),
        notes=inv.notes,
        terms=inv.terms,
        sent_at=inv.sent_at,
        lines=[line_out(line) for line in inv.lines],
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


def to_list_item(inv: Invoice) -> InvoiceListItem:
    return InvoiceListItem(
        id=inv.id,
        invoice_number=inv.invoice_number,
        customer_id=inv.customer_id,
        customer_name=inv.customer.display_name,
        date=inv.date,
        due_date=inv.due_date,
        status=effective_status(inv),
        total=inv.total,
        amount_paid=inv.amount_paid,
        balance_due=money(inv.balance_due),
        reference=inv.reference,
    )


def post_invoice(db: Session, inv: Invoice, user: User) -> None:
    """Journal: Dr AR total, Dr Discount; Cr income accounts, Cr Output GST. Plus COGS for tracked goods."""
    org_id = inv.organization_id
    # A customer can be pointed at its own receivables account; most are not,
    # and fall back to the org-wide one.
    ar = inv.customer.ledger_account or get_account_by_code(db, org_id, "1100")
    output_gst = get_account_by_code(db, org_id, "2100")
    default_sales = get_account_by_code(db, org_id, "4000")
    discount_acct = get_account_by_code(db, org_id, "4300")

    income_pairs = []
    for line in inv.lines:
        account_id = line.account_id or (line.item.sales_account_id if line.item and line.item.sales_account_id else default_sales.id)
        income_pairs.append((account_id, line.amount))
    lines = [(ar.id, inv.total, Decimal("0"), f"Invoice {inv.invoice_number}", inv.customer_id)]
    if inv.discount_amount > 0:
        lines.append((discount_acct.id, inv.discount_amount, Decimal("0"), f"Discount on {inv.invoice_number}", inv.customer_id))
    for account_id, amount in group_by_account(income_pairs).items():
        lines.append((account_id, Decimal("0"), amount, f"Invoice {inv.invoice_number}", inv.customer_id))
    if inv.tax_total > 0:
        lines.append((output_gst.id, Decimal("0"), inv.tax_total, f"GST on {inv.invoice_number}", inv.customer_id))
    ledger.post_entry(db, org_id, inv.date, lines, "invoice", inv.id, reference=inv.invoice_number, created_by=user.id)

    # Perpetual inventory: relieve stock and recognise COGS at cost.
    cogs_default = get_account_by_code(db, org_id, "5000")
    inventory_acct = get_account_by_code(db, org_id, "1200")
    cogs_lines = []
    for line in inv.lines:
        item = line.item
        if item and item.track_inventory:
            inventory.adjust_stock(
                db, item, -line.quantity, inv.date, "invoice_stock", inv.id, f"Sold on {inv.invoice_number}", user.id, rate=Decimal("0")
            )
            cost = money(line.quantity * money(item.cost_price))
            if cost > 0:
                cogs_account = item.purchase_account_id or cogs_default.id
                cogs_lines.append((cogs_account, cost, Decimal("0"), f"COGS {item.name} ({inv.invoice_number})", None))
                cogs_lines.append((inventory_acct.id, Decimal("0"), cost, f"Stock out {item.name} ({inv.invoice_number})", None))
    if cogs_lines:
        ledger.post_entry(db, org_id, inv.date, cogs_lines, "invoice_cogs", inv.id, reference=inv.invoice_number, created_by=user.id)


def unpost_invoice(db: Session, inv: Invoice, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, inv.organization_id, "invoice", inv.id, today, user.id, reason)
    ledger.reverse_entries_for_source(db, inv.organization_id, "invoice_cogs", inv.id, today, user.id, reason)
    for line in inv.lines:
        if line.item and line.item.track_inventory:
            inventory.adjust_stock(
                db, line.item, line.quantity, today, "invoice_stock", inv.id, f"{reason} {inv.invoice_number}", user.id, rate=Decimal("0")
            )


def invoice_query(org_id: str):
    return (
        select(Invoice)
        .where(Invoice.organization_id == org_id)
        .options(selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item))
    )


def invoice_out(db: Session, org_id: str, invoice_id: str) -> InvoiceOut:
    inv = db.execute(invoice_query(org_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return to_out(inv)
