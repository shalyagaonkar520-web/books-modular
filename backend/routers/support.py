"""Support: every signed-in user (any role) can report an issue or ask the platform a question.

Open even while the organization's plan has run out, so anyone can still ask
for help. Admins see all the organization's requests; others see their own.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import User
from backend.schemas.common import APIModel
from backend.services import audit, support

router = APIRouter(prefix="/api/support", tags=["Support"])


class TicketStatusIn(APIModel):
    status: str


@router.get("/requests", response_model=List[support.TicketOut])
def list_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return support.list_for_user(db, user)


@router.post("/requests", response_model=support.TicketOut, status_code=status.HTTP_201_CREATED)
def open_request(payload: support.TicketIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = support.open_ticket(db, user.organization_id, user.name, payload, author=user)
    audit.record(db, user, "create", "support_request", ticket.id, f"Support request sent: {ticket.subject}")
    db.commit()
    return ticket


@router.get("/requests/{ticket_id}", response_model=support.TicketOut)
def get_request(ticket_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    support.check_access(db, ticket_id, user)
    return support.get(db, ticket_id, user.organization_id)


@router.post("/requests/{ticket_id}/messages", response_model=support.TicketOut)
def reply_request(ticket_id: str, payload: support.MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    support.check_access(db, ticket_id, user)
    return support.reply(db, ticket_id, support.ORG, user.name, payload.message, user.organization_id)


@router.post("/requests/{ticket_id}/status", response_model=support.TicketOut)
def request_status(ticket_id: str, payload: TicketStatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    support.check_access(db, ticket_id, user)
    return support.set_status(db, ticket_id, payload.status, user.organization_id)
