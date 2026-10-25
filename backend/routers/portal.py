"""Customer portal: share an invoice or quote by a private link the customer opens without logging in.

The link carries an unguessable token stored on the document; revoking it
clears the token. Through the link the customer can see and download the
document, and accept or decline a quote.
"""

from __future__ import annotations

import secrets
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import require_write
from backend.models import Estimate, EstimateLine, Invoice, InvoiceLine, Organization, User
from backend.schemas.common import APIModel, Message
from backend.services import audit, doc_flow, doc_pdf, export_service, upi
from backend.services.doc_flow import ESTIMATE
from backend.services.tenancy import get_or_404

share_router = APIRouter(prefix="/api/share", tags=["Portal"])
public_router = APIRouter(prefix="/api/public/documents", tags=["Portal"])

Kind = Literal["invoice", "estimate"]


class ShareLink(APIModel):
    token: str
    path: str


class PortalLine(APIModel):
    description: str
    quantity: Decimal
    rate: Decimal
    tax_rate: Decimal
    amount: Decimal


class PortalDocument(APIModel):
    kind: str
    number: str
    status: str
    date: date
    due_date: Optional[date] = None
    expiry_date: Optional[date] = None
    organization_name: str
    organization_gstin: Optional[str] = None
    brand_color: Optional[str] = None
    logo_url: Optional[str] = None
    customer_name: str
    currency: str
    subtotal: Decimal
    discount: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: List[PortalLine]
    can_respond: bool = False
    # UPI payment link for an unpaid INR invoice when the organization has a UPI ID.
    upi_uri: Optional[str] = None


def _model(kind: str):
    return Invoice if kind == "invoice" else Estimate


