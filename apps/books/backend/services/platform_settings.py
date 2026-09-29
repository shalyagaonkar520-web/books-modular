"""Runtime platform configuration, stored per key in ``platform_settings``.

A thin accessor over the :class:`PlatformSetting` table so a super-admin can
override behaviour that would otherwise be fixed at deploy time
(``allow_public_signup`` and the defaults seeded into new organizations). Absent a stored row, callers fall back to
the compile-time default they pass in, so an untouched deployment behaves
exactly as before.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import PlatformSetting

_TRUE = {"1", "true", "yes", "on"}


def get_value(db: Session, key: str) -> str | None:
    return db.execute(select(PlatformSetting.value).where(PlatformSetting.key == key)).scalar_one_or_none()


def get_bool(db: Session, key: str, default: bool) -> bool:
    raw = get_value(db, key)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE


def set_value(db: Session, key: str, value: str) -> PlatformSetting:
    row = db.execute(select(PlatformSetting).where(PlatformSetting.key == key)).scalar_one_or_none()
    if row is None:
        row = PlatformSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
        row.updated_at = datetime.now(UTC)
    return row


def set_bool(db: Session, key: str, value: bool) -> PlatformSetting:
    return set_value(db, key, "true" if value else "false")


# --------------------------------------------------------------------------- #
# Global defaults applied to every newly created organization
# --------------------------------------------------------------------------- #
DEFAULT_TAX_RATE_KEY = "default_tax_rate"
DEFAULT_PAYMENT_TERMS_DAYS_KEY = "default_payment_terms_days"
DEFAULT_CURRENCY_KEY = "default_currency"

DEFAULT_TAX_RATE = Decimal("18")
DEFAULT_PAYMENT_TERMS_DAYS = 30
DEFAULT_CURRENCY = "INR"


@dataclass(frozen=True)
class OrgDefaults:
    tax_rate: Decimal
    payment_terms_days: int
    currency: str


def get_decimal(db: Session, key: str, default: Decimal) -> Decimal:
    raw = get_value(db, key)
    if raw is None:
        return default
    try:
        return Decimal(raw.strip())
    except (InvalidOperation, ValueError):
        return default


def get_int(db: Session, key: str, default: int) -> int:
    raw = get_value(db, key)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def get_org_defaults(db: Session) -> OrgDefaults:
    currency = (get_value(db, DEFAULT_CURRENCY_KEY) or "").strip().upper() or DEFAULT_CURRENCY
    return OrgDefaults(
        tax_rate=get_decimal(db, DEFAULT_TAX_RATE_KEY, DEFAULT_TAX_RATE),
        payment_terms_days=get_int(db, DEFAULT_PAYMENT_TERMS_DAYS_KEY, DEFAULT_PAYMENT_TERMS_DAYS),
        currency=currency,
    )
