"""Foreign currency: exchange rates, document conversion and realised gain or loss.

The books are kept in the organization's base currency (normally INR): every
existing money column on an invoice, bill, payment and journal line holds
base-currency amounts, so every report and balance stays correct without
knowing about currencies. A foreign-currency document additionally keeps its
own figures (``fc_*`` columns and line ``fc_rate`` / ``fc_amount``) and the
exchange rate it was booked at (units of base currency per unit of foreign).

A payment settles the foreign balance at its own rate. The bank receives
fc x payment rate, receivables are cleared at fc x invoice rate, and the
difference is a realised exchange gain or loss.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Contact, Organization, OrgCurrency
from backend.services.money import money

EXCHANGE_GAIN_LOSS = "7100"
RATE_PLACES = Decimal("0.000001")

# ISO 4217 codes offered in the currency list, with symbols.
COMMON_CURRENCIES = {
    "INR": ("Indian Rupee", "₹"),
    "USD": ("US Dollar", "$"),
    "EUR": ("Euro", "€"),
    "GBP": ("Pound Sterling", "£"),
    "AED": ("UAE Dirham", "AED"),
    "SAR": ("Saudi Riyal", "SAR"),
    "SGD": ("Singapore Dollar", "S$"),
    "AUD": ("Australian Dollar", "A$"),
    "CAD": ("Canadian Dollar", "C$"),
    "JPY": ("Japanese Yen", "¥"),
    "CNY": ("Chinese Yuan", "¥"),
    "CHF": ("Swiss Franc", "CHF"),
    "QAR": ("Qatari Riyal", "QAR"),
    "KWD": ("Kuwaiti Dinar", "KWD"),
    "OMR": ("Omani Rial", "OMR"),
    "BHD": ("Bahraini Dinar", "BHD"),
    "MYR": ("Malaysian Ringgit", "RM"),
    "NZD": ("New Zealand Dollar", "NZ$"),
    "ZAR": ("South African Rand", "R"),
    "LKR": ("Sri Lankan Rupee", "Rs"),
    "NPR": ("Nepalese Rupee", "Rs"),
    "BDT": ("Bangladeshi Taka", "৳"),
}


def base_currency(db: Session, org_id: str) -> str:
    org = db.get(Organization, org_id)
    return (org.currency if org else None) or "INR"


def rate(value) -> Decimal:
    return Decimal(str(value)).quantize(RATE_PLACES, rounding=ROUND_HALF_UP)


def to_base(amount: Decimal, exchange_rate: Decimal) -> Decimal:
    return money(Decimal(str(amount)) * Decimal(str(exchange_rate)))


def stored_rate(db: Session, org_id: str, code: str) -> Optional[Decimal]:
    row = db.execute(select(OrgCurrency).where(OrgCurrency.organization_id == org_id, OrgCurrency.code == code)).scalar_one_or_none()
    return row.exchange_rate if row and row.exchange_rate else None


def resolve(db: Session, org_id: str, contact: Contact, given_rate: Optional[Decimal]) -> Tuple[str, Decimal]:
    """(currency, exchange rate) for a document with this contact.

    The document is in the contact's currency. In the base currency the rate
    is 1; otherwise it is the rate given, or the organization's saved rate.
    """
    base = base_currency(db, org_id)
    code = (contact.currency or base).upper()
    if code == base:
        return base, Decimal("1")
    chosen = given_rate if given_rate else stored_rate(db, org_id, code)
    if not chosen or chosen <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Enter the exchange rate for {code} (base currency {base} per 1 {code})")
    return code, rate(chosen)


def is_foreign(db: Session, org_id: str, currency: Optional[str]) -> bool:
    return bool(currency) and currency != base_currency(db, org_id)


@dataclass
class BaseLine:
    rate: Decimal
    amount: Decimal
    tax_amount: Decimal


@dataclass
class Converted:
    """A priced document (services/documents.compute_lines output) in the base currency."""

    lines: List[BaseLine]
    subtotal: Decimal
    discount: Decimal
    tax_total: Decimal


def convert(computed, discount: Decimal, exchange_rate: Decimal) -> Converted:
    """Each line converted on its own, so the base document adds up exactly."""
    lines = [
        BaseLine(to_base(c.rate, exchange_rate), to_base(c.amount, exchange_rate), to_base(c.tax_amount, exchange_rate)) for c in computed
    ]
    subtotal = money(sum((ln.amount for ln in lines), Decimal("0")))
    return Converted(
        lines=lines,
        subtotal=subtotal,
        # Rounding each line can leave the subtotal a paisa under a full discount.
        discount=min(to_base(discount, exchange_rate), subtotal),
        tax_total=money(sum((ln.tax_amount for ln in lines), Decimal("0"))),
    )


def guard_base_only(db: Session, org_id: str, currency: Optional[str], what: str) -> None:
    if is_foreign(db, org_id, currency):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{what} is only available for documents in {base_currency(db, org_id)}")
