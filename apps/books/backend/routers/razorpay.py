"""Razorpay Payments, Webhooks, Refunds, Reconciliation & Financial Hub API Router."""
from __future__ import annotations

import csv
import io
import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import (
    BankAccount,
    CustomerPayment,
    Expense,
    FinancialTransactionRecord,
    Invoice,
    PaymentEvent,
    PaymentRecord,
    PaymentRefund,
    ReconciliationRecord,
    SettlementRecord,
    User,
    new_id,
)
from backend.services import bank, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.numbering import next_number
from backend.services.razorpay_service import get_razorpay_service
from backend.services.tenancy import Pagination, paginate

logger = logging.getLogger("roomanbooks.razorpay")

router = APIRouter(prefix="/api/razorpay", tags=["razorpay"])


def _refresh_invoice_status(inv: Invoice) -> None:
    if inv.status == "void":
        return
    paid = money(inv.amount_paid)
    if paid <= 0:
        inv.status = "overdue" if inv.due_date < date.today() else "sent"
    elif paid >= inv.total:
        inv.status = "paid"
    else:
        inv.status = "partially_paid"


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
    rec = FinancialTransactionRecord(
        id=new_id(),
        organization_id=org_id,
        transaction_id=f"TXN-{new_id()[:8].upper()}",
        transaction_type=txn_type,
        reference_type=ref_type,
        reference_id=ref_id,
        debit=money(debit),
        credit=money(credit),
        amount=money(amount),
        account=account,
        date=txn_date,
        description=description,
        status=status_val,
        created_by=user_id,
    )
    db.add(rec)
    return rec


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

    # 5. Find default bank account for deposit
    bank_account = db.execute(
        select(BankAccount).where(BankAccount.organization_id == org_id).order_by(BankAccount.created_at.asc())
    ).scalars().first()
    if not bank_account:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No bank account found in organization")

    # 6. Create internal CustomerPayment
    payment_number = next_number(db, org_id, "customer_payment")
    pay_date = date.today()
    cust_payment = CustomerPayment(
        id=new_id(),
        organization_id=org_id,
        payment_number=payment_number,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        bank_account_id=bank_account.id,
        date=pay_date,
        amount=money(payload.amount),
        mode="razorpay",
        reference=f"Razorpay: {payload.razorpay_payment_id}",
        notes=f"Razorpay Order: {payload.razorpay_order_id} ({method.upper()})",
        created_by=user.id,
    )
    db.add(cust_payment)
    db.flush()

    # Update Invoice status & amounts
    invoice.amount_paid = money(invoice.amount_paid + cust_payment.amount)
    _refresh_invoice_status(invoice)

    # Post Customer Payment Ledger Entry
    ar_account = get_account_by_code(db, org_id, "1100")  # Accounts Receivable
    pay_desc = f"Razorpay Payment {payment_number} for Invoice {invoice.invoice_number}"
    entry = ledger.post_entry(
        db,
        org_id,
        pay_date,
        [
            (bank_account.ledger_account_id, cust_payment.amount, Decimal("0"), pay_desc, invoice.customer_id),
            (ar_account.id, Decimal("0"), cust_payment.amount, pay_desc, invoice.customer_id),
        ],
        "customer_payment",
        cust_payment.id,
        reference=payload.razorpay_payment_id,
        created_by=user.id,
    )
    bank.record_movement(
        db,
        bank_account,
        pay_date,
        "deposit",
        cust_payment.amount,
        pay_desc,
        "customer_payment",
        cust_payment.id,
        user.id,
        payload.razorpay_payment_id,
        ar_account.id,
        entry.id,
    )

    # 7. Record Gateway Fee as Expense (Separate from revenue)
    if fee_inr > 0:
        bank_fee_account = get_account_by_code(db, org_id, "6100")  # Bank Fees and Charges
        input_gst_account = get_account_by_code(db, org_id, "1300")  # Input GST
        total_fee = fee_inr + tax_on_fee

        expense_number = next_number(db, org_id, "expense")
        fee_expense = Expense(
            id=new_id(),
            organization_id=org_id,
            expense_number=expense_number,
            date=pay_date,
            account_id=bank_fee_account.id,
            paid_through_account_id=bank_account.id,
            vendor_id=None,
            customer_id=invoice.customer_id,
            amount=fee_inr,
            tax_rate=Decimal("18.00") if tax_on_fee > 0 else Decimal("0"),
            tax_amount=tax_on_fee,
            total=total_fee,
            category="Payment Gateway Fees",
            payment_method="razorpay",
            status="paid",
            reference=f"Fee for {payload.razorpay_payment_id}",
            notes=f"Razorpay processing fee (Net settlement: {net_settlement})",
            is_billable=False,
            created_by=user.id,
        )
        db.add(fee_expense)
        db.flush()

        fee_desc = f"Razorpay Gateway Fee: {expense_number}"
        fee_lines = [(bank_fee_account.id, fee_inr, Decimal("0"), fee_desc, None)]
        if tax_on_fee > 0:
            fee_lines.append((input_gst_account.id, tax_on_fee, Decimal("0"), f"GST on {expense_number}", None))
        fee_lines.append((bank_account.ledger_account_id, Decimal("0"), total_fee, fee_desc, None))

        fee_entry = ledger.post_entry(
            db,
            org_id,
            pay_date,
            fee_lines,
            "expense",
            fee_expense.id,
            reference=fee_expense.reference,
            created_by=user.id,
        )
        bank.record_movement(
            db,
            bank_account,
            pay_date,
            "withdrawal",
            total_fee,
            fee_desc,
            "expense",
            fee_expense.id,
            user.id,
            fee_expense.reference,
            bank_fee_account.id,
            fee_entry.id,
        )

        _record_financial_txn(
            db,
            org_id,
            txn_type="gateway_fee",
            ref_type="expense",
            ref_id=fee_expense.id,
            debit=fee_inr,
            credit=Decimal("0"),
            amount=total_fee,
            account=bank_fee_account.name,
            txn_date=pay_date,
            description=f"Gateway Fee for {payload.razorpay_payment_id}",
            user_id=user.id,
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
    )
    db.add(record)

    # 9. Record Financial Transaction (Gross Revenue)
    _record_financial_txn(
        db,
        org_id,
        txn_type="customer_payment",
        ref_type="invoice",
        ref_id=invoice.id,
        debit=money(payload.amount),
        credit=Decimal("0"),
        amount=money(payload.amount),
        account="Cash / Bank (Razorpay)",
        txn_date=pay_date,
        description=f"Customer Payment {payload.razorpay_payment_id} for Invoice {invoice.invoice_number}",
        user_id=user.id,
    )

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
@router.get("/payments")
def list_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    method: Optional[str] = None,
    customer_id: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(PaymentRecord)
        .where(PaymentRecord.organization_id == user.organization_id)
        .options(selectinload(PaymentRecord.customer), selectinload(PaymentRecord.invoice))
        .order_by(PaymentRecord.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(PaymentRecord.payment_status == status_filter)
    if method:
        stmt = stmt.where(PaymentRecord.payment_method == method)
    if customer_id:
        stmt = stmt.where(PaymentRecord.customer_id == customer_id)

    rows, total = paginate(db, stmt, pagination)
    return {
        "items": [
            {
                "id": p.id,
                "razorpay_order_id": p.razorpay_order_id,
                "razorpay_payment_id": p.razorpay_payment_id,
                "customer_id": p.customer_id,
                "customer_name": p.customer.display_name if p.customer else None,
                "invoice_id": p.invoice_id,
                "invoice_number": p.invoice.invoice_number if p.invoice else None,
                "amount": float(p.amount),
                "currency": p.currency,
                "payment_method": p.payment_method,
                "payment_status": p.payment_status,
                "mode": p.mode,
                "captured_at": p.captured_at.isoformat() if p.captured_at else None,
                "refund_amount": float(p.refund_amount),
                "razorpay_fee": float(p.razorpay_fee),
                "tax_on_fee": float(p.tax_on_fee),
                "net_settlement": float(p.net_settlement),
                "created_at": p.created_at.isoformat(),
            }
            for r in rows
            for p in [r]
        ],
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
