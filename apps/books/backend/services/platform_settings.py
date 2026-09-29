"""Runtime platform configuration, stored per key in ``platform_settings``.

A thin accessor over the :class:`PlatformSetting` table so a super-admin can
override behaviour that would otherwise be fixed at deploy time (its only key
today is ``allow_public_signup``). Absent a stored row, callers fall back to
the compile-time default they pass in, so an untouched deployment behaves
exactly as before.
"""

from __future__ import annotations

from datetime import UTC, datetime

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
