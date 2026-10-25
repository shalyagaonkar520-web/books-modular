"""Shared plumbing for the documents around invoices and bills.

Quotes and sales orders lead to invoices, purchase orders to bills, and
credit notes / vendor credits reverse them. They are all priced exactly like
an invoice (services/documents.compute_lines), so this module holds what they
have in common: pricing a document from its payload, rendering it, copying
its lines into a new document and unlinking a source when its invoice or bill
goes away.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Type

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import (
    Bill,
    Contact,
    ContactRefund,
    CreditApplication,
    CreditNote,
    CreditNoteLine,
    Estimate,
    EstimateLine,
    Invoice,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesOrder,
    SalesOrderLine,
    VendorCredit,
    VendorCreditLine,
)
from backend.schemas.documents_flow import CreditApplicationOut, DocumentListItem, DocumentOut, RefundOut
from backend.schemas.sales import LineInput, LineOut
from backend.services import fx, stock
from backend.services.documents import compute_lines, totals
from backend.services.money import money
from backend.services.tenancy import get_or_404


@dataclass(frozen=True)
class DocKind:
    key: str
    label: str
    model: Type
    line_model: Type
    number_attr: str
    party: str  # customer | vendor
    # Which accounts its lines may name: income ("invoice") or expense ("bill").
    line_kind: str
    # The optional second date: expiry, shipment or delivery.
    second_date: Optional[str] = None

    @property
    def party_attr(self) -> str:
        return f"{self.party}_id"


ESTIMATE = DocKind("estimate", "Quote", Estimate, EstimateLine, "estimate_number", "customer", "invoice", "expiry_date")
SALES_ORDER = DocKind(
    "sales_order", "Sales order", SalesOrder, SalesOrderLine, "sales_order_number", "customer", "invoice", "shipment_date"
)
CREDIT_NOTE = DocKind("credit_note", "Credit note", CreditNote, CreditNoteLine, "credit_note_number", "customer", "invoice")
PURCHASE_ORDER = DocKind(
    "purchase_order", "Purchase order", PurchaseOrder, PurchaseOrderLine, "purchase_order_number", "vendor", "bill", "delivery_date"
)
VENDOR_CREDIT = DocKind("vendor_credit", "Vendor credit", VendorCredit, VendorCreditLine, "vendor_credit_number", "vendor", "bill")


def number_of(doc) -> str:
    for kind in (ESTIMATE, SALES_ORDER, CREDIT_NOTE, PURCHASE_ORDER, VENDOR_CREDIT):
        if isinstance(doc, kind.model):
            return getattr(doc, kind.number_attr)
    raise TypeError(type(doc))


def party_of(doc) -> Contact:
    return doc.customer if hasattr(doc, "customer_id") else doc.vendor


def get_party(db: Session, org_id: str, contact_id: str, party: str, current_id: Optional[str] = None) -> Contact:
    label = party.capitalize()
    contact = get_or_404(db, Contact, contact_id, org_id, label)
    if contact.type != party:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Selected contact is not a {party}")
    # Inactive contacts cannot go on anything new, but a document that
    # already carries one can still be edited.
    if not contact.is_active and contact.id != current_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} '{contact.display_name}' is inactive")
    return contact


def price(db: Session, org_id: str, doc, payload, kind: DocKind) -> None:
    """Fill a document's common fields, lines and totals from its payload."""
    contact = get_party(db, org_id, getattr(payload, kind.party_attr), kind.party, getattr(doc, kind.party_attr, None))
    if fx.is_foreign(db, org_id, contact.currency):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{kind.label}s are kept in {fx.base_currency(db, org_id)}; {contact.display_name} deals in {contact.currency}, so invoice or bill them directly",
        )
    existing_item_ids = {line.item_id for line in doc.lines if line.item_id}
    computed, subtotal, tax_total = compute_lines(db, org_id, payload.lines, kind=kind.line_kind, discount=payload.discount_amount)
    for line in computed:
        if line.item and not line.item.is_active and line.item.id not in existing_item_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Item '{line.item.name}' is inactive")
    setattr(doc, kind.party_attr, contact.id)
    doc.date = payload.date
    if kind.second_date:
        setattr(doc, kind.second_date, getattr(payload, kind.second_date))
    for attr in ("reference", "subject", "notes", "terms", "salesperson", "reason"):
        if hasattr(payload, attr):
            setattr(doc, attr, getattr(payload, attr))
    doc.discount_amount = money(payload.discount_amount)
    doc.subtotal = subtotal
    doc.tax_total = tax_total
    doc.total = totals(subtotal, doc.discount_amount, tax_total)
    doc.lines.clear()
    for position, line in enumerate(computed):
        doc.lines.append(
            kind.line_model(
                item_id=line.item.id if line.item else None,
                account_id=line.account.id if line.account else None,
                position=position,
                description=line.spec.description,
                quantity=line.quantity,
                rate=line.rate,
                tax_rate=line.tax_rate,
                amount=line.amount,
                tax_amount=line.tax_amount,
                serial_numbers=", ".join(stock.parse_serials(line.spec.serial_numbers)) or None,
            )
        )


