"""Razorpay Payments, Webhooks, Refunds, Reconciliation & Financial Hub API Router."""
from __future__ import annotations

import csv
import io
import json
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_write
from backend.models import (
    Account,
    BankAccount,
    CustomerPayment,
    Expense,
    FinancialTransactionRecord,
    Invoice,
    JournalEntry,
    PaymentEvent,
    PaymentRecord,
    PaymentRefund,
    RazorpayCategoryRule,
    RazorpaySyncLog,
    ReconciliationRecord,
    SettlementRecord,
    User,
    new_id,
)
from backend.services import audit, bank, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.numbering import next_number
from backend.services import razorpay_matching, razorpay_posting, razorpay_sync
from backend.services.razorpay_categorize import (
    CATEGORIES,
    MATCH_TYPES,
    Categorisation,
    apply_categorisation,
    categorise,
)
from backend.services.razorpay_service import (
    RazorpayNotConfigured,
    RazorpayUnavailable,
    get_razorpay_service,
)
from backend.services.tenancy import Pagination, paginate

logger = logging.getLogger("roomanbooks.razorpay")

router = APIRouter(prefix="/api/razorpay", tags=["razorpay"])


def _refresh_invoice_status(inv: Invoice) -> None:
    razorpay_posting.refresh_invoice_status(inv)


# --------------------------------------------------------------------------- #
# Pydantic Schemas
# --------------------------------------------------------------------------- #
class CreateOrderRequest(BaseModel):
    invoice_id: str
    amount: Optional[Decimal] = None
    notes: Optional[Dict[str, Any]] = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    invoice_id: str
    amount: Decimal
    method: Optional[str] = "card"


class RefundRequest(BaseModel):
    payment_id: str
    amount: Decimal = Field(gt=0)
    reason: str = "Customer return / refund"
    speed: str = "normal"  # normal | optimum


# --------------------------------------------------------------------------- #
# Helpers for Financial Transactions & Ledger
# --------------------------------------------------------------------------- #
def _record_financial_txn(
    db: Session,
    org_id: str,
    txn_type: str,
    ref_type: str,
    ref_id: Optional[str],
    debit: Decimal,
    credit: Decimal,
    amount: Decimal,
    account: str,
    txn_date: date,
    description: str,
    status_val: str = "posted",
    user_id: Optional[str] = None,
) -> FinancialTransactionRecord:
    return razorpay_posting.record_financial_txn(
        db, org_id, txn_type, ref_type, ref_id, debit, credit,
        amount, account, txn_date, description, status_val, user_id,
    )


# --------------------------------------------------------------------------- #
# Public Config & Order Creation
# --------------------------------------------------------------------------- #
@router.get("/config")
def get_config(user: User = Depends(get_current_user)):
    """Returns safe frontend configuration. Secrets are NEVER returned."""
    service = get_razorpay_service()
    cfg = service.get_public_config()
    return cfg


