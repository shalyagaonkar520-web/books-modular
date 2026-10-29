"""Reviewers: a reviewer is connected to users and/or roles, and reviews their changes.

Work is saved straight away; every change by someone in the reviewer's scope
waits in their list until they mark it Reviewed or Flagged (with a note). The
person who made a flagged change sees the flag and the note.

A scope is a list of "user:<id>", "role:<admin|staff|viewer>" and
"custom:<role id>" (one of the organization's custom roles).
"""

from __future__ import annotations

import json
from typing import Iterable, List, Optional, Set

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import ChangeLog, OrgRole, User

BUILT_IN = ("admin", "staff", "viewer")


def clean_scope(
    db: Session, org_id: str, role: Optional[str], scope: Optional[Iterable[str]], user_id: Optional[str] = None
) -> Optional[str]:
    """The review_scope to store (JSON) for a user with ``role``; checks every entry belongs to the organization."""
    if role != "reviewer":
        return None
    entries = list(dict.fromkeys(str(s).strip() for s in (scope or []) if str(s).strip()))
    if not entries:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose whose work this reviewer reviews: at least one user or role.")
    for entry in entries:
        kind, _, value = entry.partition(":")
        if kind == "role" and value in BUILT_IN:
            continue
        if kind == "custom":
            role_row = db.get(OrgRole, value)
            if role_row is not None and role_row.organization_id == org_id:
                continue
        if kind == "user":
            target = db.get(User, value)
            if target is not None and target.organization_id == org_id and target.role != "integration":
                if user_id and target.id == user_id:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, "A reviewer cannot review their own work.")
                continue
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown user or role to review: {entry}")
    return json.dumps(entries)


def users_in_scope(db: Session, org_id: str, scope: Optional[List[str]], exclude: Optional[str] = None) -> Set[str]:
    """Ids of the organization's users a scope covers (never the reviewer themself)."""
    if not scope:
        return set()
    user_ids = {s.split(":", 1)[1] for s in scope if s.startswith("user:")}
    roles = {s.split(":", 1)[1] for s in scope if s.startswith("role:")}
    customs = {s.split(":", 1)[1] for s in scope if s.startswith("custom:")}
    rows = db.execute(select(User.id, User.role, User.custom_role_id).where(User.organization_id == org_id)).all()
    out = {uid for uid, role, custom in rows if uid in user_ids or role in roles or (role == "custom" and custom in customs)}
    out.discard(exclude)
    return out


def describe(db: Session, scope: Optional[List[str]]) -> List[str]:
    """Readable names for a scope, e.g. ["Staff (role)", "Cashier (custom role)", "Asha Rao"]."""
    names: List[str] = []
    for entry in scope or []:
        kind, _, value = entry.partition(":")
        if kind == "role":
            names.append(f"{value.title()} (role)")
        elif kind == "custom":
            row = db.get(OrgRole, value)
            names.append(f"{row.name} (custom role)" if row else "A deleted role")
        elif kind == "user":
            row = db.get(User, value)
            names.append(row.name if row else "A deleted user")
    return names


def _kind(entity_type: str) -> str:
    words = entity_type.replace("_", " ")
    if words.endswith("ies"):
        words = words[:-3] + "y"
    elif words.endswith("s") and not words.endswith("ss"):
        words = words[:-1]
    return words.capitalize()


def notifications(db: Session, user: User) -> List[dict]:
    """Bell items: my changes a reviewer put on hold or sent a message about; for reviewers, how many wait."""
    out: List[dict] = []
    mine = (
        db.execute(
            select(ChangeLog)
            .where(
                ChangeLog.organization_id == user.organization_id,
                ChangeLog.user_id == user.id,
                ChangeLog.review_status.in_(("hold", "flagged")),
            )
            .order_by(ChangeLog.reviewed_at.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )
    for row in mine:
        what = f"{_kind(row.entity_type)}{f' {row.entity_label}' if row.entity_label else ''}"
        who = row.reviewed_by_name or "A reviewer"
        held = row.review_status == "hold"
        out.append(
            {
                "id": f"review-{row.id}-{row.review_status}-{row.reviewed_at.isoformat() if row.reviewed_at else ''}",
                "kind": "review_hold" if held else "review_message",
                "title": f"{who} put your change to {what} on hold" if held else f"{who} sent you a message about {what}",
                "body": row.review_note or ("Wait for the reviewer before relying on it." if held else "Open Support to answer."),
                "entity_type": "review",
                "entity_id": row.id,
                "severity": "warning" if held else "danger",
            }
        )
    if user.role == "reviewer":
        ids = users_in_scope(db, user.organization_id, user.review_targets, exclude=user.id)
        waiting = (
            db.scalar(
                select(func.count())
                .select_from(ChangeLog)
                .where(
                    ChangeLog.organization_id == user.organization_id,
                    ChangeLog.user_id.in_(ids or {"-"}),
                    ChangeLog.review_status.is_(None),
                )
            )
            or 0
        )
        if waiting:
            out.append(
                {
                    "id": f"review-waiting-{waiting}",
                    "kind": "review_waiting",
                    "title": f"{waiting} change(s) to check",
                    "body": "Approve them, put them on hold or send a message.",
                    "entity_type": "reviews",
                    "entity_id": None,
                    "severity": "info",
                }
            )
    return out


def holds(db: Session, org_id: str, entity_type: str) -> dict:
    """{record id: {status, note, by}} for records whose latest reviewed change is on hold or questioned."""
    rows = db.execute(
        select(ChangeLog)
        .where(
            ChangeLog.organization_id == org_id,
            ChangeLog.entity_type == entity_type,
            ChangeLog.review_status.in_(("hold", "flagged")),
        )
        .order_by(ChangeLog.reviewed_at)
    ).scalars()
    return {
        row.entity_id: {"status": row.review_status, "note": row.review_note, "by": row.reviewed_by_name} for row in rows if row.entity_id
    }
