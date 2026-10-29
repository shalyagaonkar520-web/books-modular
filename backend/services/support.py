"""Support: requests from an organization's users to the platform, and their chat.

Anyone signed in (every role) opens a request - report an issue, ask why a
change was made, ask for more users... - and writes to it; a super admin
answers. Each new request and message is emailed to the platform's admins,
and each answer to the person who opened the request. Admins of the
organization see all its requests; everyone else sees their own.
``last_message_by`` tells each side whether the other is waiting.
"""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.models import Organization, PlatformAdmin, SupportMessage, SupportTicket, User
from backend.schemas.common import APIModel

logger = logging.getLogger(__name__)

ORG, PLATFORM = "org", "platform"
# problem = report an issue, change = ask why a change was made
CATEGORIES = ("problem", "change", "users", "plan", "other")
CATEGORY_LABELS = {
    "problem": "Issue",
    "change": "Question about a change",
    "users": "More users",
    "plan": "Plan",
    "other": "Other",
}


class TicketIn(APIModel):
    subject: str = Field(min_length=3, max_length=200)
    category: str = Field(default="other", pattern="^(users|plan|problem|change|other)$")
    message: str = Field(min_length=1, max_length=5000)


class MessageIn(APIModel):
    message: str = Field(min_length=1, max_length=5000)


class MessageOut(APIModel):
    id: str
    author_kind: str
    author_name: str
    body: str
    created_at: datetime


class TicketOut(APIModel):
    id: str
    organization_id: str
    organization_name: Optional[str] = None
    subject: str
    category: str
    status: str
    created_by_name: str
    created_by_user_id: Optional[str] = None
    created_at: datetime
    last_message_at: datetime
    last_message_by: str
    messages: List[MessageOut] = []


def _out(ticket: SupportTicket, org_name: Optional[str] = None, with_messages: bool = False) -> TicketOut:
    return TicketOut(
        id=ticket.id,
        organization_id=ticket.organization_id,
        organization_name=org_name,
        subject=ticket.subject,
        category=ticket.category,
        status=ticket.status,
        created_by_name=ticket.created_by_name,
        created_by_user_id=ticket.created_by_user_id,
        created_at=ticket.created_at,
        last_message_at=ticket.last_message_at,
        last_message_by=ticket.last_message_by,
        messages=[MessageOut.model_validate(m, from_attributes=True) for m in ticket.messages] if with_messages else [],
    )


def _load(db: Session, ticket_id: str, org_id: Optional[str] = None) -> SupportTicket:
    stmt = select(SupportTicket).where(SupportTicket.id == ticket_id).options(selectinload(SupportTicket.messages))
    if org_id is not None:
        stmt = stmt.where(SupportTicket.organization_id == org_id)
    ticket = db.execute(stmt).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return ticket


def _org_name(db: Session, org_id: str) -> Optional[str]:
    org = db.get(Organization, org_id)
    return org.name if org else None


def _send_later(to: List[str], subject: str, body: str) -> None:
    """Email in the background, so a slow or missing mail server never holds up the chat."""
    from backend.services.email_service import send_custom_message_email, smtp_configured

    if not to or not smtp_configured():
        return

    def run() -> None:
        for address in to:
            try:
                send_custom_message_email(address, subject, body, company_name="Rooman Books Support")
            except Exception:  # noqa: BLE001 - email is a courtesy; the request is saved either way
                logger.exception("Support email to %s failed", address)

    threading.Thread(target=run, daemon=True).start()


def _platform_emails(db: Session) -> List[str]:
    return list(db.execute(select(PlatformAdmin.email).where(PlatformAdmin.is_active.is_(True))).scalars())


def _tell_platform(db: Session, ticket: SupportTicket, author: str, body: str, first: bool) -> None:
    org = _org_name(db, ticket.organization_id) or "An organization"
    kind = CATEGORY_LABELS.get(ticket.category, "Request")
    head = f"New support request ({kind}) from {author}, {org}" if first else f"{author} ({org}) wrote on: {ticket.subject}"
    link = f"{get_settings().frontend_url}/platform/requests"
    _send_later(_platform_emails(db), f"[Support] {ticket.subject}", f"{head}\n\n{body}\n\nAnswer it here: {link}")


