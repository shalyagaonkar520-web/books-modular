"""Link Books contacts (customers and vendors) to Core's shared customer record.

When a contact is created or edited and INTEGRATION_ENABLED is on:

1. The contact is saved exactly as before; the user's request never waits on
   or fails because of Core.
2. Books then asks Core for the party (find-or-create by email/phone, or an
   update once linked), stores ``party_id`` and writes ``customer.created`` /
   ``customer.updated`` to the outbox in the same transaction.
3. If Core is unreachable, ``party_sync_pending`` is set and the relay retries
   later (``retry_pending``). Contacts saved before integration was switched on
   are linked the same way, a batch at a time.
"""

from __future__ import annotations

import logging
from typing import Iterable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.integrations import events
from backend.integrations.core_client import CoreError, CoreUnavailable, core
from backend.models import Contact

logger = logging.getLogger("roomanbooks.integrations.customers")

# The fields Core's party holds; a change to anything else is Books-only.
PARTY_FIELDS = ("display_name", "email", "phone", "mobile", "type")


def party_changes(contact: Contact, updates: dict) -> list[str]:
    """Which party fields an edit actually changes (call before applying it)."""
    return [f for f in PARTY_FIELDS if f in updates and updates[f] != getattr(contact, f)]


def _phone(contact: Contact) -> Optional[str]:
    value = (contact.mobile or contact.phone or "").strip()
    return value[:32] or None


def _data(contact: Contact) -> dict:
    return {
        "party_id": events.uuid_of(contact.party_id),
        "app_local_id": events.uuid_of(contact.id),
        "display_name": contact.display_name[:200],
        "email": (contact.email or "").strip() or None,
        "phone": _phone(contact),
        "type": contact.type if contact.type in ("customer", "vendor") else "customer",
    }


def _link(db: Session, contact: Contact, changed: Optional[Iterable[str]], user=None) -> None:
    """Talk to Core and write the event (not committed). Raises CoreUnavailable / CoreError."""
    org_id = events.uuid_of(contact.organization_id)
    data = _data(contact)
    if contact.party_id is None:
        party_id = core().find_or_create_party(
            org_id, data["display_name"], data["email"], data["phone"], data["type"], local_id=contact.id
        )
        contact.party_id = events.books_id_of(party_id)
        contact.party_sync_pending = False
        events.emit(
            db, type="customer.created", organization_id=contact.organization_id, data=_data(contact), actor=events.user_actor(user)
        )
        return
    core().update_party(
        events.uuid_of(contact.party_id),
        org_id=org_id,
        name=data["display_name"],
        email=data["email"],
        phone=data["phone"],
        type=data["type"],
    )
    contact.party_sync_pending = False
    fields = sorted({"phone" if f == "mobile" else f for f in (changed or PARTY_FIELDS)})
    events.emit(
        db,
        type="customer.updated",
        organization_id=contact.organization_id,
        data={**data, "changed": fields},
        actor=events.user_actor(user),
    )


def after_save(db: Session, contact: Contact, *, created: bool, changed: Optional[list[str]] = None, user=None) -> None:
    """Called by the contacts router after its own commit. Never raises."""
    if not events.enabled():
        return
    if not created and contact.party_id is not None and not changed:
        return  # nothing Core holds was edited
    try:
        _link(db, contact, changed, user)
        db.commit()
    except (CoreUnavailable, CoreError) as exc:
        db.rollback()
        logger.warning("Contact %s not linked to Core yet (%s); will retry", contact.id, exc)
        _mark_pending(db, contact.id)
    except Exception:
        db.rollback()
        logger.exception("Linking contact %s to Core failed; will retry", contact.id)
        _mark_pending(db, contact.id)


def _mark_pending(db: Session, contact_id: str) -> None:
    try:
        fresh = db.get(Contact, contact_id)
        if fresh is not None and not fresh.party_sync_pending:
            fresh.party_sync_pending = True
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not mark contact %s for a Core retry", contact_id)


def retry_pending(db: Session, limit: int = 50) -> int:
    """Link contacts that are not linked yet or have edits Core has not seen. Returns how many succeeded."""
    if not events.enabled():
        return 0
    rows = (
        db.execute(
            select(Contact)
            .where(or_(Contact.party_id.is_(None), Contact.party_sync_pending.is_(True)))
            .order_by(Contact.updated_at)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    done = 0
    for contact in rows:
        try:
            _link(db, contact, None)
            db.commit()
            done += 1
        except CoreUnavailable as exc:
            db.rollback()
            logger.info("Core unavailable while catching up contacts (%s); stopping this round", exc)
            break  # Core is down: the rest would fail the same way
        except CoreError as exc:
            db.rollback()
            logger.warning("Core refused contact %s: %s", contact.id, exc)
            _mark_pending(db, contact.id)
    return done
