"""Pull Razorpay payments and refunds into Rooman Books.

The sync is deliberately restartable. Every payment is keyed on its Razorpay
payment id, which carries a unique constraint, so a run that dies halfway can be
repeated without creating a second copy of anything. Each run overlaps the
previous window by ``RAZORPAY_SYNC_OVERLAP_MINUTES`` so a payment captured a
moment after the last cursor is still picked up.

Only real Razorpay data is imported. Unlike the checkout helper, nothing in this
module fabricates a transaction when the API is unreachable -- the run is
recorded as failed instead, with the error preserved on the sync log.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models import (
    Organization,
    PaymentRecord,
    PaymentRefund,
    RazorpaySyncLog,
    new_id,
    utcnow,
)
from backend.services import razorpay_matching, razorpay_posting
from backend.services.money import money
from backend.services.razorpay_categorize import apply_categorisation, categorise
from backend.services.razorpay_service import (
    RazorpayNotConfigured,
    RazorpayUnavailable,
    get_razorpay_service,
)

logger = logging.getLogger("roomanbooks.razorpay.sync")

# Razorpay payment.status -> the status stored on PaymentRecord.
_STATUS_MAP = {
    "created": "created",
    "authorized": "authorized",
    "captured": "captured",
    "refunded": "refunded",
    "failed": "failed",
}

# Fields copied out of the Razorpay payload for the audit trail. Everything that
# could identify an instrument beyond its last four digits is deliberately left
# behind: no card number, no CVV, no OTP, no token, no credential of any kind.
_RAW_ALLOWLIST = (
    "id", "entity", "amount", "currency", "status", "order_id", "invoice_id",
    "international", "method", "amount_refunded", "refund_status", "captured",
    "description", "bank", "wallet", "vpa", "email", "contact", "notes", "fee",
    "tax", "error_code", "error_description", "error_source", "error_step",
    "error_reason", "created_at",
)
_CARD_ALLOWLIST = ("last4", "network", "type", "issuer")


def _paise_to_inr(value: Any) -> Decimal:
    return money(Decimal(str(value or 0)) / Decimal("100"))


def _epoch_to_dt(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _sanitise_raw(entity: Dict[str, Any]) -> Dict[str, Any]:
    """Strip the payload down to fields that are safe to keep."""
    clean: Dict[str, Any] = {key: entity.get(key) for key in _RAW_ALLOWLIST if key in entity}
    card = entity.get("card")
    if isinstance(card, dict):
        clean["card"] = {key: card.get(key) for key in _CARD_ALLOWLIST if key in card}
    acquirer = entity.get("acquirer_data")
    if isinstance(acquirer, dict):
        # Reference numbers only -- these are the values printed on a bank statement.
        clean["acquirer_data"] = {
            key: value for key, value in acquirer.items()
            if key in ("rrn", "upi_transaction_id", "bank_transaction_id", "auth_code")
        }
    return clean


def _method_detail(entity: Dict[str, Any]) -> Optional[str]:
    """A short, non-sensitive description of the instrument used."""
    method = (entity.get("method") or "").lower()
    if method == "card":
        card = entity.get("card") or {}
        bits = [card.get("network"), card.get("type")]
        last4 = card.get("last4")
        if last4:
            bits.append(f"****{last4}")
        return " ".join(str(bit) for bit in bits if bit) or None
    if method == "upi":
        vpa = entity.get("vpa")
        return f"UPI {vpa}" if vpa else "UPI"
    if method == "netbanking":
        return f"Netbanking {entity.get('bank')}" if entity.get("bank") else "Netbanking"
    if method == "wallet":
        return f"Wallet {entity.get('wallet')}" if entity.get("wallet") else "Wallet"
    return method or None


class SyncOutcome:
    """Counters for one sync run, mirrored onto the sync log row."""

    def __init__(self) -> None:
        self.fetched = 0
        self.created = 0
        self.updated = 0
        self.skipped = 0
        self.failed = 0
        self.refunds = 0
        self.pages = 0
        self.errors: List[str] = []

    def as_dict(self) -> Dict[str, Any]:
        return {
            "records_fetched": self.fetched,
            "records_created": self.created,
            "records_updated": self.updated,
            "records_skipped": self.skipped,
            "records_failed": self.failed,
            "refunds_synced": self.refunds,
            "pages_fetched": self.pages,
            "errors": self.errors[:20],
        }


def last_successful_sync(db: Session, org_id: str) -> Optional[RazorpaySyncLog]:
    return db.execute(
        select(RazorpaySyncLog)
        .where(
            RazorpaySyncLog.organization_id == org_id,
            RazorpaySyncLog.status.in_(("completed", "partial")),
        )
        .order_by(RazorpaySyncLog.started_at.desc())
        .limit(1)
    ).scalars().first()


def _sync_window(db: Session, org_id: str, full: bool) -> tuple[datetime, datetime, str]:
    """Decide which slice of history this run should ask Razorpay for."""
    settings = get_settings()
    now = datetime.now(UTC)
    previous = last_successful_sync(db, org_id)

    if full or previous is None:
        start = now - timedelta(days=settings.razorpay_sync_initial_days)
        return start, now, "initial"

    cursor = previous.window_to or previous.started_at
    if cursor.tzinfo is None:
        cursor = cursor.replace(tzinfo=UTC)
    # Overlap the previous window so a payment captured just after the cursor
    # is not missed. Duplicates are harmless -- they are deduplicated on id.
    start = cursor - timedelta(minutes=settings.razorpay_sync_overlap_minutes)
    return start, now, "incremental"


def _upsert_payment(
    db: Session,
    org_id: str,
    entity: Dict[str, Any],
    outcome: SyncOutcome,
    user_id: Optional[str],
) -> None:
    """Insert or refresh a single Razorpay payment. Never creates a duplicate."""
    payment_id = entity.get("id")
    if not payment_id:
        outcome.failed += 1
        outcome.errors.append("Payment entity arrived without an id")
        return

    existing = db.execute(
        select(PaymentRecord).where(PaymentRecord.razorpay_payment_id == payment_id)
    ).scalars().first()

    if existing is not None and existing.organization_id != org_id:
        # The same Razorpay account is already imported by another organisation.
        # Importing it again would double-count the money.
        outcome.skipped += 1
        return

    amount = _paise_to_inr(entity.get("amount"))
    fee = _paise_to_inr(entity.get("fee"))
    tax = _paise_to_inr(entity.get("tax"))
    refunded = _paise_to_inr(entity.get("amount_refunded"))
    created_at = _epoch_to_dt(entity.get("created_at"))
    status = _STATUS_MAP.get((entity.get("status") or "").lower(), "created")
    if status == "captured" and refunded > 0:
        status = "refunded" if refunded >= amount else "partially_refunded"

    raw = _sanitise_raw(entity)
    notes = entity.get("notes") if isinstance(entity.get("notes"), dict) else {}
    description = entity.get("description") or (notes.get("description") if notes else None)

    is_new = existing is None
    record = existing or PaymentRecord(
        id=new_id(),
        organization_id=org_id,
        razorpay_payment_id=payment_id,
        source="sync",
    )

    record.razorpay_order_id = entity.get("order_id") or record.razorpay_order_id
    record.razorpay_invoice_id = entity.get("invoice_id") or record.razorpay_invoice_id
    record.amount = amount
    record.currency = (entity.get("currency") or "INR")[:3]
    record.payment_method = (entity.get("method") or "other")[:40]
    record.method_detail = (_method_detail(entity) or "")[:160] or None
    record.payment_status = status
    if is_new:
        # The mode reflects which keys the transaction actually ran under; it
        # must not drift if the org later switches its configured mode and re-syncs.
        record.mode = get_razorpay_service().mode
    record.customer_email = (entity.get("email") or None)
    record.customer_contact = (str(entity.get("contact")) if entity.get("contact") else None)
    record.description = (description or "")[:500] or None
    record.transaction_date = created_at.date() if created_at else record.transaction_date
    record.razorpay_fee = fee
    record.tax_on_fee = tax
    record.net_settlement = money(amount - fee - tax)
    record.refund_amount = refunded
    record.error_code = entity.get("error_code")
    record.error_description = entity.get("error_description")
    record.raw_reference = json.dumps(raw, default=str)[:20000]
    record.last_synced_at = utcnow()
    if created_at and record.captured_at is None and status in ("captured", "refunded", "partially_refunded"):
        # Set once, the first time a sync observes the payment in a captured
        # state - a payment first seen as authorized/pending must still get
        # this stamped once it later transitions to captured.
        record.captured_at = created_at

    # Link to a known customer where the payer can be identified with confidence.
    if not record.customer_id:
        contact = razorpay_posting.find_contact_for_payment(
            db, org_id, record.customer_email, record.customer_contact, notes.get("customer_name") if notes else None
        )
        if contact:
            record.customer_id = contact.id
            record.customer_name = contact.display_name
    if not record.customer_name:
        record.customer_name = (notes.get("customer_name") if notes else None) or record.customer_email

    if is_new:
        db.add(record)

    try:
        db.flush()
    except IntegrityError:
        # A concurrent run inserted the same payment first. That is exactly what
        # the unique constraint is for; treat it as a duplicate and carry on.
        db.rollback()
        outcome.skipped += 1
        return

    # Suggest an invoice, but never mark one paid on a guess.
    if record.payment_status == "captured" and not record.invoice_id:
        result = razorpay_matching.find_matches(db, record, raw)
        best = result.best
        if best:
            record.invoice_match_confidence = best.score
            record.reconciliation_status = "needs_review" if result.ambiguous else "partially_matched"
        else:
            record.reconciliation_status = "unmatched"

    apply_categorisation(record, categorise(db, record, raw))

    if is_new:
        outcome.created += 1
    else:
        outcome.updated += 1


def _sync_refunds(db: Session, org_id: str, from_ts: int, to_ts: int, outcome: SyncOutcome) -> None:
    """Import refunds and attach each one to the payment it reverses."""
    service = get_razorpay_service()
    for page in service.iter_refunds(from_ts=from_ts, to_ts=to_ts):
        for entity in page:
            refund_id = entity.get("id")
            payment_id = entity.get("payment_id")
            if not refund_id or not payment_id:
                continue

            payment = db.execute(
                select(PaymentRecord).where(
                    PaymentRecord.razorpay_payment_id == payment_id,
                    PaymentRecord.organization_id == org_id,
                )
            ).scalars().first()
            if payment is None:
                # The refund's payment is outside this organisation or this window.
                continue

            existing = db.execute(
                select(PaymentRefund).where(PaymentRefund.razorpay_refund_id == refund_id)
            ).scalars().first()
            amount = _paise_to_inr(entity.get("amount"))
            created_at = _epoch_to_dt(entity.get("created_at"))
            refund_date = created_at.date() if created_at else datetime.now(UTC).date()

            if existing is None:
                db.add(
                    PaymentRefund(
                        id=new_id(),
                        organization_id=org_id,
                        payment_id=payment.id,
                        razorpay_payment_id=payment_id,
                        razorpay_refund_id=refund_id,
                        invoice_id=payment.invoice_id,
                        amount=amount,
                        currency=(entity.get("currency") or "INR")[:3],
                        refund_date=refund_date,
                        reason=(entity.get("notes") or {}).get("reason") or "Refund imported from Razorpay",
                        status=(entity.get("status") or "processed")[:30],
                        speed=(entity.get("speed_processed") or entity.get("speed_requested") or "normal")[:20],
                    )
                )
                outcome.refunds += 1
            else:
                existing.status = (entity.get("status") or existing.status)[:30]
                existing.amount = amount

            db.flush()

            # Keep the payment's refund total in step with Razorpay's own view.
            total_refunded = db.execute(
                select(func.coalesce(func.sum(PaymentRefund.amount), 0)).where(
                    PaymentRefund.payment_id == payment.id
                )
            ).scalar_one()
            payment.refund_amount = money(total_refunded)
            if payment.refund_amount > 0:
                payment.payment_status = (
                    "refunded" if payment.refund_amount >= payment.amount else "partially_refunded"
                )


def sync_organization(
    db: Session,
    org_id: str,
    *,
    full: bool = False,
    sync_type: Optional[str] = None,
    user_id: Optional[str] = None,
) -> RazorpaySyncLog:
    """Run one synchronisation for ``org_id`` and return its completed log row.

    The log row is committed whatever happens, so a failure is always visible
    rather than silently swallowed.
    """
    service = get_razorpay_service()
    window_from, window_to, detected_type = _sync_window(db, org_id, full)

    log = RazorpaySyncLog(
        id=new_id(),
        organization_id=org_id,
        sync_type=sync_type or detected_type,
        status="running",
        started_at=utcnow(),
        window_from=window_from,
        window_to=window_to,
        mode=service.mode,
        triggered_by=user_id,
    )
    db.add(log)
    db.commit()

    outcome = SyncOutcome()
    from_ts = int(window_from.timestamp())
    to_ts = int(window_to.timestamp())

    try:
        if not service.is_configured:
            raise RazorpayNotConfigured(
                "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server."
            )

        for page_number, items in service.iter_payments(from_ts=from_ts, to_ts=to_ts):
            outcome.pages = page_number
            outcome.fetched += len(items)
            for entity in items:
                try:
                    _upsert_payment(db, org_id, entity, outcome, user_id)
                except Exception as exc:  # one bad record must not lose the page
                    outcome.failed += 1
                    outcome.errors.append(f"{entity.get('id', 'unknown')}: {exc}")
                    logger.exception("Failed to import Razorpay payment %s", entity.get("id"))
            # Commit page by page so an interruption keeps everything imported so far.
            db.commit()

        try:
            _sync_refunds(db, org_id, from_ts, to_ts, outcome)
            db.commit()
        except RazorpayUnavailable as exc:
            outcome.errors.append(f"Refund sync skipped: {exc}")
            db.rollback()

        log = db.get(RazorpaySyncLog, log.id)
        log.status = "partial" if (outcome.failed or outcome.errors) else "completed"
        log.error_message = "; ".join(outcome.errors[:5]) or None

    except (RazorpayNotConfigured, RazorpayUnavailable) as exc:
        db.rollback()
        log = db.get(RazorpaySyncLog, log.id)
        log.status = "failed"
        log.error_message = str(exc)[:2000]
        logger.warning("Razorpay sync failed for org %s: %s", org_id, exc)
    except Exception as exc:  # pragma: no cover - unexpected failures
        db.rollback()
        log = db.get(RazorpaySyncLog, log.id)
        log.status = "failed"
        log.error_message = f"Unexpected error: {exc}"[:2000]
        logger.exception("Razorpay sync crashed for org %s", org_id)

    log.completed_at = utcnow()
    log.records_fetched = outcome.fetched
    log.records_created = outcome.created
    log.records_updated = outcome.updated
    log.records_skipped = outcome.skipped
    log.records_failed = outcome.failed
    log.refunds_synced = outcome.refunds
    log.pages_fetched = outcome.pages
    db.commit()
    db.refresh(log)
    return log


def organizations_to_sync(db: Session) -> List[str]:
    """Organisations the background loop should sync.

    An organisation opts in by running its first sync from the integrations
    screen. Without that the loop stays idle, so a single set of Razorpay
    credentials is never fanned out across every tenant in the database.
    """
    rows = db.execute(
        select(RazorpaySyncLog.organization_id).distinct()
    ).scalars().all()
    if not rows:
        return []
    valid = db.execute(
        select(Organization.id).where(Organization.id.in_(rows))
    ).scalars().all()
    return list(valid)