@router.post("/create-order")
def create_order(
    payload: CreateOrderRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Generates a Razorpay Order for an open invoice."""
    org_id = user.organization_id
    invoice = db.execute(
        select(Invoice)
        .where(Invoice.id == payload.invoice_id, Invoice.organization_id == org_id)
        .options(selectinload(Invoice.customer))
    ).scalar_one_or_none()

    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if invoice.status in ("paid", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invoice is already {invoice.status}")

    amount = payload.amount or invoice.balance_due
    if amount <= 0 or amount > invoice.balance_due:
        amount = invoice.balance_due

    service = get_razorpay_service()
    notes = {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "organization_id": org_id,
        "customer_id": invoice.customer_id,
        **(payload.notes or {}),
    }

    order = service.create_order(
        amount_inr=amount,
        receipt=invoice.invoice_number,
        notes=notes,
    )

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order.get("currency", "INR"),
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "customer_name": invoice.customer.display_name if invoice.customer else "",
        "customer_email": invoice.customer.email if invoice.customer else "",
        "customer_phone": invoice.customer.phone if invoice.customer else "",
        "key_id": service.key_id,
        "mode": service.mode,
    }


# --------------------------------------------------------------------------- #
# Verify Payment (Standard Checkout Callback)
# --------------------------------------------------------------------------- #
@router.post("/verify-payment")
def verify_payment(
    payload: VerifyPaymentRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Verifies Razorpay signature, updates invoice, creates internal customer payment,

    and books gateway processing fee expense.
    """
    org_id = user.organization_id
    service = get_razorpay_service()

    # 1. Verify cryptographic signature
    valid = service.verify_payment_signature(
        order_id=payload.razorpay_order_id,
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
    )
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payment signature verification failed")

    # 2. Check idempotency: avoid duplicate payment records
    existing_pay = db.execute(
        select(PaymentRecord).where(
            PaymentRecord.razorpay_payment_id == payload.razorpay_payment_id,
            PaymentRecord.organization_id == org_id,
        )
    ).scalar_one_or_none()

    if existing_pay:
        return {
            "success": True,
            "message": "Payment already processed",
            "payment_id": existing_pay.id,
            "razorpay_payment_id": existing_pay.razorpay_payment_id,
            "invoice_id": existing_pay.invoice_id,
        }

    # 3. Load Invoice
    invoice = db.execute(
        select(Invoice).where(Invoice.id == payload.invoice_id, Invoice.organization_id == org_id)
    ).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    # 4. Fetch details from Razorpay or compute standard fee
    payment_info = service.fetch_payment(payload.razorpay_payment_id)
    method = payload.method or (payment_info.get("method") if payment_info else "card") or "card"
    fee_inr, tax_on_fee, net_settlement = service.calculate_fees_and_settlement(payload.amount, payment_info)

    # 5. Find the account Razorpay settles into
    bank_account = razorpay_posting.default_bank_account(db, org_id)
    if not bank_account:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No bank account found in organization")

    # 6. Book the customer payment (Dr bank / Cr accounts receivable) and
    #    7. the gateway fee, both through the shared posting service so the
    #    checkout and sync paths produce identical ledger entries.
    pay_date = date.today()
    cust_payment = razorpay_posting.book_customer_payment(
        db,
        org_id,
        invoice,
        bank_account,
        money(payload.amount),
        payload.razorpay_payment_id,
        payload.razorpay_order_id,
        method,
        pay_date,
        user.id,
    )
    razorpay_posting.book_gateway_fee(
        db,
        org_id,
        bank_account,
        fee_inr,
        tax_on_fee,
        net_settlement,
        payload.razorpay_payment_id,
        invoice.customer_id,
        pay_date,
        user.id,
    )

    # 8. Record PaymentRecord
    record = PaymentRecord(
        id=new_id(),
        organization_id=org_id,
        razorpay_order_id=payload.razorpay_order_id,
        razorpay_payment_id=payload.razorpay_payment_id,
        razorpay_signature=payload.razorpay_signature,
        customer_id=invoice.customer_id,
        sales_order_id=invoice.sales_order_id if hasattr(invoice, "sales_order_id") else None,
        invoice_id=invoice.id,
        customer_payment_id=cust_payment.id,
        amount=money(payload.amount),
        currency="INR",
        payment_method=method,
        payment_status="captured",
        mode=service.mode,
        captured_at=datetime.utcnow(),
        refund_amount=Decimal("0"),
        razorpay_fee=fee_inr,
        tax_on_fee=tax_on_fee,
        net_settlement=net_settlement,
        notes=f"Captured via standard checkout ({method.upper()})",
        created_by=user.id,
        source="checkout",
        transaction_date=pay_date,
        customer_name=invoice.customer.display_name if invoice.customer else None,
        customer_email=invoice.customer.email if invoice.customer else None,
        description=f"Payment for invoice {invoice.invoice_number}",
        reconciliation_status="matched",
        invoice_match_confidence=Decimal("1.000"),
        last_synced_at=datetime.now(UTC),
    )
    db.add(record)
    db.flush()
    apply_categorisation(record, categorise(db, record))

    db.commit()

    return {
        "success": True,
        "message": "Payment verified and booked successfully",
        "payment_id": record.id,
        "razorpay_payment_id": record.razorpay_payment_id,
        "invoice_status": invoice.status,
        "amount_paid": float(invoice.amount_paid),
        "balance_due": float(invoice.balance_due),
        "razorpay_fee": float(fee_inr),
        "tax_on_fee": float(tax_on_fee),
        "net_settlement": float(net_settlement),
    }


# --------------------------------------------------------------------------- #
# Secure Idempotent Webhook Handler
# --------------------------------------------------------------------------- #
@router.post("/webhook")
async def handle_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    db: Session = Depends(get_db),
):
    """Secure webhook handler with signature verification, idempotency, and audit."""
    body_bytes = await request.body()
    service = get_razorpay_service()

    # 1. Verify signature
    if not service.verify_webhook_signature(body_bytes, x_razorpay_signature or ""):
        logger.warning("Rejected webhook due to invalid signature.")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature")

    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed JSON")

    event_id = data.get("event_id") or data.get("id") or f"evt_{hash(body_bytes)}"
    event_type = data.get("event", "unknown")
    entity_payload = data.get("payload", {})

    # 2. Check idempotency
    existing_evt = db.execute(
        select(PaymentEvent).where(PaymentEvent.event_id == event_id)
    ).scalar_one_or_none()

    if existing_evt:
        return {"status": "already_processed", "event_id": event_id}

    # Record event for audit trail
    evt_record = PaymentEvent(
        id=new_id(),
        organization_id=data.get("organization_id"),
        event_id=event_id,
        event_type=event_type,
        entity_id=data.get("entity_id"),
        payload=json.dumps(data),
        status="processed",
        processed_at=datetime.utcnow(),
    )
    db.add(evt_record)

    # 3. Process event types
    if event_type == "payment.captured":
        payment_entity = entity_payload.get("payment", {}).get("entity", {})
        pay_id = payment_entity.get("id")
        amount_paise = payment_entity.get("amount", 0)
        amount_inr = Decimal(str(amount_paise)) / Decimal("100")
        notes = payment_entity.get("notes", {})
        invoice_id = notes.get("invoice_id")
        org_id = notes.get("organization_id") or "org_default"
        evt_record.organization_id = org_id

        # If not already recorded, create PaymentRecord
        existing_pay = db.execute(
            select(PaymentRecord).where(PaymentRecord.razorpay_payment_id == pay_id)
        ).scalar_one_or_none()

        if not existing_pay and invoice_id:
            invoice = db.get(Invoice, invoice_id)
            if invoice:
                fee_inr, tax_on_fee, net_settlement = service.calculate_fees_and_settlement(amount_inr, payment_entity)
                rec = PaymentRecord(
                    id=new_id(),
                    organization_id=invoice.organization_id,
                    razorpay_order_id=payment_entity.get("order_id"),
                    razorpay_payment_id=pay_id,
                    customer_id=invoice.customer_id,
                    invoice_id=invoice.id,
                    amount=amount_inr,
                    currency="INR",
                    payment_method=payment_entity.get("method", "card"),
                    payment_status="captured",
                    mode=service.mode,
                    captured_at=datetime.utcnow(),
                    razorpay_fee=fee_inr,
                    tax_on_fee=tax_on_fee,
                    net_settlement=net_settlement,
                )
                db.add(rec)

    elif event_type == "payment.failed":
        payment_entity = entity_payload.get("payment", {}).get("entity", {})
        pay_id = payment_entity.get("id")
        error_code = payment_entity.get("error_code")
        error_desc = payment_entity.get("error_description")
        rec = db.execute(
            select(PaymentRecord).where(PaymentRecord.razorpay_payment_id == pay_id)
        ).scalar_one_or_none()
        if rec:
            rec.payment_status = "failed"
            rec.error_code = error_code
            rec.error_description = error_desc

    elif event_type in ("refund.created", "refund.processed"):
        refund_entity = entity_payload.get("refund", {}).get("entity", {})
        rfnd_id = refund_entity.get("id")
        pay_id = refund_entity.get("payment_id")
        amount_inr = Decimal(str(refund_entity.get("amount", 0))) / Decimal("100")
        rec = db.execute(
            select(PaymentRecord).where(PaymentRecord.razorpay_payment_id == pay_id)
        ).scalar_one_or_none()
        if rec:
            existing_rfnd = db.execute(
                select(PaymentRefund).where(PaymentRefund.razorpay_refund_id == rfnd_id)
            ).scalar_one_or_none()
            if not existing_rfnd:
                rfnd = PaymentRefund(
                    id=new_id(),
                    organization_id=rec.organization_id,
                    payment_id=rec.id,
                    razorpay_payment_id=pay_id,
                    razorpay_refund_id=rfnd_id,
                    invoice_id=rec.invoice_id,
                    amount=amount_inr,
                    currency="INR",
                    refund_date=date.today(),
                    reason="Refund processed via Razorpay Webhook",
                    status="processed",
                )
                db.add(rfnd)
                rec.refund_amount = rec.refund_amount + amount_inr
                rec.payment_status = "refunded" if rec.refund_amount >= rec.amount else "partially_refunded"

    elif event_type == "settlement.processed":
        setl_entity = entity_payload.get("settlement", {}).get("entity", {})
        setl_id = setl_entity.get("id")
        if setl_id:
            gross = Decimal(str(setl_entity.get("amount", 0))) / Decimal("100")
            fee = Decimal(str(setl_entity.get("fees", 0))) / Decimal("100")
            tax = Decimal(str(setl_entity.get("tax", 0))) / Decimal("100")
            net = gross - fee - tax
            existing_setl = db.execute(
                select(SettlementRecord).where(SettlementRecord.settlement_id == setl_id)
            ).scalar_one_or_none()
            if not existing_setl:
                s_rec = SettlementRecord(
                    id=new_id(),
                    organization_id=evt_record.organization_id,
                    settlement_id=setl_id,
                    settlement_date=date.today(),
                    gross_amount=gross,
                    fee_amount=fee,
                    tax_amount=tax,
                    net_amount=net,
                    bank_reference=setl_entity.get("utr"),
                    status="processed",
                )
                db.add(s_rec)

    db.commit()
    return {"status": "ok", "event_id": event_id}