def line_out(line) -> LineOut:
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
        serial_numbers=line.serial_numbers,
    )


def copy_lines(doc) -> List[LineInput]:
    """The document's lines as input for a new invoice, bill or credit."""
    return [
        LineInput(
            item_id=line.item_id,
            account_id=line.account_id,
            description=line.description,
            quantity=line.quantity,
            rate=line.rate,
            tax_rate=line.tax_rate,
            serial_numbers=line.serial_numbers,
        )
        for line in doc.lines
    ]


def _number(db: Session, model, attr: str, doc_id: Optional[str]) -> Optional[str]:
    if not doc_id:
        return None
    return db.execute(select(getattr(model, attr)).where(model.id == doc_id)).scalar_one_or_none()


def refund_out(refund: ContactRefund) -> RefundOut:
    source = "credit_note" if refund.credit_note_id else "vendor_credit" if refund.vendor_credit_id else "advance"
    return RefundOut(
        id=refund.id,
        refund_number=refund.refund_number,
        party_type=refund.party_type,
        source=source,
        contact_id=refund.contact_id,
        contact_name=refund.contact.display_name,
        credit_note_id=refund.credit_note_id,
        credit_note_number=refund.credit_note.credit_note_number if refund.credit_note else None,
        vendor_credit_id=refund.vendor_credit_id,
        vendor_credit_number=refund.vendor_credit.vendor_credit_number if refund.vendor_credit else None,
        bank_account_id=refund.bank_account_id,
        bank_account_name=refund.bank_account.name,
        date=refund.date,
        amount=refund.amount,
        mode=refund.mode,
        reference=refund.reference,
        notes=refund.notes,
        created_at=refund.created_at,
    )


def application_out(app: CreditApplication) -> CreditApplicationOut:
    # Neither credit set: the contact's advance was applied.
    credit_id, credit_number = None, "Advance"
    if app.credit_note_id:
        credit_id, credit_number = app.credit_note_id, app.credit_note.credit_note_number
    elif app.vendor_credit_id:
        credit_id, credit_number = app.vendor_credit_id, app.vendor_credit.vendor_credit_number
    if app.invoice_id:
        document_id, document_number = app.invoice_id, app.invoice.invoice_number
    else:
        document_id, document_number = app.bill_id, app.bill.bill_number
    return CreditApplicationOut(
        id=app.id,
        date=app.date,
        amount=app.amount,
        credit_id=credit_id,
        credit_number=credit_number,
        document_id=document_id,
        document_number=document_number,
        created_at=app.created_at,
    )


def effective_status(doc, kind: DocKind, today: Optional[date] = None) -> str:
    today = today or date.today()
    if kind is ESTIMATE and doc.status in ("draft", "sent") and doc.expiry_date and doc.expiry_date < today:
        return "expired"
    return doc.status


