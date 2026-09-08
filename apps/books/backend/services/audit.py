"""Audit trail helper."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from backend.models import AuditLog, User


def record(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    summary: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=organization_id or (user.organization_id if user else ""),
            user_id=user.id if user else None,
            user_name=user.name if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
        )
    )
