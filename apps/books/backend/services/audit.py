"""Audit trail helper."""

from __future__ import annotations

from typing import Optional, Union

from sqlalchemy.orm import Session

from backend.models import AuditLog, OrgPanelAdmin, PlatformAdmin, User


def record(
    db: Session,
    user: Optional[Union[User, OrgPanelAdmin, PlatformAdmin]],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    summary: Optional[str] = None,
    organization_id: Optional[str] = None,
    actor_name: Optional[str] = None,
) -> None:
    """Add an audit row for ``user``'s change (``None`` = the system/platform).

    An organization admin-panel login is not a tenant user: its rows carry no
    ``user_id`` and are attributed by name ("<name> (org admin panel)").
    A platform (super) admin is attributed as "<name> (platform admin)".
    ``actor_name`` overrides the recorded name for any caller.
    """
    if isinstance(user, PlatformAdmin):
        actor_name = actor_name or f"{user.name} (platform admin)"
        user = None
    if isinstance(user, OrgPanelAdmin):
        actor_name = actor_name or user.audit_name
        organization_id = organization_id or user.organization_id
        user = None
    impersonator = getattr(user, "impersonated_by", None) if user else None
    if impersonator:
        summary = f"{summary or ''} [via platform admin {impersonator}]".strip()
    db.add(
        AuditLog(
            organization_id=organization_id or (user.organization_id if user else ""),
            user_id=user.id if user else None,
            user_name=actor_name or (user.name if user else None),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
        )
    )