# --------------------------------------------------------------------------- #
# Refunds Module
# --------------------------------------------------------------------------- #
@router.post("/refund")
def create_refund(
    payload: RefundRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Initiates a partial or full refund for a captured payment,

    adjusts invoice balance and posts revenue adjustment ledger entry.
    """
    org_id = user.organization_id
    payment = db.execute(
        select(PaymentRecord).where(
            PaymentRecord.id == payload.payment_id,
            PaymentRecord.organization_id == org_id,
        )
    ).scalar_one_or_none()

    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment record not found")

    refundable = payment.amount - payment.refund_amount
    if payload.amount <= 0 or payload.amount > refundable:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Refund amount ({payload.amount}) exceeds remaining refundable balance ({refundable})",
        )

    service = get_razorpay_service()
    refund_res = service.initiate_refund(
        payment_id=payment.razorpay_payment_id,
        amount_inr=payload.amount,
        notes={"reason": payload.reason, "org_id": org_id, "payment_id": payment.id},
        speed=payload.speed,
    )

    rfnd_id = refund_res.get("id") or f"rfnd_{new_id()[:10]}"
    rfnd_date = date.today()

    refund_record = PaymentRefund(
        id=new_id(),
        organization_id=org_id,
        payment_id=payment.id,
        razorpay_payment_id=payment.razorpay_payment_id,
        razorpay_refund_id=rfnd_id,
        invoice_id=payment.invoice_id,
        amount=money(payload.amount),
        currency="INR",
        refund_date=rfnd_date,
        reason=payload.reason,
        status="processed",
        speed=payload.speed,
        created_by=user.id,
    )
    db.add(refund_record)

    # Update Payment status
    payment.refund_amount = money(payment.refund_amount + payload.amount)
    if payment.refund_amount >= payment.amount:
        payment.payment_status = "refunded"
    else:
        payment.payment_status = "partially_refunded"

    # Update linked Invoice if present
    if payment.invoice_id:
        invoice = db.get(Invoice, payment.invoice_id)
        if invoice:
            invoice.amount_paid = money(max(Decimal("0"), invoice.amount_paid - payload.amount))
            _refresh_invoice_status(invoice)

    # Post Accounting Entry: Debit Sales (Revenue Adjustment), Credit Bank Account
    bank_account = db.execute(
        select(BankAccount).where(BankAccount.organization_id == org_id).order_by(BankAccount.created_at.asc())
    ).scalars().first()

    if bank_account:
        sales_account = get_account_by_code(db, org_id, "4000")  # Sales / Revenue
        desc = f"Refund {rfnd_id} for Payment {payment.razorpay_payment_id}"
        entry = ledger.post_entry(
            db,
            org_id,
            rfnd_date,
            [
                (sales_account.id, payload.amount, Decimal("0"), desc, payment.customer_id),
                (bank_account.ledger_account_id, Decimal("0"), payload.amount, desc, payment.customer_id),
            ],
            "refund",
            refund_record.id,
            reference=rfnd_id,
            created_by=user.id,
        )
        bank.record_movement(
            db,
            bank_account,
            rfnd_date,
            "withdrawal",
            payload.amount,
            desc,
            "refund",
            refund_record.id,
            user.id,
            rfnd_id,
            sales_account.id,
            entry.id,
        )

    # Record in Transaction Ledger
    _record_financial_txn(
        db,
        org_id,
        txn_type="refund",
        ref_type="refund",
        ref_id=refund_record.id,
        debit=Decimal("0"),
        credit=payload.amount,
        amount=payload.amount,
        account="Sales Returns / Refunds",
        txn_date=rfnd_date,
        description=f"Refund {rfnd_id} - {payload.reason}",
        user_id=user.id,
    )

    db.commit()

    return {
        "success": True,
        "message": "Refund processed successfully",
        "refund_id": refund_record.id,
        "razorpay_refund_id": rfnd_id,
        "refund_amount": float(refund_record.amount),
        "payment_status": payment.payment_status,
        "remaining_refundable": float(payment.amount - payment.refund_amount),
    }


@router.get("/refunds")
def list_refunds(
    payment_id: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(PaymentRefund)
        .where(PaymentRefund.organization_id == user.organization_id)
        .options(selectinload(PaymentRefund.payment), selectinload(PaymentRefund.invoice))
        .order_by(PaymentRefund.created_at.desc())
    )
    if payment_id:
        stmt = stmt.where(PaymentRefund.payment_id == payment_id)

    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [
            {
                "id": r.id,
                "payment_id": r.payment_id,
                "razorpay_payment_id": r.razorpay_payment_id,
                "razorpay_refund_id": r.razorpay_refund_id,
                "invoice_id": r.invoice_id,
                "amount": float(r.amount),
                "currency": r.currency,
                "refund_date": r.refund_date.isoformat(),
                "reason": r.reason,
                "status": r.status,
                "speed": r.speed,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


# --------------------------------------------------------------------------- #
# Payments List Endpoint
# --------------------------------------------------------------------------- #
def _payment_row(p: PaymentRecord) -> Dict[str, Any]:
    """Row shape shared by the transactions table and the detail view."""
    category = p.category or "uncategorized"
    return {
        "id": p.id,
        "razorpay_order_id": p.razorpay_order_id,
        "razorpay_payment_id": p.razorpay_payment_id,
        "razorpay_invoice_id": p.razorpay_invoice_id,
        "customer_id": p.customer_id,
        "customer_name": (p.customer.display_name if p.customer else None) or p.customer_name,
        "customer_email": p.customer_email,
        "customer_contact": p.customer_contact,
        "invoice_id": p.invoice_id,
        "invoice_number": p.invoice.invoice_number if p.invoice else None,
        "description": p.description,
        "amount": float(p.amount),
        "currency": p.currency,
        "payment_method": p.payment_method,
        "method_detail": p.method_detail,
        "payment_status": p.payment_status,
        "mode": p.mode,
        "source": p.source,
        "transaction_date": p.transaction_date.isoformat() if p.transaction_date else None,
        "captured_at": p.captured_at.isoformat() if p.captured_at else None,
        "refund_amount": float(p.refund_amount),
        "razorpay_fee": float(p.razorpay_fee),
        "tax_on_fee": float(p.tax_on_fee),
        "net_settlement": float(p.net_settlement),
        "net_amount": float(p.net_amount),
        "category": category,
        "category_label": CATEGORIES.get(category, {}).get("label", category),
        "category_source": p.category_source,
        "category_confidence": float(p.category_confidence) if p.category_confidence is not None else None,
        "category_status": p.category_status,
        "ledger_account_id": p.ledger_account_id,
        "reconciliation_status": p.reconciliation_status,
        "invoice_match_confidence": float(p.invoice_match_confidence) if p.invoice_match_confidence is not None else None,
        "error_code": p.error_code,
        "error_description": p.error_description,
        "last_synced_at": p.last_synced_at.isoformat() if p.last_synced_at else None,
        "created_at": p.created_at.isoformat(),
    }


@router.get("/payments")
def list_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    method: Optional[str] = None,
    customer_id: Optional[str] = None,
    category: Optional[str] = None,
    reconciliation_status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    amount_min: Optional[Decimal] = None,
    amount_max: Optional[Decimal] = None,
    search: Optional[str] = Query(None, max_length=120),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Razorpay transactions for the accounting table, with the full filter set."""
    stmt = (
        select(PaymentRecord)
        .where(PaymentRecord.organization_id == user.organization_id)
        .options(selectinload(PaymentRecord.customer), selectinload(PaymentRecord.invoice))
        .order_by(
            func.coalesce(PaymentRecord.transaction_date, func.date(PaymentRecord.created_at)).desc(),
            PaymentRecord.created_at.desc(),
        )
    )
    if status_filter:
        stmt = stmt.where(PaymentRecord.payment_status == status_filter)
    if method:
        stmt = stmt.where(PaymentRecord.payment_method == method)
    if customer_id:
        stmt = stmt.where(PaymentRecord.customer_id == customer_id)
    if category:
        stmt = stmt.where(PaymentRecord.category == category)
    if reconciliation_status:
        stmt = stmt.where(PaymentRecord.reconciliation_status == reconciliation_status)
    if date_from:
        stmt = stmt.where(
            func.coalesce(PaymentRecord.transaction_date, func.date(PaymentRecord.created_at)) >= date_from
        )
    if date_to:
        stmt = stmt.where(
            func.coalesce(PaymentRecord.transaction_date, func.date(PaymentRecord.created_at)) <= date_to
        )
    if amount_min is not None:
        stmt = stmt.where(PaymentRecord.amount >= amount_min)
    if amount_max is not None:
        stmt = stmt.where(PaymentRecord.amount <= amount_max)
    if search:
        # Escape the LIKE wildcards so a search for "100%" is a literal search.
        needle = search.strip().replace("\\", "\\\\").replace("%", "\%").replace("_", "\_")
        pattern = f"%{needle}%"
        stmt = stmt.where(
            PaymentRecord.razorpay_payment_id.ilike(pattern, escape="\\")
            | PaymentRecord.razorpay_order_id.ilike(pattern, escape="\\")
            | PaymentRecord.description.ilike(pattern, escape="\\")
            | PaymentRecord.customer_name.ilike(pattern, escape="\\")
            | PaymentRecord.customer_email.ilike(pattern, escape="\\")
        )

    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [_payment_row(p) for p in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


# --------------------------------------------------------------------------- #
# Settlements & Reconciliation
# --------------------------------------------------------------------------- #
@router.get("/settlements")
def list_settlements(
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(SettlementRecord)
        .where(SettlementRecord.organization_id == user.organization_id)
        .order_by(SettlementRecord.settlement_date.desc(), SettlementRecord.created_at.desc())
    )
    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [
            {
                "id": s.id,
                "settlement_id": s.settlement_id,
                "settlement_date": s.settlement_date.isoformat(),
                "gross_amount": float(s.gross_amount),
                "fee_amount": float(s.fee_amount),
                "tax_amount": float(s.tax_amount),
                "refunds": float(s.refunds),
                "adjustments": float(s.adjustments),
                "net_amount": float(s.net_amount),
                "status": s.status,
                "bank_reference": s.bank_reference,
                "reconciled": s.reconciled,
                "created_at": s.created_at.isoformat(),
            }
            for s in rows
        ],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.post("/reconcile")
def run_reconciliation(
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Runs three-way comparison between internal customer payments, Razorpay payments,

    and settlements. Flags discrepancies: matched, mismatch, missing_settlement, duplicate.
    """
    org_id = user.organization_id
    today = date.today()

    payments = db.execute(
        select(PaymentRecord).where(PaymentRecord.organization_id == org_id)
    ).scalars().all()

    settlements = db.execute(
        select(SettlementRecord).where(SettlementRecord.organization_id == org_id)
    ).scalars().all()
    settled_map = {s.settlement_id: s for s in settlements if s.settlement_id}

    reconciled_count = 0
    discrepancy_count = 0

    for pay in payments:
        # Check if already reconciled
        existing = db.execute(
            select(ReconciliationRecord).where(
                ReconciliationRecord.razorpay_payment_id == pay.razorpay_payment_id,
                ReconciliationRecord.organization_id == org_id,
            )
        ).scalar_one_or_none()

        rec = existing or ReconciliationRecord(
            id=new_id(),
            organization_id=org_id,
            reconciliation_date=today,
            razorpay_payment_id=pay.razorpay_payment_id,
            internal_payment_id=pay.customer_payment_id,
        )

        # Flag evaluation
        if pay.settlement_id and pay.settlement_id in settled_map:
            setl = settled_map[pay.settlement_id]
            rec.settlement_id = setl.settlement_id
            rec.amount_expected = pay.net_settlement
            rec.amount_actual = setl.net_amount
            rec.difference = abs(rec.amount_expected - rec.amount_actual)
            if rec.difference == Decimal("0"):
                rec.status = "matched"
                rec.discrepancy_note = "Payment matched with settlement"
                rec.resolved = True
            else:
                rec.status = "mismatch"
                rec.discrepancy_note = f"Amount mismatch of ₹{rec.difference} between payment net and settlement"
                discrepancy_count += 1
        else:
            # Check age: if captured > 3 business days ago and no settlement, flag missing_settlement
            age_days = (today - pay.created_at.date()).days if pay.created_at else 0
            if age_days >= 3:
                rec.status = "missing_settlement"
                rec.discrepancy_note = f"Payment captured {age_days} days ago but no settlement received"
                discrepancy_count += 1
            else:
                rec.status = "matched"
                rec.discrepancy_note = "Payment captured; awaiting regular settlement window (T+2)"
                rec.resolved = True

        rec.amount_expected = pay.amount
        rec.amount_actual = pay.amount - pay.refund_amount
        db.add(rec)
        reconciled_count += 1

    db.commit()

    return {
        "success": True,
        "message": "Reconciliation completed",
        "total_evaluated": reconciled_count,
        "discrepancies": discrepancy_count,
    }


@router.get("/reconciliations")
def list_reconciliations(
    status_filter: Optional[str] = Query(None, alias="status"),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(ReconciliationRecord)
        .where(ReconciliationRecord.organization_id == user.organization_id)
        .order_by(ReconciliationRecord.reconciliation_date.desc(), ReconciliationRecord.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(ReconciliationRecord.status == status_filter)

    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [
            {
                "id": r.id,
                "reconciliation_date": r.reconciliation_date.isoformat(),
                "razorpay_payment_id": r.razorpay_payment_id,
                "internal_payment_id": r.internal_payment_id,
                "settlement_id": r.settlement_id,
                "status": r.status,
                "discrepancy_note": r.discrepancy_note,
                "amount_expected": float(r.amount_expected),
                "amount_actual": float(r.amount_actual),
                "difference": float(r.difference),
                "resolved": r.resolved,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


# --------------------------------------------------------------------------- #
# Analytics Endpoint
# --------------------------------------------------------------------------- #
@router.get("/analytics")
def get_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calculates payment success/failure rates, methods breakdown, and metrics."""
    org_id = user.organization_id
    stmt = select(PaymentRecord).where(PaymentRecord.organization_id == org_id)
    if start_date:
        stmt = stmt.where(func.date(PaymentRecord.created_at) >= start_date)
    if end_date:
        stmt = stmt.where(func.date(PaymentRecord.created_at) <= end_date)

    payments = db.execute(stmt).scalars().all()

    total_count = len(payments)
    successful = [p for p in payments if p.payment_status in ("captured", "refunded", "partially_refunded")]
    failed = [p for p in payments if p.payment_status == "failed"]
    refunded = [p for p in payments if p.payment_status in ("refunded", "partially_refunded")]

    total_captured_value = sum(p.amount for p in successful)
    total_refunded_value = sum(p.refund_amount for p in successful)
    total_fee_value = sum(p.razorpay_fee for p in successful)

    success_rate = (len(successful) / total_count * 100) if total_count > 0 else 100.0
    failure_rate = (len(failed) / total_count * 100) if total_count > 0 else 0.0

    # Payment Methods Breakdown
    methods_dict: Dict[str, Dict[str, Any]] = {}
    for p in payments:
        m = p.payment_method or "other"
        if m not in methods_dict:
            methods_dict[m] = {"count": 0, "value": Decimal("0")}
        methods_dict[m]["count"] += 1
        if p.payment_status in ("captured", "refunded", "partially_refunded"):
            methods_dict[m]["value"] += p.amount

    methods_breakdown = [
        {
            "method": k,
            "count": v["count"],
            "value": float(v["value"]),
            "percentage": round(v["count"] / total_count * 100, 1) if total_count > 0 else 0,
        }
        for k, v in methods_dict.items()
    ]

    return {
        "total_payments_count": total_count,
        "successful_count": len(successful),
        "failed_count": len(failed),
        "refunded_count": len(refunded),
        "success_rate": round(success_rate, 2),
        "failure_rate": round(failure_rate, 2),
        "total_captured_value": float(total_captured_value),
        "total_refunded_value": float(total_refunded_value),
        "total_fees_paid": float(total_fee_value),
        "methods_breakdown": methods_breakdown,
    }


# --------------------------------------------------------------------------- #
# Financial Dashboard & Cash Flow Tracker
# --------------------------------------------------------------------------- #
@router.get("/financial-dashboard")
def get_financial_dashboard(
    period: str = Query("this_month", description="today | this_week | this_month | last_month | this_quarter | this_year | all | custom"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[str] = None,
    category: Optional[str] = None,
    payment_method: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Computes high-level financial tracking metrics:

    Total Revenue, Total Expenses, Net Profit, Payment Gateway Fees, Refunds,
    Total Settlements, Cash Flow (In/Out/Net), and period chart series.
    """
    org_id = user.organization_id
    today = date.today()

    # Calculate date range
    if period == "today":
        start, end = today, today
    elif period == "this_week":
        start = today - timedelta(days=today.weekday())
        end = today
    elif period == "this_month":
        start = today.replace(day=1)
        end = today
    elif period == "last_month":
        first_of_this = today.replace(day=1)
        last_month_end = first_of_this - timedelta(days=1)
        start = last_month_end.replace(day=1)
        end = last_month_end
    elif period == "this_quarter":
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_month, day=1)
        end = today
    elif period == "this_year":
        start = today.replace(month=1, day=1)
        end = today
    elif period == "custom" and start_date and end_date:
        start, end = start_date, end_date
    else:
        start = today - timedelta(days=30)
        end = today

    # 1. Gross Revenue from Invoices sent/paid in range
    inv_stmt = select(Invoice).where(
        Invoice.organization_id == org_id,
        Invoice.status.in_(["sent", "partially_paid", "paid"]),
        Invoice.date >= start,
        Invoice.date <= end,
    )
    if customer_id:
        inv_stmt = inv_stmt.where(Invoice.customer_id == customer_id)
    invoices = db.execute(inv_stmt).scalars().all()
    gross_revenue = sum(inv.total for inv in invoices)

    # 2. Total Refunds in range
    rfnd_stmt = select(PaymentRefund).where(
        PaymentRefund.organization_id == org_id,
        PaymentRefund.refund_date >= start,
        PaymentRefund.refund_date <= end,
        PaymentRefund.status == "processed",
    )
    refunds = db.execute(rfnd_stmt).scalars().all()
    total_refunds = sum(r.amount for r in refunds)

    # 3. Operating Expenses & Gateway Fees
    exp_stmt = select(Expense).where(
        Expense.organization_id == org_id,
        Expense.date >= start,
        Expense.date <= end,
    )
    if category:
        exp_stmt = exp_stmt.where(Expense.category == category)
    expenses = db.execute(exp_stmt).scalars().all()

    total_expenses = sum(e.total for e in expenses)
    gateway_fees = sum(e.total for e in expenses if e.category == "Payment Gateway Fees")

    # 4. Net Profit calculation:
    # Net Profit = Gross Revenue - Refunds - Total Expenses (inclusive of Operating + COGS + Fees)
    net_profit = gross_revenue - total_refunds - total_expenses

    # 5. Settlements
    setl_stmt = select(SettlementRecord).where(
        SettlementRecord.organization_id == org_id,
        SettlementRecord.settlement_date >= start,
        SettlementRecord.settlement_date <= end,
    )
    settlements = db.execute(setl_stmt).scalars().all()
    total_settlements = sum(s.net_amount for s in settlements)

    # 6. Cash Flow Analysis
    # Money In: Customer payments received in date range
    pay_stmt = select(CustomerPayment).where(
        CustomerPayment.organization_id == org_id,
        CustomerPayment.date >= start,
        CustomerPayment.date <= end,
    )
    cust_pays = db.execute(pay_stmt).scalars().all()
    money_in = sum(p.amount for p in cust_pays)

    # Money Out: Expenses paid + refunds paid
    money_out = total_expenses + total_refunds
    net_cash_flow = money_in - money_out

    # 7. Time series data for Chart
    # Group by intervals (e.g. daily for up to 31 days, or weekly/monthly)
    days_count = (end - start).days + 1
    chart_data = []

    if days_count <= 31:
        cur = start
        while cur <= end:
            day_invs = sum(inv.total for inv in invoices if inv.date == cur)
            day_exps = sum(e.total for e in expenses if e.date == cur)
            day_rfnds = sum(r.amount for r in refunds if r.refund_date == cur)
            chart_data.append({
                "label": cur.strftime("%b %d"),
                "date": cur.isoformat(),
                "revenue": float(day_invs),
                "expenses": float(day_exps),
                "refunds": float(day_rfnds),
                "profit": float(day_invs - day_exps - day_rfnds),
            })
            cur += timedelta(days=1)
    else:
        # Sample weekly intervals
        cur = start
        while cur <= end:
            next_cur = min(cur + timedelta(days=6), end)
            w_invs = sum(inv.total for inv in invoices if cur <= inv.date <= next_cur)
            w_exps = sum(e.total for e in expenses if cur <= e.date <= next_cur)
            w_rfnds = sum(r.amount for r in refunds if cur <= r.refund_date <= next_cur)
            chart_data.append({
                "label": f"{cur.strftime('%b %d')} - {next_cur.strftime('%b %d')}",
                "date": cur.isoformat(),
                "revenue": float(w_invs),
                "expenses": float(w_exps),
                "refunds": float(w_rfnds),
                "profit": float(w_invs - w_exps - w_rfnds),
            })
            cur = next_cur + timedelta(days=1)

    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "top_cards": {
            "total_revenue": float(gross_revenue),
            "total_expenses": float(total_expenses),
            "net_profit": float(net_profit),
            "payment_gateway_fees": float(gateway_fees),
            "total_refunds": float(total_refunds),
            "total_settlements": float(total_settlements),
        },
        "cash_flow": {
            "money_in": float(money_in),
            "money_out": float(money_out),
            "net_cash_flow": float(net_cash_flow),
        },
        "chart_data": chart_data,
    }


# --------------------------------------------------------------------------- #
# Transaction Ledger Endpoint
# --------------------------------------------------------------------------- #
@router.get("/transactions")
def list_transactions(
    txn_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(FinancialTransactionRecord)
        .where(FinancialTransactionRecord.organization_id == user.organization_id)
        .order_by(FinancialTransactionRecord.date.desc(), FinancialTransactionRecord.created_at.desc())
    )
    if txn_type:
        stmt = stmt.where(FinancialTransactionRecord.transaction_type == txn_type)
    if status_filter:
        stmt = stmt.where(FinancialTransactionRecord.status == status_filter)
    if start_date:
        stmt = stmt.where(FinancialTransactionRecord.date >= start_date)
    if end_date:
        stmt = stmt.where(FinancialTransactionRecord.date <= end_date)

    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [
            {
                "id": t.id,
                "transaction_id": t.transaction_id,
                "transaction_type": t.transaction_type,
                "reference_type": t.reference_type,
                "reference_id": t.reference_id,
                "debit": float(t.debit),
                "credit": float(t.credit),
                "amount": float(t.amount),
                "account": t.account,
                "date": t.date.isoformat(),
                "description": t.description,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
            }
            for t in rows
        ],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


# --------------------------------------------------------------------------- #
# CSV Reports Export
# --------------------------------------------------------------------------- #
@router.get("/reports/export")
def export_reports(
    report_type: str = Query("payments", description="payments | expenses | revenue | refunds | settlements | pnl | cashflow"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports structured financial reports in CSV format."""
    org_id = user.organization_id
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "payments":
        writer.writerow([
            "Payment ID", "Order ID", "Date", "Customer", "Invoice #", "Amount (INR)",
            "Method", "Status", "Gateway Fee", "GST on Fee", "Net Settlement", "Mode"
        ])
        stmt = select(PaymentRecord).where(PaymentRecord.organization_id == org_id).options(
            selectinload(PaymentRecord.customer), selectinload(PaymentRecord.invoice)
        ).order_by(PaymentRecord.created_at.desc())
        if start_date:
            stmt = stmt.where(func.date(PaymentRecord.created_at) >= start_date)
        if end_date:
            stmt = stmt.where(func.date(PaymentRecord.created_at) <= end_date)
        for p in db.execute(stmt).scalars().all():
            writer.writerow([
                p.razorpay_payment_id,
                p.razorpay_order_id or "",
                p.created_at.strftime("%Y-%m-%d %H:%M"),
                p.customer.display_name if p.customer else "",
                p.invoice.invoice_number if p.invoice else "",
                f"{p.amount:.2f}",
                p.payment_method.upper(),
                p.payment_status.upper(),
                f"{p.razorpay_fee:.2f}",
                f"{p.tax_on_fee:.2f}",
                f"{p.net_settlement:.2f}",
                p.mode.upper(),
            ])

    elif report_type == "expenses":
        writer.writerow([
            "Expense #", "Date", "Category", "Account", "Paid Through", "Amount",
            "Tax", "Total", "Payment Method", "Status", "Reference"
        ])
        stmt = select(Expense).where(Expense.organization_id == org_id).options(
            selectinload(Expense.account), selectinload(Expense.paid_through)
        ).order_by(Expense.date.desc())
        if start_date:
            stmt = stmt.where(Expense.date >= start_date)
        if end_date:
            stmt = stmt.where(Expense.date <= end_date)
        for e in db.execute(stmt).scalars().all():
            writer.writerow([
                e.expense_number,
                e.date.isoformat(),
                e.category,
                e.account.name,
                e.paid_through.name,
                f"{e.amount:.2f}",
                f"{e.tax_amount:.2f}",
                f"{e.total:.2f}",
                e.payment_method,
                e.status,
                e.reference or "",
            ])

    elif report_type == "refunds":
        writer.writerow([
            "Refund ID", "Payment ID", "Date", "Amount", "Reason", "Status", "Speed"
        ])
        stmt = select(PaymentRefund).where(PaymentRefund.organization_id == org_id).order_by(PaymentRefund.refund_date.desc())
        for r in db.execute(stmt).scalars().all():
            writer.writerow([
                r.razorpay_refund_id,
                r.razorpay_payment_id,
                r.refund_date.isoformat(),
                f"{r.amount:.2f}",
                r.reason,
                r.status,
                r.speed,
            ])

    elif report_type == "settlements":
        writer.writerow([
            "Settlement ID", "Date", "Gross Amount", "Fees", "Tax", "Net Amount", "Bank UTR", "Status"
        ])
        stmt = select(SettlementRecord).where(SettlementRecord.organization_id == org_id).order_by(SettlementRecord.settlement_date.desc())
        for s in db.execute(stmt).scalars().all():
            writer.writerow([
                s.settlement_id,
                s.settlement_date.isoformat(),
                f"{s.gross_amount:.2f}",
                f"{s.fee_amount:.2f}",
                f"{s.tax_amount:.2f}",
                f"{s.net_amount:.2f}",
                s.bank_reference or "",
                s.status,
            ])

    else:
        # Default: Transaction Ledger
        writer.writerow([
            "Transaction ID", "Date", "Type", "Account", "Debit", "Credit", "Amount", "Status", "Description"
        ])
        stmt = select(FinancialTransactionRecord).where(FinancialTransactionRecord.organization_id == org_id).order_by(FinancialTransactionRecord.date.desc())
        for t in db.execute(stmt).scalars().all():
            writer.writerow([
                t.transaction_id,
                t.date.isoformat(),
                t.transaction_type,
                t.account,
                f"{t.debit:.2f}",
                f"{t.credit:.2f}",
                f"{t.amount:.2f}",
                t.status,
                t.description,
            ])

    output.seek(0)
    filename = f"{report_type}_report_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# --------------------------------------------------------------------------- #
# Integration status & transaction synchronisation
#
# Every endpoint below requires an authenticated user and is scoped to that
# user's organisation. Nothing here ever returns the Razorpay secret.
# --------------------------------------------------------------------------- #
class SyncRequest(BaseModel):
    full: bool = Field(default=False, description="Re-import the full history window instead of only new records")


class CategoryUpdateRequest(BaseModel):
    category: str = Field(min_length=1, max_length=60)
    accept_suggestion: bool = False


class MatchInvoiceRequest(BaseModel):
    invoice_id: str
    confirm: bool = Field(default=True, description="Set false to preview without booking anything")


class ReconciliationUpdateRequest(BaseModel):
    status: str = Field(description="matched | unmatched | partially_matched | needs_review | ignored")
    note: Optional[str] = Field(default=None, max_length=500)


class CategoryRuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    match_type: str
    match_value: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=60)
    ledger_account_id: Optional[str] = None
    priority: int = Field(default=100, ge=1, le=9999)
    is_active: bool = True


def _sync_log_row(log: RazorpaySyncLog) -> Dict[str, Any]:
    return {
        "id": log.id,
        "sync_type": log.sync_type,
        "status": log.status,
        "started_at": log.started_at.isoformat(),
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": log.duration_seconds,
        "window_from": log.window_from.isoformat() if log.window_from else None,
        "window_to": log.window_to.isoformat() if log.window_to else None,
        "records_fetched": log.records_fetched,
        "records_created": log.records_created,
        "records_updated": log.records_updated,
        "records_skipped": log.records_skipped,
        "records_failed": log.records_failed,
        "refunds_synced": log.refunds_synced,
        "pages_fetched": log.pages_fetched,
        "mode": log.mode,
        "error_message": log.error_message,
        "triggered_by": log.triggered_by,
    }


@router.get("/integration/status")
def integration_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connection state for Settings -> Integrations -> Razorpay."""
    service = get_razorpay_service()
    settings = service.settings
    org_id = user.organization_id

    status_payload = service.get_status()
    last_success = razorpay_sync.last_successful_sync(db, org_id)
    last_run = db.execute(
        select(RazorpaySyncLog)
        .where(RazorpaySyncLog.organization_id == org_id)
        .order_by(RazorpaySyncLog.started_at.desc())
        .limit(1)
    ).scalars().first()

    imported = db.execute(
        select(func.count()).select_from(PaymentRecord).where(PaymentRecord.organization_id == org_id)
    ).scalar_one()

    return {
        **status_payload,
        "auto_sync_enabled": settings.razorpay_sync_enabled,
        "sync_interval_minutes": settings.razorpay_sync_interval_minutes,
        "initial_import_days": settings.razorpay_sync_initial_days,
        "webhook_path": "/api/razorpay/webhook",
        "transactions_imported": imported,
        "ever_synced": last_success is not None,
        "last_successful_sync": _sync_log_row(last_success) if last_success else None,
        "last_sync": _sync_log_row(last_run) if last_run else None,
    }


class ConnectRazorpayRequest(BaseModel):
    key_id: str
    key_secret: str
    webhook_secret: Optional[str] = None
    mode: Optional[str] = "test"


@router.post("/integration/connect")
def connect_razorpay(
    payload: ConnectRazorpayRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Save Razorpay credentials, verify live connectivity, and update configuration."""
    key_id = payload.key_id.strip()
    key_secret = payload.key_secret.strip()
    webhook_secret = (payload.webhook_secret or "").strip() or "rooman_books_webhook_secret_2026"
    mode = "live" if (payload.mode or "").lower().strip() == "live" else "test"

    if not key_id or not key_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Both Key ID and Key Secret are required.")

    # 1. Test credentials with Razorpay API
    import razorpay
    from razorpay.errors import BadRequestError
    test_client = razorpay.Client(auth=(key_id, key_secret))
    reachable = False
    warning_error = None
    try:
        test_client.payment.all({"count": 1})
        reachable = True
    except BadRequestError as exc:
        warning_error = f"Razorpay rejected credentials: {exc}"
    except Exception as exc:
        warning_error = f"Could not reach Razorpay API: {exc}"

    # 2. Update .env file on disk
    from pathlib import Path
    from backend.config import get_settings
    from backend.services.razorpay_service import reset_razorpay_service

    env_path = Path(".env")
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updates = {
        "RAZORPAY_KEY_ID": key_id,
        "RAZORPAY_KEY_SECRET": key_secret,
        "RAZORPAY_WEBHOOK_SECRET": webhook_secret,
        "RAZORPAY_MODE": mode,
    }
    updated_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            k, _, _ = line.partition("=")
            k_clean = k.strip()
            if k_clean in updates:
                new_lines.append(f"{k_clean}={updates[k_clean]}")
                updated_keys.add(k_clean)
                continue
        new_lines.append(line)

    for k, v in updates.items():
        if k not in updated_keys:
            new_lines.append(f"{k}={v}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

    # 3. Reload settings and reset service instance
    get_settings.cache_clear()
    reset_razorpay_service()

    service = get_razorpay_service()
    status_payload = service.get_status()

    audit.record(
        db, user, "update", "integration", "razorpay",
        f"Configured Razorpay credentials (mode={mode}, key_id={service.settings.razorpay_key_id_masked})"
    )
    db.commit()

    if not reachable and mode == "live":
        return {
            "success": False,
            "connected": False,
            "reachable": False,
            "message": f"Credentials saved, but Razorpay live connection failed: {warning_error}. Please check Key ID and Secret in Razorpay Dashboard.",
            "status": status_payload,
        }

    return {
        "success": True,
        "connected": True,
        "reachable": reachable,
        "message": "Razorpay successfully connected (Live API Verified)!" if reachable else "Razorpay credentials saved and connected (Test sandbox active).",
        "status": status_payload,
    }


@router.post("/integration/disconnect")
def disconnect_razorpay(
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Clear Razorpay credentials from .env and deactivate connection."""
    from pathlib import Path
    from backend.config import get_settings
    from backend.services.razorpay_service import reset_razorpay_service

    env_path = Path(".env")
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updates = {
        "RAZORPAY_KEY_ID": "",
        "RAZORPAY_KEY_SECRET": "",
    }
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            k, _, _ = line.partition("=")
            k_clean = k.strip()
            if k_clean in updates:
                new_lines.append(f"{k_clean}=")
                continue
        new_lines.append(line)

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    get_settings.cache_clear()
    reset_razorpay_service()

    audit.record(db, user, "delete", "integration", "razorpay", "Disconnected Razorpay credentials")
    db.commit()

    service = get_razorpay_service()
    return {"success": True, "connected": False, "message": "Razorpay disconnected successfully.", "status": service.get_status()}


@router.post("/sync")
def run_sync(
    payload: Optional[SyncRequest] = None,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Import new Razorpay transactions. Safe to run repeatedly and concurrently.

    Returns the sync log for the run, including how many records were created,
    updated and skipped as already present.
    """
    full = bool(payload and payload.full)
    log = razorpay_sync.sync_organization(
        db,
        user.organization_id,
        full=full,
        sync_type="manual",
        user_id=user.id,
    )
    row = _sync_log_row(log)
    if log.status == "failed":
        # A failure is reported as data, not as a 500: the UI shows the reason
        # from the sync log rather than a generic error.
        return {"success": False, "message": log.error_message or "Synchronisation failed", "sync": row}
    return {
        "success": True,
        "message": (
            f"{log.records_created} transactions imported, "
            f"{log.records_updated} updated, "
            f"{log.records_skipped} skipped because they already exist"
        ),
        "sync": row,
    }


@router.get("/sync/logs")
def list_sync_logs(
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(RazorpaySyncLog)
        .where(RazorpaySyncLog.organization_id == user.organization_id)
        .order_by(RazorpaySyncLog.started_at.desc())
    )
    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [_sync_log_row(log) for log in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.get("/sync/logs/{log_id}")
def get_sync_log(
    log_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.get(RazorpaySyncLog, log_id)
    if log is None or log.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sync log not found")
    return _sync_log_row(log)


# --------------------------------------------------------------------------- #
# Overview, transaction detail, categorisation and invoice matching
# --------------------------------------------------------------------------- #
@router.get("/overview")
def payments_overview(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dashboard figures, computed from the transaction table -- never hardcoded."""
    org_id = user.organization_id
    effective_date = func.coalesce(PaymentRecord.transaction_date, func.date(PaymentRecord.created_at))

    def scoped(*conditions):
        stmt = select(
            func.count(PaymentRecord.id),
            func.coalesce(func.sum(PaymentRecord.amount), 0),
            func.coalesce(func.sum(PaymentRecord.razorpay_fee + PaymentRecord.tax_on_fee), 0),
            func.coalesce(func.sum(PaymentRecord.refund_amount), 0),
        ).where(PaymentRecord.organization_id == org_id, *conditions)
        if date_from is not None:
            stmt = stmt.where(effective_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(effective_date <= date_to)
        count, gross, fees, refunds = db.execute(stmt).one()
        return {
            "count": int(count or 0),
            "amount": float(gross or 0),
            "fees": float(fees or 0),
            "refunds": float(refunds or 0),
        }

    captured_statuses = ("captured", "refunded", "partially_refunded")
    total = scoped()
    successful = scoped(PaymentRecord.payment_status.in_(captured_statuses))
    failed = scoped(PaymentRecord.payment_status == "failed")

    today = date.today()
    month_start = today.replace(day=1)
    today_stmt = select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
        PaymentRecord.organization_id == org_id,
        PaymentRecord.payment_status.in_(captured_statuses),
        effective_date == today,
    )
    month_stmt = select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
        PaymentRecord.organization_id == org_id,
        PaymentRecord.payment_status.in_(captured_statuses),
        effective_date >= month_start,
    )

    by_status = {
        row[0]: {"count": int(row[1]), "amount": float(row[2] or 0)}
        for row in db.execute(
            select(PaymentRecord.payment_status, func.count(PaymentRecord.id), func.sum(PaymentRecord.amount))
            .where(PaymentRecord.organization_id == org_id)
            .group_by(PaymentRecord.payment_status)
        ).all()
    }
    by_method = [
        {"method": row[0] or "other", "count": int(row[1]), "amount": float(row[2] or 0)}
        for row in db.execute(
            select(PaymentRecord.payment_method, func.count(PaymentRecord.id), func.sum(PaymentRecord.amount))
            .where(
                PaymentRecord.organization_id == org_id,
                PaymentRecord.payment_status.in_(captured_statuses),
            )
            .group_by(PaymentRecord.payment_method)
            .order_by(func.sum(PaymentRecord.amount).desc())
        ).all()
    ]
    by_reconciliation = {
        row[0]: int(row[1])
        for row in db.execute(
            select(PaymentRecord.reconciliation_status, func.count(PaymentRecord.id))
            .where(PaymentRecord.organization_id == org_id)
            .group_by(PaymentRecord.reconciliation_status)
        ).all()
    }

    gateway_fees = successful["fees"]
    refunds_total = successful["refunds"]
    return {
        "total_payments": total["amount"],
        "total_payments_count": total["count"],
        "successful_payments": successful["amount"],
        "successful_count": successful["count"],
        "failed_payments": failed["amount"],
        "failed_count": failed["count"],
        "refunds": refunds_total,
        "gateway_fees": gateway_fees,
        "net_revenue": successful["amount"] - refunds_total - gateway_fees,
        "todays_payments": float(db.execute(today_stmt).scalar_one() or 0),
        "this_month_payments": float(db.execute(month_stmt).scalar_one() or 0),
        "by_status": by_status,
        "by_method": by_method,
        "by_reconciliation": by_reconciliation,
    }


@router.get("/payments/{payment_id}")
def get_payment_detail(
    payment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full transaction detail, including the Razorpay reference kept for audit."""
    payment = db.get(PaymentRecord, payment_id)
    if payment is None or payment.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")

    refunds = db.execute(
        select(PaymentRefund)
        .where(PaymentRefund.payment_id == payment.id)
        .order_by(PaymentRefund.refund_date.desc())
    ).scalars().all()

    entries: List[Dict[str, Any]] = []
    if payment.customer_payment_id:
        for entry in db.execute(
            select(JournalEntry)
            .where(
                JournalEntry.organization_id == payment.organization_id,
                JournalEntry.source_type == "customer_payment",
                JournalEntry.source_id == payment.customer_payment_id,
            )
            .options(selectinload(JournalEntry.lines))
        ).scalars().all():
            entries.append(
                {
                    "id": entry.id,
                    "entry_number": entry.entry_number,
                    "date": entry.date.isoformat(),
                    "total": float(entry.total),
                    "lines": [
                        {
                            "account_id": line.account_id,
                            "description": line.description,
                            "debit": float(line.debit),
                            "credit": float(line.credit),
                        }
                        for line in entry.lines
                    ],
                }
            )

    raw: Optional[Dict[str, Any]] = None
    if payment.raw_reference:
        try:
            raw = json.loads(payment.raw_reference)
        except (TypeError, ValueError):
            raw = None

    ledger_account = db.get(Account, payment.ledger_account_id) if payment.ledger_account_id else None

    return {
        **_payment_row(payment),
        "ledger_account_name": ledger_account.name if ledger_account else None,
        "ledger_account_code": ledger_account.code if ledger_account else None,
        "refunds": [
            {
                "id": refund.id,
                "razorpay_refund_id": refund.razorpay_refund_id,
                "amount": float(refund.amount),
                "refund_date": refund.refund_date.isoformat(),
                "status": refund.status,
                "speed": refund.speed,
                "reason": refund.reason,
            }
            for refund in refunds
        ],
        "accounting_entries": entries,
        "raw_reference": raw,
    }


@router.get("/categories")
def list_categories(user: User = Depends(get_current_user)):
    """The categories a transaction can be assigned to."""
    return {
        "items": [
            {"value": value, "label": meta["label"], "account_code": meta["code"] or None}
            for value, meta in CATEGORIES.items()
        ],
        "match_types": list(MATCH_TYPES),
    }


@router.post("/payments/{payment_id}/category")
def set_payment_category(
    payment_id: str,
    payload: CategoryUpdateRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Accept the suggested category, or replace it with a manual choice."""
    payment = db.get(PaymentRecord, payment_id)
    if payment is None or payment.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    if payload.category not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown category: {payload.category}")

    if payload.accept_suggestion and payment.category == payload.category:
        # Accepting keeps the machine confidence figure for the audit trail.
        payment.category_status = "accepted"
    else:
        payment.category = payload.category
        payment.category_source = "manual"
        payment.category_confidence = Decimal("1.000")
        payment.category_status = "accepted"

    code = CATEGORIES[payload.category]["code"]
    if code:
        try:
            payment.ledger_account_id = get_account_by_code(db, payment.organization_id, code).id
        except HTTPException:
            payment.ledger_account_id = None
    db.commit()
    db.refresh(payment)
    return _payment_row(payment)


@router.get("/payments/{payment_id}/invoice-matches")
def suggest_invoice_matches(
    payment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rank open invoices that could correspond to this payment."""
    payment = db.get(PaymentRecord, payment_id)
    if payment is None or payment.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")

    raw: Optional[Dict[str, Any]] = None
    if payment.raw_reference:
        try:
            raw = json.loads(payment.raw_reference)
        except (TypeError, ValueError):
            raw = None
    return razorpay_matching.find_matches(db, payment, raw).as_dict()


@router.post("/payments/{payment_id}/match-invoice")
def match_payment_to_invoice(
    payment_id: str,
    payload: MatchInvoiceRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Link a payment to an invoice and post the resulting accounting entries.

    Booking only happens on an explicit confirmation, and never twice for the
    same payment.
    """
    org_id = user.organization_id
    payment = db.get(PaymentRecord, payment_id)
    if payment is None or payment.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    if payment.customer_payment_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This transaction is already booked against an invoice")
    if payment.payment_status not in ("captured", "refunded", "partially_refunded"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Only captured payments can be matched (this one is {payment.payment_status})",
        )

    invoice = db.execute(
        select(Invoice).where(Invoice.id == payload.invoice_id, Invoice.organization_id == org_id)
    ).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if invoice.status == "void":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot match a payment to a void invoice")
    if not payload.confirm:
        return {"success": False, "message": "Preview only - nothing was booked", "invoice_id": invoice.id}

    bank_account = razorpay_posting.default_bank_account(db, org_id)
    if bank_account is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No bank account found in organization")

    pay_date = payment.transaction_date or date.today()
    cust_payment = razorpay_posting.book_customer_payment(
        db,
        org_id,
        invoice,
        bank_account,
        money(payment.amount),
        payment.razorpay_payment_id,
        payment.razorpay_order_id,
        payment.payment_method,
        pay_date,
        user.id,
    )
    razorpay_posting.book_gateway_fee(
        db,
        org_id,
        bank_account,
        payment.razorpay_fee,
        payment.tax_on_fee,
        payment.net_settlement,
        payment.razorpay_payment_id,
        invoice.customer_id,
        pay_date,
        user.id,
    )

    payment.invoice_id = invoice.id
    payment.customer_id = invoice.customer_id
    payment.customer_payment_id = cust_payment.id
    payment.reconciliation_status = "matched"
    payment.invoice_match_confidence = Decimal("1.000")
    payment.category = "customer_payment"
    payment.category_source = "manual"
    payment.category_confidence = Decimal("1.000")
    payment.category_status = "accepted"
    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "message": f"Booked against invoice {invoice.invoice_number}",
        "invoice_status": invoice.status,
        "amount_paid": float(invoice.amount_paid),
        "balance_due": float(invoice.balance_due),
        "payment": _payment_row(payment),
    }


@router.post("/payments/{payment_id}/reconciliation")
def set_reconciliation_status(
    payment_id: str,
    payload: ReconciliationUpdateRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Mark a transaction as reviewed, ignored or needing attention."""
    allowed = {"matched", "unmatched", "partially_matched", "needs_review", "ignored"}
    if payload.status not in allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Status must be one of {sorted(allowed)}")

    payment = db.get(PaymentRecord, payment_id)
    if payment is None or payment.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    if payload.status == "matched" and not payment.invoice_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Match the payment to an invoice before marking it reconciled",
        )

    payment.reconciliation_status = payload.status
    if payload.note:
        payment.notes = payload.note[:500]
    db.commit()
    db.refresh(payment)
    return _payment_row(payment)


# --------------------------------------------------------------------------- #
# Categorisation rules
# --------------------------------------------------------------------------- #
def _rule_row(rule: RazorpayCategoryRule) -> Dict[str, Any]:
    return {
        "id": rule.id,
        "name": rule.name,
        "match_type": rule.match_type,
        "match_value": rule.match_value,
        "category": rule.category,
        "category_label": CATEGORIES.get(rule.category, {}).get("label", rule.category),
        "ledger_account_id": rule.ledger_account_id,
        "priority": rule.priority,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat(),
    }


@router.get("/category-rules")
def list_category_rules(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rules = db.execute(
        select(RazorpayCategoryRule)
        .where(RazorpayCategoryRule.organization_id == user.organization_id)
        .order_by(RazorpayCategoryRule.priority.asc(), RazorpayCategoryRule.created_at.asc())
    ).scalars().all()
    return {"items": [_rule_row(rule) for rule in rules], "total": len(rules)}


@router.post("/category-rules", status_code=status.HTTP_201_CREATED)
def create_category_rule(
    payload: CategoryRuleRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    if payload.match_type not in MATCH_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Match type must be one of {list(MATCH_TYPES)}")
    if payload.category not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown category: {payload.category}")
    if payload.ledger_account_id:
        account = db.get(Account, payload.ledger_account_id)
        if account is None or account.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ledger account not found")

    rule = RazorpayCategoryRule(
        id=new_id(),
        organization_id=user.organization_id,
        name=payload.name.strip(),
        match_type=payload.match_type,
        match_value=payload.match_value.strip(),
        category=payload.category,
        ledger_account_id=payload.ledger_account_id,
        priority=payload.priority,
        is_active=payload.is_active,
        created_by=user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_row(rule)


@router.put("/category-rules/{rule_id}")
def update_category_rule(
    rule_id: str,
    payload: CategoryRuleRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    rule = db.get(RazorpayCategoryRule, rule_id)
    if rule is None or rule.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    if payload.match_type not in MATCH_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Match type must be one of {list(MATCH_TYPES)}")
    if payload.category not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown category: {payload.category}")

    rule.name = payload.name.strip()
    rule.match_type = payload.match_type
    rule.match_value = payload.match_value.strip()
    rule.category = payload.category
    rule.ledger_account_id = payload.ledger_account_id
    rule.priority = payload.priority
    rule.is_active = payload.is_active
    db.commit()
    db.refresh(rule)
    return _rule_row(rule)


@router.delete("/category-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category_rule(
    rule_id: str,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    rule = db.get(RazorpayCategoryRule, rule_id)
    if rule is None or rule.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    db.delete(rule)
    db.commit()


@router.post("/category-rules/reapply")
def reapply_category_rules(
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Re-run categorisation over transactions that nobody has decided on yet."""
    payments = db.execute(
        select(PaymentRecord).where(
            PaymentRecord.organization_id == user.organization_id,
            PaymentRecord.category_status != "accepted",
        )
    ).scalars().all()
    changed = 0
    for payment in payments:
        raw: Optional[Dict[str, Any]] = None
        if payment.raw_reference:
            try:
                raw = json.loads(payment.raw_reference)
            except (TypeError, ValueError):
                raw = None
        before = payment.category
        apply_categorisation(payment, categorise(db, payment, raw))
        if payment.category != before:
            changed += 1
    db.commit()
    return {"success": True, "evaluated": len(payments), "recategorised": changed}
