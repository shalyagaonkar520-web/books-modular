"""Integrations: Tally export / ledger import and WhatsApp."""

from __future__ import annotations

import secrets
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_financial_read, require_write
from backend.models import Invoice, Organization, User
from backend.schemas.common import APIModel
from backend.services import audit, tally, whatsapp
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


class TallyImportOut(APIModel):
    accounts_created: int
    customers_created: int
    vendors_created: int
    skipped: int
    errors: list[str]


@router.get("/tally/export")
def tally_export(
    start_date: date = Query(alias="startDate"),
    end_date: date = Query(alias="endDate"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    """Ledgers and vouchers for the period as Tally XML (Gateway of Tally > Import Data > Vouchers)."""
    if start_date > end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date is after the end date")
    org = db.get(Organization, user.organization_id)
    xml = tally.export_xml(db, org, start_date, end_date)
    name = f"tally_{start_date.isoformat()}_{end_date.isoformat()}.xml"
    return Response(content=xml, media_type="application/xml", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/tally/import-ledgers", response_model=TallyImportOut)
async def tally_import(file: UploadFile = File(...), user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Create accounts, customers and vendors from Tally ledger masters."""
    content = await file.read(tally.MAX_IMPORT_BYTES + 1)
    result = tally.import_ledgers(db, user.organization_id, content)
    audit.record(
        db,
        user,
        "create",
        "tally_import",
        None,
        f"Tally import: {result.accounts_created} accounts, {result.customers_created} customers, {result.vendors_created} vendors",
    )
    db.commit()
    return TallyImportOut(**result.__dict__)


class WhatsAppStatus(APIModel):
    configured: bool
    template: Optional[str] = None


class WhatsAppInvoice(APIModel):
    to_phone: Optional[str] = Field(default=None, max_length=30)
    kind: Literal["invoice", "reminder"] = "invoice"
    message: Optional[str] = Field(default=None, max_length=3000)


class WhatsAppSent(APIModel):
    message_id: str
    to: str
    text: str


@router.get("/whatsapp/status", response_model=WhatsAppStatus)
def whatsapp_status(user: User = Depends(get_current_user)):
    return WhatsAppStatus(configured=whatsapp.configured(), template=get_settings().whatsapp_template or None)


@router.post("/whatsapp/invoices/{invoice_id}", response_model=WhatsAppSent)
def whatsapp_invoice(invoice_id: str, payload: WhatsAppInvoice, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Send the invoice (or a payment reminder) on WhatsApp with a link to view, download and pay it."""
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {inv.status} invoice cannot be sent")
    phone = payload.to_phone or inv.customer.mobile or inv.customer.phone
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The customer has no mobile number: enter one")
    org = db.get(Organization, user.organization_id)
    if not inv.share_token:
        inv.share_token = secrets.token_urlsafe(24)
    link = f"{get_settings().app_url.rstrip('/')}/p/{inv.share_token}"
    amount = f"{inv.currency or 'INR'} {inv.balance_due:,.2f}"
    if payload.message:
        text = payload.message.strip() + f"\n\n{link}"
    elif payload.kind == "reminder":
        text = (
            f"Hello {inv.customer.display_name}, a reminder from {org.name}: invoice {inv.invoice_number} for {amount} "
            f"was due on {inv.due_date.strftime('%d %b %Y')}. View and pay here: {link}"
        )
    else:
        text = (
            f"Hello {inv.customer.display_name}, {org.name} has sent you invoice {inv.invoice_number} for {amount}, "
            f"due {inv.due_date.strftime('%d %b %Y')}. View, download and pay: {link}"
        )
    message_id = whatsapp.send_text(phone, text)
    to = whatsapp.normalize_phone(phone)
    audit.record(db, user, "send", "invoice", inv.id, f"Sent {payload.kind} for {inv.invoice_number} on WhatsApp to +{to}")
    db.commit()
    return WhatsAppSent(message_id=message_id, to=to, text=text)
