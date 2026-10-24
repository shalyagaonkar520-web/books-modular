"""Sales invoices."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import (
    Contact,
    ExternalPaymentProof,
    Invoice,
    InvoiceLine,
    Organization,
    PaymentRefund,
    Project,
    RazorpayPayment,
    TimeEntry,
    User,
)
from backend.schemas.common import Message, Page
from backend.schemas.sales import (
    InvoiceCreate,
    InvoiceListItem,
    InvoiceOut,
    InvoiceStats,
    InvoiceStatusUpdate,
    InvoiceUpdate,
    LineOut,
)
from backend.services import audit, doc_flow, export_service, fx, inventory, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import compute_lines, group_by_account, totals
from backend.services.email_service import send_due_reminder_email, send_invoice_email
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/invoices", tags=["Sales"])

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
        fc_rate=line.fc_rate if line.fc_rate is not None else line.rate,
        fc_amount=line.fc_amount if line.fc_amount is not None else line.amount,
    )


def fc_fields(doc) -> dict:
    """The document's own-currency figures. Documents from before multi-currency
    have none stored and are in the base currency, so the base figures stand in."""
    foreign = doc.exchange_rate is not None and doc.exchange_rate != 1
    stored = foreign or (doc.fc_total or 0) > 0
    total = doc.fc_total if stored else doc.total
    paid = doc.fc_amount_paid if stored else doc.amount_paid
    return {
        "currency": doc.currency,
        "exchange_rate": doc.exchange_rate or 1,
        "fc_subtotal": doc.fc_subtotal if stored else doc.subtotal,
        "fc_discount_amount": doc.fc_discount_amount if stored else doc.discount_amount,
        "fc_tax_total": doc.fc_tax_total if stored else doc.tax_total,
        "fc_total": total,
        "fc_amount_paid": paid,
        "fc_balance_due": money(total - paid),
    }


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
        place_of_supply=inv.place_of_supply,
        tcs_rate=inv.tcs_rate,
        tcs_amount=inv.tcs_amount,
        irn=inv.irn,
        irn_ack_no=inv.irn_ack_no,
        irn_ack_date=inv.irn_ack_date,
        eway_bill_no=inv.eway_bill_no,
        **fc_fields(inv),
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
        currency=inv.currency,
        fc_total=fc_fields(inv)["fc_total"],
        fc_balance_due=fc_fields(inv)["fc_balance_due"],
    )


def _apply_payload(db: Session, inv: Invoice, payload: InvoiceCreate, org_id: str) -> None:
    customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
    if customer.type != "customer":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    # Inactive customers and items are retired: they cannot go on anything new,
    # but an invoice that already carries one can still be edited and saved.
    if not customer.is_active and customer.id != inv.customer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Customer '{customer.display_name}' is inactive")
    existing_item_ids = {line.item_id for line in inv.lines if line.item_id}
    if payload.project_id:
        project = get_or_404(db, Project, payload.project_id, org_id, "Project")
        if project.customer_id and project.customer_id != customer.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project belongs to a different customer")
    computed, subtotal, tax_total = compute_lines(db, org_id, payload.lines, kind="invoice", discount=payload.discount_amount)
    for line in computed:
        if line.item and not line.item.is_active and line.item.id not in existing_item_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Item '{line.item.name}' is inactive")
    inv.customer_id = customer.id
    inv.project_id = payload.project_id
    inv.date = payload.date
    inv.due_date = payload.due_date or (payload.date + timedelta(days=customer.payment_terms_days))
    inv.reference = payload.reference
    inv.order_number = payload.order_number
    inv.subject = payload.subject
    inv.salesperson = payload.salesperson
    inv.notes = payload.notes
    inv.terms = payload.terms
    inv.place_of_supply = payload.place_of_supply
    inv.tcs_rate = payload.tcs_rate
    # Lines are entered in the customer's currency; the books get base amounts.
    inv.currency, inv.exchange_rate = fx.resolve(db, org_id, customer, payload.exchange_rate)
    fc_discount = money(payload.discount_amount)
    fc_before_tcs = totals(subtotal, fc_discount, tax_total)
    # TCS is collected on the full sale value, GST included.
    fc_tcs = money(fc_before_tcs * payload.tcs_rate / Decimal("100"))
    inv.fc_subtotal, inv.fc_discount_amount, inv.fc_tax_total = subtotal, fc_discount, tax_total
    inv.fc_total = money(fc_before_tcs + fc_tcs)
    base = fx.convert(computed, fc_discount, inv.exchange_rate)
    inv.subtotal, inv.discount_amount, inv.tax_total = base.subtotal, base.discount, base.tax_total
    inv.tcs_amount = fx.to_base(fc_tcs, inv.exchange_rate)
    inv.total = money(totals(base.subtotal, base.discount, base.tax_total) + inv.tcs_amount)
    inv.lines.clear()
    for position, (line, base_line) in enumerate(zip(computed, base.lines, strict=True)):
        inv.lines.append(
            InvoiceLine(
                item_id=line.item.id if line.item else None,
                account_id=line.account.id if line.account else None,
                position=position,
                description=line.spec.description,
                quantity=line.quantity,
                rate=base_line.rate,
                tax_rate=line.tax_rate,
                amount=base_line.amount,
                tax_amount=base_line.tax_amount,
                fc_rate=line.rate,
                fc_amount=line.amount,
            )
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
    if inv.tcs_amount > 0:
        tcs_payable = get_account_by_code(db, org_id, "2210")
        lines.append((tcs_payable.id, Decimal("0"), inv.tcs_amount, f"TCS on {inv.invoice_number}", inv.customer_id))
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


def _base_query(org_id: str):
    return (
        select(Invoice)
        .where(Invoice.organization_id == org_id)
        .options(selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item))
    )


@router.get("", response_model=Page[InvoiceListItem])
def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _base_query(user.organization_id)
    today = date.today()
    if status_filter == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status_filter == "unpaid":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES))
    elif status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(Invoice.date >= start_date)
    if end_date:
        stmt = stmt.where(Invoice.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.join(Contact, Contact.id == Invoice.customer_id).where(
            or_(func.lower(Invoice.invoice_number).like(q), func.lower(Contact.display_name).like(q), func.lower(Invoice.reference).like(q))
        )
    stmt = stmt.order_by(Invoice.date.desc(), Invoice.invoice_number.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_list_item(i) for i in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/stats", response_model=InvoiceStats)
def invoice_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    open_invoices = (
        db.execute(select(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status.in_(OPEN_STATUSES)))
        .scalars()
        .all()
    )
    overdue = [i for i in open_invoices if i.due_date < today]
    soon = [i for i in open_invoices if today <= i.due_date <= today + timedelta(days=30)]
    drafts = db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status == "draft")
    ).scalar_one()
    return InvoiceStats(
        total_outstanding=money(sum((i.balance_due for i in open_invoices), Decimal("0"))),
        overdue=money(sum((i.balance_due for i in overdue), Decimal("0"))),
        due_within_30_days=money(sum((i.balance_due for i in soon), Decimal("0"))),
        draft_count=drafts,
        unpaid_count=len(open_invoices),
        overdue_count=len(overdue),
    )


class SendInvoiceEmailRequest(BaseModel):
    to_email: str
    send_as_overdue: bool = False
    attach_pdf: bool = True
    custom_notes: Optional[str] = None


@router.get("/export/pdf")
def export_invoices_pdf(
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export filtered invoices list to PDF."""
    stmt = _base_query(user.organization_id)
    today = date.today()
    if status_filter == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status_filter == "unpaid":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES))
    elif status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(Invoice.date >= start_date)
    if end_date:
        stmt = stmt.where(Invoice.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Invoice.invoice_number).like(q)
            | func.lower(Invoice.reference).like(q)
            | Invoice.customer.has(func.lower(Contact.display_name).like(q))
        )
    stmt = stmt.order_by(Invoice.date.desc()).limit(500)
    invoices = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    pdf_content = export_service.generate_invoices_list_pdf(invoices, org)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="invoices_report.pdf"'},
    )