def to_out(db: Session, doc, kind: DocKind) -> DocumentOut:
    contact = party_of(doc)
    out: Dict = dict(
        id=doc.id,
        kind=kind.key,
        number=getattr(doc, kind.number_attr),
        contact_id=contact.id,
        contact_name=contact.display_name,
        contact_email=contact.email,
        contact_gstin=contact.gstin,
        contact_billing_address=contact.billing_address,
        date=doc.date,
        status=effective_status(doc, kind),
        reference=doc.reference,
        subject=doc.subject,
        salesperson=getattr(doc, "salesperson", None),
        reason=getattr(doc, "reason", None),
        subtotal=doc.subtotal,
        discount_amount=doc.discount_amount,
        tax_total=doc.tax_total,
        total=doc.total,
        notes=doc.notes,
        terms=doc.terms,
        lines=[line_out(line) for line in doc.lines],
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )
    if kind.second_date:
        out[kind.second_date] = getattr(doc, kind.second_date)
    if hasattr(doc, "invoice_id"):
        out["invoice_id"] = doc.invoice_id
        out["invoice_number"] = _number(db, Invoice, "invoice_number", doc.invoice_id)
    if hasattr(doc, "bill_id"):
        out["bill_id"] = doc.bill_id
        out["bill_number"] = _number(db, Bill, "bill_number", doc.bill_id)
    if kind is ESTIMATE:
        out["sales_order_id"] = doc.sales_order_id
        out["sales_order_number"] = _number(db, SalesOrder, "sales_order_number", doc.sales_order_id)
    if kind is SALES_ORDER:
        source = db.execute(select(Estimate).where(Estimate.sales_order_id == doc.id)).scalars().first()
        if source:
            out["estimate_id"], out["estimate_number"] = source.id, source.estimate_number
    if kind in (CREDIT_NOTE, VENDOR_CREDIT):
        credit_col = CreditApplication.credit_note_id if kind is CREDIT_NOTE else CreditApplication.vendor_credit_id
        refund_col = ContactRefund.credit_note_id if kind is CREDIT_NOTE else ContactRefund.vendor_credit_id
        apps = db.execute(select(CreditApplication).where(credit_col == doc.id).order_by(CreditApplication.created_at)).scalars().all()
        refunds = db.execute(select(ContactRefund).where(refund_col == doc.id).order_by(ContactRefund.date)).scalars().all()
        out.update(
            amount_applied=doc.amount_applied,
            amount_refunded=doc.amount_refunded,
            balance=money(doc.balance),
            applications=[application_out(a) for a in apps],
            refunds=[refund_out(r) for r in refunds],
        )
    return DocumentOut(**out)


def to_list_item(db: Session, doc, kind: DocKind, invoice_numbers: Optional[Dict[str, str]] = None) -> DocumentListItem:
    contact = party_of(doc)
    out: Dict = dict(
        id=doc.id,
        kind=kind.key,
        number=getattr(doc, kind.number_attr),
        contact_id=contact.id,
        contact_name=contact.display_name,
        date=doc.date,
        status=effective_status(doc, kind),
        reference=doc.reference,
        total=doc.total,
    )
    if kind.second_date:
        out[kind.second_date] = getattr(doc, kind.second_date)
    if kind in (CREDIT_NOTE, VENDOR_CREDIT):
        out["balance"] = money(doc.balance)
    if getattr(doc, "invoice_id", None):
        out["invoice_number"] = (invoice_numbers or {}).get(doc.invoice_id) or _number(db, Invoice, "invoice_number", doc.invoice_id)
    if getattr(doc, "bill_id", None):
        out["bill_number"] = _number(db, Bill, "bill_number", doc.bill_id)
    return DocumentListItem(**out)


def release_invoice(db: Session, invoice: Invoice) -> None:
    """An invoice was voided or deleted: its quote / sales order can be invoiced again."""
    for est in db.execute(select(Estimate).where(Estimate.invoice_id == invoice.id)).scalars():
        est.invoice_id = None
        est.status = "accepted"
    for so in db.execute(select(SalesOrder).where(SalesOrder.invoice_id == invoice.id)).scalars():
        so.invoice_id = None
        so.status = "confirmed"


def release_bill(db: Session, bill: Bill) -> None:
    """A bill was voided or deleted: its purchase order can be billed again."""
    for po in db.execute(select(PurchaseOrder).where(PurchaseOrder.bill_id == bill.id)).scalars():
        po.bill_id = None
        po.status = "issued"