@share_router.post("/{kind}/{doc_id}", response_model=ShareLink)
def create_link(kind: Kind, doc_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    doc = get_or_404(db, _model(kind), doc_id, user.organization_id, kind.capitalize())
    if doc.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {doc.status} {kind} cannot be shared; send it first")
    if not doc.share_token:
        doc.share_token = secrets.token_urlsafe(24)
        audit.record(db, user, "update", kind, doc.id, f"Shared {kind} by link")
        db.commit()
    return ShareLink(token=doc.share_token, path=f"/p/{doc.share_token}")


@share_router.delete("/{kind}/{doc_id}", response_model=Message)
def revoke_link(kind: Kind, doc_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    doc = get_or_404(db, _model(kind), doc_id, user.organization_id, kind.capitalize())
    doc.share_token = None
    audit.record(db, user, "update", kind, doc.id, f"Revoked the share link of the {kind}")
    db.commit()
    return Message(message="Link revoked")


def _find(db: Session, token: str):
    if len(token) < 20:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link is not valid")
    inv = db.execute(
        select(Invoice)
        .where(Invoice.share_token == token)
        .options(selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item))
    ).scalar_one_or_none()
    if inv:
        return "invoice", inv
    est = db.execute(
        select(Estimate)
        .where(Estimate.share_token == token)
        .options(selectinload(Estimate.customer), selectinload(Estimate.lines).selectinload(EstimateLine.item))
    ).scalar_one_or_none()
    if est:
        return "estimate", est
    raise HTTPException(status.HTTP_404_NOT_FOUND, "This link is not valid or has been revoked")


def _upi_uri(org: Organization, inv: Invoice, currency: str, balance: Decimal) -> Optional[str]:
    if not org.upi_id or currency != "INR" or inv.status not in ("sent", "partially_paid") or balance <= 0:
        return None
    return upi.pay_uri(org.upi_id, org.legal_name or org.name, balance, f"Invoice {inv.invoice_number}")


@public_router.get("/{token}/upi-qr")
def upi_qr(token: str, db: Session = Depends(get_db)):
    """The invoice's UPI payment link as a QR code (SVG) the customer scans with any UPI app."""
    kind, doc = _find(db, token)
    org = db.get(Organization, doc.organization_id)
    uri = _upi_uri(org, doc, doc.currency or org.currency or "INR", doc.balance_due) if kind == "invoice" else None
    if not uri:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "UPI payment is not available for this document")
    return Response(content=upi.qr_svg(uri), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


@public_router.get("/{token}", response_model=PortalDocument)
def view(token: str, db: Session = Depends(get_db)):
    kind, doc = _find(db, token)
    org = db.get(Organization, doc.organization_id)
    common = dict(
        organization_name=org.legal_name or org.name,
        organization_gstin=org.gstin,
        brand_color=org.brand_color,
        logo_url=org.logo_url,
        customer_name=doc.customer.display_name,
        notes=doc.notes,
        terms=doc.terms,
        date=doc.date,
    )
    if kind == "invoice":
        foreign = doc.exchange_rate is not None and doc.exchange_rate != 1

        def fc(base, own):
            """The invoice's own-currency figure for a foreign-currency invoice."""
            return own if foreign and own is not None else base

        currency = doc.currency or org.currency or "INR"
        balance = (doc.fc_total - doc.fc_amount_paid) if foreign else doc.balance_due
        return PortalDocument(
            kind="invoice",
            number=doc.invoice_number,
            upi_uri=_upi_uri(org, doc, currency, balance),
            status=doc.status,
            due_date=doc.due_date,
            currency=currency,
            subtotal=fc(doc.subtotal, doc.fc_subtotal),
            discount=fc(doc.discount_amount, doc.fc_discount_amount),
            tax_total=fc(doc.tax_total, doc.fc_tax_total),
            total=fc(doc.total, doc.fc_total),
            amount_paid=fc(doc.amount_paid, doc.fc_amount_paid),
            balance_due=balance,
            lines=[
                PortalLine(
                    description=ln.description,
                    quantity=ln.quantity,
                    rate=fc(ln.rate, ln.fc_rate),
                    tax_rate=ln.tax_rate,
                    amount=fc(ln.amount, ln.fc_amount),
                )
                for ln in doc.lines
            ],
            **common,
        )
    effective = doc_flow.effective_status(doc, ESTIMATE)
    return PortalDocument(
        kind="estimate",
        number=doc.estimate_number,
        status=effective,
        expiry_date=doc.expiry_date,
        currency=org.currency or "INR",
        subtotal=doc.subtotal,
        discount=doc.discount_amount,
        tax_total=doc.tax_total,
        total=doc.total,
        lines=[
            PortalLine(description=ln.description, quantity=ln.quantity, rate=ln.rate, tax_rate=ln.tax_rate, amount=ln.amount)
            for ln in doc.lines
        ],
        can_respond=effective in ("draft", "sent"),
        **common,
    )


@public_router.get("/{token}/pdf")
def pdf(token: str, db: Session = Depends(get_db)):
    kind, doc = _find(db, token)
    org = db.get(Organization, doc.organization_id)
    if kind == "invoice":
        content, name = export_service.generate_invoice_pdf(doc, org), f"Invoice-{doc.invoice_number}.pdf"
    else:
        content, name = doc_pdf.generate_document_pdf(doc_flow.to_out(db, doc, ESTIMATE), "Quote", org), f"Quote-{doc.estimate_number}.pdf"
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})


class Response_(APIModel):
    name: Optional[str] = None
    note: Optional[str] = None


def _respond(db: Session, token: str, accept: bool, payload: Response_) -> Message:
    kind, doc = _find(db, token)
    if kind != "estimate":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only quotes can be accepted or declined")
    if doc_flow.effective_status(doc, ESTIMATE) not in ("draft", "sent"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This quote can no longer be answered")
    doc.status = "accepted" if accept else "declined"
    who = (payload.name or doc.customer.display_name)[:80]
    note = f" - {payload.note[:300]}" if payload.note else ""
    audit.record(
        db,
        None,
        "update",
        "estimate",
        doc.id,
        f"Quote {doc.estimate_number} {doc.status} by the customer via link{note}",
        organization_id=doc.organization_id,
        actor_name=f"{who} (customer)",
    )
    doc.customer_response_at = datetime.now(UTC)
    db.commit()
    return Message(message=f"Thank you - the quote has been {doc.status}")


@public_router.post("/{token}/accept", response_model=Message)
def accept(token: str, payload: Response_, db: Session = Depends(get_db)):
    return _respond(db, token, True, payload)


@public_router.post("/{token}/decline", response_model=Message)
def decline(token: str, payload: Response_, db: Session = Depends(get_db)):
    return _respond(db, token, False, payload)
