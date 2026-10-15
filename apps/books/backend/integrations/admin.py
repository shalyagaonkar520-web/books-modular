"""Platform admin: the failed-events list (events the relay gave up on) and retry."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.integrations import relay
from backend.schemas.common import Message

router = APIRouter(prefix="/api/platform/integration", tags=["Platform: Rooman One"])


@router.get("/failed-events")
def list_failed_events(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    return relay.failed_events(db, limit)


@router.post("/failed-events/{event_id}/retry", response_model=Message)
def retry_failed_event(event_id: str, db: Session = Depends(get_db)):
    if not relay.retry_failed(db, event_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No failed event with that id.")
    return Message(message="The event is queued to be sent again.")
