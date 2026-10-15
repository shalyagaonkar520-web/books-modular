"""Publishing side: business code calls ``emit`` and nothing else.

``emit`` writes the event into Books' ``outbox`` in the caller's transaction
(rooman_sdk.outbox.enqueue), so the event exists exactly when the change
commits. The relay (integrations/relay.py) delivers it later. With
INTEGRATION_ENABLED off, ``emit`` does nothing at all.

Books ids are 32 hex characters; events carry canonical UUIDs. Convert here,
at the boundary, never in business code.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.integrations.tables import outbox


def enabled() -> bool:
    return get_settings().integration_enabled


def uuid_of(books_id: Optional[str]) -> Optional[str]:
    """Books' 32-hex id -> canonical UUID (None stays None)."""
    if books_id is None:
        return None
    from rooman_sdk.ids import canonical_uuid

    return canonical_uuid(books_id)


def books_id_of(value: Optional[str]) -> Optional[str]:
    """Canonical UUID (or 32-hex) -> Books' 32-hex id."""
    if value is None:
        return None
    from rooman_sdk.ids import hex_uuid

    return hex_uuid(value)


def money(value: Any) -> str:
    """Decimal as a string with two places, never a float (the contracts' money format)."""
    return f"{Decimal(str(value or 0)).quantize(Decimal('0.01'))}"


def user_actor(user: Any):
    from rooman_sdk.events import Actor

    return Actor(type="user", id=uuid_of(user.id)) if user is not None else Actor(type="system")


def system_actor():
    from rooman_sdk.events import Actor

    return Actor(type="system")


def emit(db: Session, *, type: str, organization_id: str, data: dict[str, Any], actor=None, version: int = 1) -> Optional[str]:
    """Add an event to the outbox in the caller's transaction (not committed). Returns its id, or None when off."""
    if not enabled():
        return None
    from rooman_sdk.outbox import enqueue

    event = enqueue(
        db,
        outbox,
        source=get_settings().event_source,
        type=type,
        org_id=uuid_of(organization_id),
        data=data,
        actor=actor or system_actor(),
        version=version,
    )
    return event.id