@router.get("/export/excel")
def export_invoices_excel(
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export filtered invoices list to Excel (.xlsx)."""
    stmt = _base_query(user.organization_id)
    today = date.today()
    if status_filter == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status_filter == "unpaid":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES))
    elif status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(Invoice.date >= start_date)
    if end_date:
        stmt = stmt.where(Invoice.date <= end_date)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Invoice.invoice_number).like(q)
            | func.lower(Invoice.reference).like(q)
            | Invoice.customer.has(func.lower(Contact.display_name).like(q))
        )
    stmt = stmt.order_by(Invoice.date.desc()).limit(500)
    invoices = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    excel_content = export_service.generate_invoices_list_excel(invoices, org)
    return Response(
        content=excel_content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="invoices_registry.xlsx"'},
    )


@router.post("/auto-remind-overdue")
def auto_remind_overdue_invoices(
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Automatically scans all overdue invoices with outstanding balances and dispatches Gmail reminder emails."""
    today = date.today()
    stmt = (
        _base_query(user.organization_id)
        .where(
            Invoice.status.in_(OPEN_STATUSES),
            Invoice.due_date < today,
        )
        .order_by(Invoice.due_date.asc())
    )
    all_overdue = db.execute(stmt).scalars().all()
    overdue_invoices = [inv for inv in all_overdue if inv.balance_due > 0]
    org = db.get(Organization, user.organization_id)

    dispatched = []
    skipped = []

    for inv in overdue_invoices:
        cust_email = inv.customer.email if inv.customer else None
        if not cust_email or "@" not in cust_email:
            skipped.append(
                {
                    "invoice_number": inv.invoice_number,
                    "customer": inv.customer.display_name if inv.customer else "Unknown",
                    "reason": "No valid email address on customer contact",
                }
            )
            continue

        days_overdue = max((today - inv.due_date).days, 1)
        pdf_bytes = export_service.generate_invoice_pdf(inv, org)
        res = send_due_reminder_email(
            to_email=cust_email,
            customer_name=inv.customer.display_name if inv.customer else "Valued Client",
            invoice_id=inv.invoice_number,
            amount=float(inv.balance_due or inv.total),
            due_date=inv.due_date.strftime("%d %b %Y"),
            days_overdue=days_overdue,
            custom_notes="Automated reminder: Please remit the balance due as per terms.",
            pdf_bytes=pdf_bytes,
            pdf_filename=f"Invoice_{inv.invoice_number}.pdf",
        )
        if res.get("success"):
            dispatched.append(
                {
                    "invoice_number": inv.invoice_number,
                    "customer": inv.customer.display_name if inv.customer else "Client",
                    "email": cust_email,
                    "balance_due": float(inv.balance_due),
                    "days_overdue": days_overdue,
                }
            )
            audit.record(
                db,
                user,
                "email",
                "invoice",
                inv.id,
                f"Auto-sent overdue reminder via Gmail SMTP to {cust_email} ({days_overdue} days overdue)",
            )
        else:
            skipped.append(
                {
                    "invoice_number": inv.invoice_number,
                    "customer": inv.customer.display_name if inv.customer else "Client",
                    "reason": res.get("error", "SMTP delivery failure"),
                }
            )

    db.commit()
    return {
        "success": True,
        "total_overdue": len(overdue_invoices),
        "reminders_sent": len(dispatched),
        "skipped_count": len(skipped),
        "dispatched": dispatched,
        "skipped": skipped,
    }


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.execute(_base_query(user.organization_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return to_out(inv)


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full PDF extract of a single GST Tax Invoice."""
    inv = db.execute(_base_query(user.organization_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_invoice_pdf(inv, org)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{inv.invoice_number}.pdf"'},
    )


@router.get("/{invoice_id}/excel")
def download_invoice_excel(
    invoice_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full Excel (.xlsx) extract of a single invoice."""
    inv = db.execute(_base_query(user.organization_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    org = db.get(Organization, user.organization_id)
    excel_bytes = export_service.generate_invoice_excel(inv, org)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{inv.invoice_number}.xlsx"'},
    )


@router.post("/{invoice_id}/send-gmail")
def send_invoice_via_gmail(
    invoice_id: str,
    payload: SendInvoiceEmailRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Send invoice via Gmail SMTP with configurable options (standard dispatch vs overdue reminder, PDF attachment, custom notes)."""
    inv = db.execute(_base_query(user.organization_id).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if inv.status == "void":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A void invoice cannot be emailed")
    org = db.get(Organization, user.organization_id)

    # Emailing a draft issues it. Post and commit that first: posting can still
    # be refused (not enough stock, say), and the customer must never receive
    # an invoice the books then decline to record.
    issued_now = inv.status == "draft"
    if issued_now:
        inv.status = "sent"
        inv.sent_at = datetime.now(UTC)
        post_invoice(db, inv, user)
        audit.record(db, user, "update", "invoice", inv.id, f"Invoice {inv.invoice_number} marked sent for emailing")
        db.commit()

    pdf_bytes = export_service.generate_invoice_pdf(inv, org) if payload.attach_pdf else None
    customer_name = inv.customer.display_name if inv.customer else "Valued Customer"

    if payload.send_as_overdue:
        today = date.today()
        days_overdue = max((today - inv.due_date).days, 1) if inv.due_date < today else 0
        res = send_due_reminder_email(
            to_email=payload.to_email,
            customer_name=customer_name,
            invoice_id=inv.invoice_number,
            amount=float(inv.balance_due or inv.total),
            due_date=inv.due_date.strftime("%d %b %Y"),
            days_overdue=days_overdue,
            custom_notes=payload.custom_notes,
            pdf_bytes=pdf_bytes,
            pdf_filename=f"Invoice_{inv.invoice_number}.pdf",
        )
    else:
        res = send_invoice_email(
            to_email=payload.to_email,
            customer_name=customer_name,
            invoice_id=inv.invoice_number,
            amount=float(inv.total),
            due_date=inv.due_date.strftime("%d %b %Y"),
            items_summary=f"Tax Invoice {inv.invoice_number} for {customer_name}",
            custom_notes=payload.custom_notes,
            pdf_bytes=pdf_bytes,
            pdf_filename=f"Invoice_{inv.invoice_number}.pdf",
        )

    if not res.get("success"):
        error = res.get("error", "Gmail SMTP send failed")
        if issued_now:
            error = f"{error}. The invoice has been marked as sent; the email can be retried."
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=error)

    audit.record(
        db,
        user,
        "email",
        "invoice",
        inv.id,
        f"Sent invoice {inv.invoice_number} to {payload.to_email} via Gmail SMTP (overdue={payload.send_as_overdue}, pdf={payload.attach_pdf})",
    )
    db.commit()
    return res


def create_invoice_record(db: Session, user: User, payload: InvoiceCreate, recurring_profile_id: Optional[str] = None) -> Invoice:
    """Create (and, when sent, post) an invoice without committing.

    Shared by the endpoint, quote / sales order conversion and recurring
    profiles, so each can commit the invoice together with its own changes.
    """
    inv = Invoice(
        organization_id=user.organization_id,
        invoice_number=numbering.next_number(db, user.organization_id, "invoice"),
        status="draft",
        created_by=user.id,
        recurring_profile_id=recurring_profile_id,
    )
    _apply_payload(db, inv, payload, user.organization_id)
    db.add(inv)
    db.flush()
    if payload.status == "sent":
        inv.status = "sent"
        inv.sent_at = datetime.now(UTC)
        post_invoice(db, inv, user)
    audit.record(db, user, "create", "invoice", inv.id, f"Created invoice {inv.invoice_number} ({inv.status})")
    return inv


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = create_invoice_record(db, user, payload)
    db.commit()
    return get_invoice(inv.id, user, db)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, payload: InvoiceUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.status in ("paid", "partially_paid", "void") or inv.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoices with payments or voided invoices cannot be edited")
    if inv.irn:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invoice has an e-invoice IRN; cancel the IRN and clear it before editing")
    was_posted = inv.status == "sent"
    if was_posted:
        unpost_invoice(db, inv, user, "Invoice edited")
    _apply_payload(db, inv, payload, user.organization_id)
    db.flush()
    if payload.status == "sent" or was_posted:
        inv.status = "sent"
        inv.sent_at = inv.sent_at or datetime.now(UTC)
        post_invoice(db, inv, user)
    else:
        inv.status = "draft"
    audit.record(db, user, "update", "invoice", inv.id, f"Updated invoice {inv.invoice_number}")
    db.commit()
    return get_invoice(inv.id, user, db)


@router.post("/{invoice_id}/status", response_model=InvoiceOut)
def change_status(invoice_id: str, payload: InvoiceStatusUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    target = payload.status
    if target == "sent":
        if inv.status != "draft":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft invoices can be marked as sent")
        inv.status = "sent"
        inv.sent_at = datetime.now(UTC)
        post_invoice(db, inv, user)
    elif target == "void":
        if inv.status == "void":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice is already void")
        if inv.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Delete the recorded payments before voiding this invoice")
        if inv.status != "draft":
            unpost_invoice(db, inv, user, "Invoice voided")
        inv.status = "void"
        # Release billed time so it can go on a replacement invoice, as delete does.
        for entry in db.execute(select(TimeEntry).where(TimeEntry.invoice_id == inv.id)).scalars():
            entry.invoice_id = None
        doc_flow.release_invoice(db, inv)
    elif target == "draft":
        if inv.status != "sent" or inv.amount_paid > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only unpaid sent invoices can be reverted to draft")
        unpost_invoice(db, inv, user, "Invoice reverted to draft")
        inv.status = "draft"
    audit.record(db, user, "update", "invoice", inv.id, f"Invoice {inv.invoice_number} marked {inv.status}")
    db.commit()
    return get_invoice(inv.id, user, db)


@router.delete("/{invoice_id}", response_model=Message)
def delete_invoice(invoice_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.amount_paid > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice has payments recorded. Delete recorded payments first.")
    if inv.status not in ("draft", "void"):
        unpost_invoice(db, inv, user, "Invoice deleted")
    for entry in db.execute(select(TimeEntry).where(TimeEntry.invoice_id == inv.id)).scalars():
        entry.invoice_id = None
    doc_flow.release_invoice(db, inv)
    for rz in db.execute(select(RazorpayPayment).where(RazorpayPayment.invoice_id == inv.id)).scalars():
        rz.invoice_id = None
    for ref in db.execute(select(PaymentRefund).where(PaymentRefund.invoice_id == inv.id)).scalars():
        ref.invoice_id = None
    for ep in db.execute(select(ExternalPaymentProof).where(ExternalPaymentProof.invoice_id == inv.id)).scalars():
        ep.invoice_id = None
    number = inv.invoice_number
    db.delete(inv)
    audit.record(db, user, "delete", "invoice", invoice_id, f"Deleted invoice {number}")
    db.commit()
    return Message(message=f"Invoice {number} deleted")