def open_ticket(db: Session, org_id: str, author_name: str, payload: TicketIn, author: Optional[User] = None) -> TicketOut:
    now = datetime.now(UTC)
    ticket = SupportTicket(
        organization_id=org_id,
        subject=payload.subject.strip(),
        category=payload.category,
        status="open",
        created_by_name=author_name,
        created_by_user_id=author.id if author else None,
        created_by_email=author.email if author else None,
        last_message_at=now,
        last_message_by=ORG,
    )
    ticket.messages.append(SupportMessage(author_kind=ORG, author_name=author_name, body=payload.message.strip(), created_at=now))
    db.add(ticket)
    db.commit()
    _tell_platform(db, ticket, author_name, payload.message.strip(), first=True)
    return _out(_load(db, ticket.id), _org_name(db, org_id), with_messages=True)


def list_for_user(db: Session, user: User) -> List[TicketOut]:
    """An admin sees every request of the organization; anyone else, the ones they opened."""
    stmt = select(SupportTicket).where(SupportTicket.organization_id == user.organization_id)
    if user.role != "admin":
        stmt = stmt.where(SupportTicket.created_by_user_id == user.id)
    return [_out(t) for t in db.execute(stmt.order_by(SupportTicket.last_message_at.desc())).scalars()]


def check_access(db: Session, ticket_id: str, user: User) -> None:
    ticket = _load(db, ticket_id, user.organization_id)
    if user.role != "admin" and ticket.created_by_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")


def list_for_org(db: Session, org_id: str) -> List[TicketOut]:
    rows = db.execute(
        select(SupportTicket).where(SupportTicket.organization_id == org_id).order_by(SupportTicket.last_message_at.desc())
    ).scalars()
    return [_out(t) for t in rows]


def list_all(db: Session, status_filter: Optional[str] = None) -> List[TicketOut]:
    stmt = select(SupportTicket).order_by(SupportTicket.last_message_at.desc())
    if status_filter in ("open", "closed"):
        stmt = stmt.where(SupportTicket.status == status_filter)
    rows = db.execute(stmt.limit(500)).scalars().all()
    names = (
        dict(db.execute(select(Organization.id, Organization.name).where(Organization.id.in_({t.organization_id for t in rows}))).all())
        if rows
        else {}
    )
    return [_out(t, names.get(t.organization_id)) for t in rows]


def get(db: Session, ticket_id: str, org_id: Optional[str] = None) -> TicketOut:
    ticket = _load(db, ticket_id, org_id)
    return _out(ticket, _org_name(db, ticket.organization_id), with_messages=True)


def reply(db: Session, ticket_id: str, kind: str, author_name: str, body: str, org_id: Optional[str] = None) -> TicketOut:
    ticket = _load(db, ticket_id, org_id)
    now = datetime.now(UTC)
    ticket.messages.append(SupportMessage(author_kind=kind, author_name=author_name, body=body.strip(), created_at=now))
    ticket.last_message_at = now
    ticket.last_message_by = kind
    # Writing to a closed request opens it again.
    ticket.status = "open"
    db.commit()
    if kind == PLATFORM:
        if ticket.created_by_email:
            link = f"{get_settings().frontend_url}/support"
            _send_later(
                [ticket.created_by_email],
                f"Re: {ticket.subject}",
                f"{author_name} from Rooman Books support answered your request:\n\n{body.strip()}\n\nReply here: {link}",
            )
    else:
        _tell_platform(db, ticket, author_name, body.strip(), first=False)
    return get(db, ticket_id, org_id)


def set_status(db: Session, ticket_id: str, new_status: str, org_id: Optional[str] = None) -> TicketOut:
    if new_status not in ("open", "closed"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Status is open or closed")
    ticket = _load(db, ticket_id, org_id)
    ticket.status = new_status
    db.commit()
    return get(db, ticket_id, org_id)


def waiting_for_platform(db: Session) -> int:
    """Open requests whose last word is the organization's: the super admin should answer."""
    rows = db.execute(select(SupportTicket.id).where(SupportTicket.status == "open", SupportTicket.last_message_by == ORG)).all()
    return len(rows)
