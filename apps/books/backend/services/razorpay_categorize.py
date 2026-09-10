"""Categorisation of synced Razorpay payments.

Rules are applied in a fixed precedence order, exactly as specified for the
Rooman Books banking module:

1. an explicit user rule (``RazorpayCategoryRule``)
2. a confirmed customer / invoice link on the payment
3. keyword matching against the payment description and notes
4. automatic classification from the payment's own attributes
5. otherwise ``uncategorized``, left for a human

Only steps 1 and 2 ever reach full confidence. Everything below that is a
*suggestion*: it is stored with its confidence and a ``suggested`` status, and
no accounting entry is posted from it until somebody accepts it. That is the
whole point of the confidence score -- a low-confidence guess must not silently
turn into a journal entry.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import PaymentRecord, RazorpayCategoryRule
from backend.services.chart_of_accounts import get_account_by_code

# Category -> (display label, default chart-of-accounts code)
CATEGORIES: Dict[str, Dict[str, str]] = {
    "customer_payment": {"label": "Customer Payment", "code": "1100"},    # Accounts Receivable
    "gateway_fee": {"label": "Payment Gateway Charges", "code": "6100"},  # Bank Fees and Charges
    "refund": {"label": "Customer Refund / Sales Return", "code": "4300"},
    "other_income": {"label": "Other Income", "code": "4900"},
    "failed_payment": {"label": "Failed Payment (no entry)", "code": ""},
    "uncategorized": {"label": "Uncategorised", "code": ""},
}

MATCH_TYPES = (
    "description_contains",
    "method_is",
    "email_contains",
    "notes_contains",
    "status_is",
)

# Confidence at or above which a suggestion is considered safe to auto-accept.
AUTO_ACCEPT_CONFIDENCE = Decimal("0.90")

_DESCRIPTION_KEYWORDS: List[Tuple[Tuple[str, ...], str, str]] = [
    (("refund", "reversal", "chargeback", "return"), "refund", "0.75"),
    (("fee", "commission", "gateway charge", "mdr"), "gateway_fee", "0.70"),
    (("invoice", "inv-", "payment for", "bill", "against invoice"), "customer_payment", "0.72"),
    (("subscription", "renewal", "licence", "license"), "customer_payment", "0.65"),
    (("donation", "interest", "misc"), "other_income", "0.60"),
]


@dataclass
class Categorisation:
    category: str
    source: str          # rule | invoice | description | auto | manual
    confidence: Decimal  # 0.000 - 1.000
    ledger_account_id: Optional[str] = None
    reason: str = ""

    @property
    def label(self) -> str:
        return CATEGORIES.get(self.category, {}).get("label", self.category)

    @property
    def is_confident(self) -> bool:
        return self.confidence >= AUTO_ACCEPT_CONFIDENCE


def _haystack(payment: PaymentRecord, raw: Optional[Dict[str, Any]]) -> str:
    parts = [payment.description or "", payment.notes or ""]
    if raw:
        notes = raw.get("notes")
        if isinstance(notes, dict):
            parts.extend(str(value) for value in notes.values())
        parts.append(str(raw.get("description") or ""))
    return " ".join(parts).lower()


def _rule_matches(payment: PaymentRecord, rule: RazorpayCategoryRule, haystack: str) -> bool:
    needle = (rule.match_value or "").strip().lower()
    if not needle:
        return False
    if rule.match_type == "description_contains":
        return needle in (payment.description or "").lower() or needle in haystack
    if rule.match_type == "method_is":
        return needle == (payment.payment_method or "").lower()
    if rule.match_type == "email_contains":
        return needle in (payment.customer_email or "").lower()
    if rule.match_type == "notes_contains":
        return needle in haystack
    if rule.match_type == "status_is":
        return needle == (payment.payment_status or "").lower()
    return False


def _resolve_account(db: Session, organization_id: str, category: str) -> Optional[str]:
    code = CATEGORIES.get(category, {}).get("code") or ""
    if not code:
        return None
    try:
        return get_account_by_code(db, organization_id, code).id
    except Exception:
        # The organisation may have renamed or removed the account. A missing
        # suggestion is better than failing the whole sync over it.
        return None


def categorise(
    db: Session,
    payment: PaymentRecord,
    raw: Optional[Dict[str, Any]] = None,
) -> Categorisation:
    """Return the best category for ``payment`` together with its confidence."""
    org_id = payment.organization_id
    haystack = _haystack(payment, raw)

    # 1. Explicit user rules win outright.
    rules = db.execute(
        select(RazorpayCategoryRule)
        .where(
            RazorpayCategoryRule.organization_id == org_id,
            RazorpayCategoryRule.is_active.is_(True),
        )
        .order_by(RazorpayCategoryRule.priority.asc(), RazorpayCategoryRule.created_at.asc())
    ).scalars().all()
    for rule in rules:
        if _rule_matches(payment, rule, haystack):
            return Categorisation(
                category=rule.category,
                source="rule",
                confidence=Decimal("1.000"),
                ledger_account_id=rule.ledger_account_id or _resolve_account(db, org_id, rule.category),
                reason="Matched rule " + rule.name,
            )

    # A failed payment is never revenue and never gets an entry.
    if payment.payment_status == "failed":
        return Categorisation(
            category="failed_payment",
            source="auto",
            confidence=Decimal("1.000"),
            reason="Payment failed at the gateway",
        )

    # Refunded money is a refund regardless of what it started as.
    if payment.payment_status in ("refunded", "partially_refunded") or (payment.refund_amount or Decimal("0")) > 0:
        return Categorisation(
            category="refund",
            source="auto",
            confidence=Decimal("0.950"),
            ledger_account_id=_resolve_account(db, org_id, "refund"),
            reason="Razorpay reported a refund against this payment",
        )

    # 2. An established customer or invoice link is decisive.
    if payment.invoice_id:
        return Categorisation(
            category="customer_payment",
            source="invoice",
            confidence=Decimal("1.000"),
            ledger_account_id=_resolve_account(db, org_id, "customer_payment"),
            reason="Linked to an invoice in Rooman Books",
        )
    if payment.customer_id:
        return Categorisation(
            category="customer_payment",
            source="invoice",
            confidence=Decimal("0.900"),
            ledger_account_id=_resolve_account(db, org_id, "customer_payment"),
            reason="Matched to a known customer",
        )

    # 3. Description / notes keywords.
    for needles, category, confidence in _DESCRIPTION_KEYWORDS:
        hit = next((needle for needle in needles if needle in haystack), None)
        if hit:
            return Categorisation(
                category=category,
                source="description",
                confidence=Decimal(confidence),
                ledger_account_id=_resolve_account(db, org_id, category),
                reason="Description mentions " + hit,
            )

    # 4. Automatic classification from the payment's own attributes. A captured
    #    payment is money in, but with nothing tying it to a customer we are not
    #    confident enough to book it -- hence the deliberately modest score.
    if payment.payment_status == "captured":
        return Categorisation(
            category="customer_payment",
            source="auto",
            confidence=Decimal("0.550"),
            ledger_account_id=_resolve_account(db, org_id, "customer_payment"),
            reason="Captured payment with no customer or invoice link yet",
        )

    # 5. Nothing conclusive -- leave it to a human.
    return Categorisation(
        category="uncategorized",
        source="auto",
        confidence=Decimal("0.000"),
        reason="No rule, customer, invoice or keyword matched",
    )


def apply_categorisation(payment: PaymentRecord, result: Categorisation) -> None:
    """Write a categorisation onto the payment without overwriting a human choice."""
    if payment.category_source == "manual" or payment.category_status == "accepted":
        return
    payment.category = result.category
    payment.category_source = result.source
    payment.category_confidence = result.confidence
    payment.category_status = "accepted" if result.source in ("rule", "invoice") else "suggested"
    if result.ledger_account_id:
        payment.ledger_account_id = result.ledger_account_id
