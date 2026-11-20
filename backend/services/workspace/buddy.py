"""Buddy: the helper at the bottom of the sidebar, for the people who run the business (admin, staff, viewer, custom roles).

It is the same assistant as the employee workspace (same tools, same permission door, same cost
controls) acting as the signed-in user. What Buddy may do is derived from that user's own role,
never more: a viewer's Buddy can only look things up, an admin's Buddy can do everything the
tools cover. A hidden per-organization workspace row holds the chats; it is not shown in the
owner's workspace list and cannot be given employees.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import User
from backend.services.workspace import perms, tools
from backend.workspace_models import AiChat, AiEmployee, AiWorkspace

BUDDY_NAME = "Buddy (system)"
_FULL = [perms.VIEW, perms.CREATE, perms.EDIT, perms.DELETE, perms.APPROVE, perms.EXPORT]


def is_system_workspace(ws: AiWorkspace) -> bool:
    try:
        return json.loads(ws.config or "{}").get("system") == "buddy"
    except ValueError:
        return False


def permissions_for(user: User) -> Dict[str, Any]:
    """What this user's Buddy may do: their own role, expressed as workspace permissions."""
    keys = perms.GRANTABLE_KEYS
    role = "viewer" if user.role == "reviewer" else user.role
    if role == "admin":
        return perms.normalize({"features": {k: _FULL for k in keys}, "financial": True})
    if role == "staff":
        return perms.normalize({"features": {k: [perms.VIEW, perms.CREATE, perms.EDIT, perms.EXPORT] for k in keys if k not in perms.FINANCIAL_FEATURES}, "financial": False})
    if role == "viewer":
        return perms.normalize({"features": {k: [perms.VIEW, perms.EXPORT] for k in keys}, "financial": True})
    if role == "custom":
        levels = user.permissions or {}
        feats = {k: ([perms.VIEW, perms.CREATE, perms.EDIT] if levels.get(k) == "edit" else [perms.VIEW]) for k in keys if levels.get(k) in ("view", "edit")}
        return perms.normalize({"features": feats, "financial": any(k in perms.FINANCIAL_FEATURES for k in feats)})
    raise HTTPException(403, "Buddy is not available for this account.")


def _workspace(db: Session, org_id: str) -> AiWorkspace:
    ws = db.execute(select(AiWorkspace).where(AiWorkspace.organization_id == org_id, AiWorkspace.name == BUDDY_NAME)).scalar_one_or_none()
    if ws is None:
        ws = AiWorkspace(
            organization_id=org_id,
            name=BUDDY_NAME,
            department="Boss",
            description="Buddy, the sidebar helper",
            permissions="{}",
            config=json.dumps({"system": "buddy"}),
            is_active=True,
        )
        db.add(ws)
        db.flush()
    return ws


def context_for(db: Session, user: User) -> tools.Ctx:
    if user.role == "employee" or user.workspace_employee:
        raise HTTPException(403, "Buddy is not available for this account.")
    perm = permissions_for(user)
    ws = _workspace(db, user.organization_id)
    # Not stored: it only carries the user's id and limits into the shared usage / budget checks.
    employee = AiEmployee(
        organization_id=user.organization_id,
        workspace_id=ws.id,
        user_id=user.id,
        name=user.name,
        email=user.email,
        status="active",
        ai_enabled=True,
        allow_auto=True,
        allow_manual=True,
        preferred_mode="auto",
    )
    return tools.Ctx(db=db, user=user, employee=employee, workspace=ws, perm=perm)


def current_chat(db: Session, ctx: tools.Ctx, *, fresh: bool = False) -> Optional[AiChat]:
    chat = db.execute(
        select(AiChat).where(AiChat.user_id == ctx.user.id, AiChat.workspace_id == ctx.workspace.id, AiChat.is_archived.is_(False)).order_by(AiChat.updated_at.desc()).limit(1)
    ).scalar_one_or_none()
    if chat is not None and fresh:
        chat.is_archived = True
        chat = None
    return chat
