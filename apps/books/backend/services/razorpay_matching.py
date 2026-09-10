"""Match Razorpay payments to open Rooman Books invoices.

The matcher only ever *suggests*. A suggestion becomes a payment -- and marks an
invoice paid -- when a person confirms it, or when the evidence is strong enough
that there is nothing to decide: the payment carries the invoice's own id and
the amount agrees to the paisa.

Ambiguity is treated as failure. If two invoices score close to each other the
match is reported as ambiguous and left for a human, because silently paying off
the wrong invoice is far more expensive than asking.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Invoice, PaymentRecord
from backend.services.money import money

# A candidate has to clear this before it is offered as a suggestion at all.
SUGGEST_THRESHOLD = Decimal("0.60")
# ... and this before it is safe to book without asking.
AUTO_MATCH_THRESHOLD = Decimal("0.95")
# The runner-up must be at least this far behind, otherwise the match is ambiguous.
AMBIGUITY_MARGIN = Decimal("0.20")

OPEN_STATUSES = ("sent", "partially_paid", "overdue")


@dataclass
class InvoiceCandidate:
    invoice: Invoice
    score: Decimal
    reasons: List[str]

    def as_dict(self) -> Dict[str, Any]:
        return {
            "invoice_id": self.invoice.id,
            "invoice_number": self.invoice.invoice_number,
            "invoice_date": self.invoice.date.isoformat(),
            "due_date": self.invoice.due_date.isoformat(),
            "customer_id": self.invoice.customer_id,
            "customer_name": self.invoice.customer.display_name if self.invoice.customer else None,
            "total": float(self.invoice.total),
            "balance_due": float(self.invoice.balance_due),
            "status": self.invoice.status,
            "confidence": float(self.score),
            "reasons": self.reasons,
        }


@dataclass
class MatchResult:
    candidates: List[InvoiceCandidate]
    ambiguous: bool
    reason: str

    @property
    def best(self) -> Optional[InvoiceCandidate]:
        return self.candidates[0] if self.candidates else None

    @property
    def can_auto_book(self) -> bool:
        best = self.best
        return bool(best and not self.ambiguous and best.score >= AUTO_MATCH_THRESHOLD)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "ambiguous": self.ambiguous,
            "reason": self.reason,
            "can_auto_book": self.can_auto_book,
            "candidates": [candidate.as_dict() for candidate in self.candidates],
        }


def _referenced_ids(raw: Optional[Dict[str, Any]]) -> List[str]:
    """Invoice identifiers Razorpay carried back to us in notes or the receipt."""
    values: List[str] = []
    if not raw:
        return values
    notes = raw.get("notes")
    if isinstance(notes, dict):
        for key in ("invoice_id", "invoice_number", "invoiceId", "invoice", "receipt", "reference"):
            value = notes.get(key)
            if value:
                values.append(str(value).strip())
    for key in ("receipt", "description", "invoice_id"):
        value = raw.get(key)
        if value:
            values.append(str(value).strip())
    return [value for value in values if value]


def find_matches(
    db: Session,
    payment: PaymentRecord,
    raw: Optional[Dict[str, Any]] = None,
    limit: int = 5,
) -> MatchResult:
    """Score every open invoice against ``payment`` and rank the plausible ones."""
    org_id = payment.organization_id
    amount = money(payment.amount)
    references = [value.lower() for value in _referenced_ids(raw)]
    haystack = " ".join(
        filter(None, [(payment.description or "").lower(), (payment.notes or "").lower(), *references])
    )

    invoices = db.execute(
        select(Invoice)
        .where(Invoice.organization_id == org_id, Invoice.status.in_(OPEN_STATUSES))
        .order_by(Invoice.date.desc())
    ).scalars().all()

    candidates: List[InvoiceCandidate] = []
    for invoice in invoices:
        score = Decimal("0")
        reasons: List[str] = []

        # Razorpay handed us the invoice identity itself -- the strongest signal.
        if invoice.id.lower() in references or invoice.invoice_number.lower() in references:
            score += Decimal("0.55")
            reasons.append(f"Payment notes reference invoice {invoice.invoice_number}")
        elif invoice.invoice_number.lower() in haystack:
            score += Decimal("0.25")
            reasons.append(f"Description mentions {invoice.invoice_number}")

        if payment.customer_id and invoice.customer_id == payment.customer_id:
            score += Decimal("0.30")
            reasons.append("Customer matches")
        elif payment.customer_id:
            # A payment from a known customer cannot belong to a different one.
            continue

        balance = money(invoice.balance_due)
        if amount == balance:
            score += Decimal("0.35")
            reasons.append("Amount equals the outstanding balance")
        elif balance > 0 and abs(amount - balance) <= (balance * Decimal("0.01")):
            score += Decimal("0.15")
            reasons.append("Amount is within 1% of the outstanding balance")
        elif amount == money(invoice.total):
            score += Decimal("0.20")
            reasons.append("Amount equals the invoice total")
        elif amount > balance:
            score -= Decimal("0.15")
            reasons.append("Amount exceeds the outstanding balance")

        if invoice.reference and payment.razorpay_order_id and invoice.reference.lower() == payment.razorpay_order_id.lower():
            score += Decimal("0.20")
            reasons.append("Invoice reference matches the Razorpay order")

        if score >= SUGGEST_THRESHOLD:
            candidates.append(InvoiceCandidate(invoice, min(score, Decimal("1.000")), reasons))

    candidates.sort(key=lambda candidate: candidate.score, reverse=True)
    candidates = candidates[:limit]

    if not candidates:
        return MatchResult([], False, "No open invoice matched this payment")

    ambiguous = (
        len(candidates) > 1
        and (candidates[0].score - candidates[1].score) < AMBIGUITY_MARGIN
    )
    if ambiguous:
        reason = (
            f"{len(candidates)} invoices score within {float(AMBIGUITY_MARGIN)} of each other - "
            "confirm the correct one manually"
        )
    elif candidates[0].score >= AUTO_MATCH_THRESHOLD:
        reason = "Single unambiguous match"
    else:
        reason = "Best match needs confirmation"

    return MatchResult(candidates, ambiguous, reason)
