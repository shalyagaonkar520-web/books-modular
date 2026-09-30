"""Organization user management, profile and audit log, shared by the tenant
app (``/api/users`` ... in ``routers/organization.py``, acting as a tenant
admin) and the organization admin panel (``/api/org-admin/users`` ... in
``routers/org_admin.py``, acting as an org panel admin).

Every function takes ``(db, org_id, actor, ...)``: ``org_id`` scopes the work
to one organization, and ``actor`` - a tenant ``User`` or an ``OrgPanelAdmin``
- is who the change is attributed to. Rules tied to the actor's own tenant
account (you cannot demote, deactivate or delete yourself) apply only when the
actor is a tenant user; the panel admin has no tenant account.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import List, Optional, Union

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models import AuditLog, Document, Employee, Organization, OrgPanelAdmin, RefreshToken, TimeEntry, User
from backend.schemas.auth import (
    AdminResetPasswordRequest,
    AuditLogOut,
    InviteUserRequest,
    OrganizationOut,
    OrganizationUpdate,
    UpdateUserRequest,
    UserOut,
)
from backend.schemas.common import Message, Page
from backend.security import hash_password, hash_token
from backend.services import audit
from backend.services.email_service import send_invite_email, smtp_configured
from backend.services.tenancy import Pagination, get_or_404, paginate

settings = get_settings()

# How long an invite link stays valid before the admin has to resend it.
INVITE_TOKEN_EXPIRE_DAYS = 7

Actor = Union[User, OrgPanelAdmin]


def _own_user_id(actor: Actor) -> Optional[str]:
    """The actor's own tenant user id, or None for a panel admin."""
    return actor.id if isinstance(actor, User) else None


def _get_org(db: Session, org_id: str) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def _get_user(db: Session, org_id: str, user_id: str) -> User:
    target = db.get(User, user_id)
    if target is None or target.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return target


def _require_another_admin(db: Session, org_id: str) -> None:
    admins = (
        db.execute(select(User.id).where(User.organization_id == org_id, User.role == "admin", User.is_active.is_(True))).scalars().all()
    )
    if len(admins) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The organization needs at least one administrator")


# --------------------------------------------------------------------------- #
# Organization profile
# --------------------------------------------------------------------------- #
def get_organization(db: Session, org_id: str) -> OrganizationOut:
    return OrganizationOut.model_validate(_get_org(db, org_id))


def update_organization(db: Session, org_id: str, actor: Actor, payload: OrganizationUpdate) -> OrganizationOut:
    org = _get_org(db, org_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    audit.record(db, actor, "update", "organization", org.id, "Organization profile updated", organization_id=org_id)
    db.commit()
    db.refresh(org)
    return OrganizationOut.model_validate(org)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def list_users(db: Session, org_id: str) -> List[UserOut]:
    rows = db.execute(select(User).where(User.organization_id == org_id).order_by(User.created_at)).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


def invite_user(db: Session, org_id: str, actor: Actor, payload: InviteUserRequest) -> UserOut:
    org = _get_org(db, org_id)
    email = payload.email.lower()
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")
    if not smtp_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Outbound email is not configured on the server, so invite links cannot be delivered. "
            "Set SMTP_USER and SMTP_PASSWORD, or ask an administrator to.",
        )

    employee: Employee | None = None
    if payload.role == "employee":
        if not payload.employee_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select which employee this portal login is for.")
        employee = get_or_404(db, Employee, payload.employee_id, org_id, "Employee")
        if employee.user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This employee already has portal access.")

    raw_token = secrets.token_urlsafe(32)
    new_user = User(
        organization_id=org_id,
        name=payload.name,
        email=email,
        role=payload.role,
        password_hash=None,
        is_active=True,
        invite_token_hash=hash_token(raw_token),
        invite_token_expires_at=datetime.now(UTC) + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_user)
    db.flush()
    if employee is not None:
        employee.user_id = new_user.id

    accept_url = f"{settings.frontend_url}/accept-invite?token={raw_token}"
    result = send_invite_email(
        to_email=email,
        name=payload.name,
        organization_name=org.name,
        role=payload.role,
        inviter_name=actor.name,
        accept_url=accept_url,
    )
    if not result.get("success"):
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not send the invite email: {result.get('error', 'unknown error')}")

    detail = f"Invited {email} as {payload.role}" + (f", linked to employee {employee.name}" if employee else "")
    audit.record(db, actor, "create", "user", new_user.id, detail, organization_id=org_id)
    db.commit()
    return UserOut.model_validate(new_user)


def update_user(db: Session, org_id: str, actor: Actor, user_id: str, payload: UpdateUserRequest) -> UserOut:
    target = _get_user(db, org_id, user_id)
    data = payload.model_dump(exclude_unset=True)
    if target.id == _own_user_id(actor) and (data.get("role") not in (None, "admin") or data.get("is_active") is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot demote or deactivate your own account")
    demoting = bool(data.get("role")) and data["role"] != "admin" and target.role == "admin"
    deactivating = data.get("is_active") is False and target.is_active and target.role == "admin"
    if demoting or deactivating:
        _require_another_admin(db, org_id)
    for field, value in data.items():
        setattr(target, field, value)
    audit.record(db, actor, "update", "user", target.id, f"Updated user {target.email}", organization_id=org_id)
    db.commit()
    return UserOut.model_validate(target)


def delete_user(db: Session, org_id: str, actor: Actor, user_id: str) -> Message:
    target = _get_user(db, org_id, user_id)
    if target.id == _own_user_id(actor):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    if target.role == "admin":
        _require_another_admin(db, org_id)

    has_time = db.execute(select(TimeEntry.id).where(TimeEntry.user_id == target.id).limit(1)).first()
    has_docs = db.execute(select(Document.id).where(Document.uploaded_by == target.id).limit(1)).first()
    if has_time or has_docs:
        target.is_active = False
        audit.record(
            db,
            actor,
            "update",
            "user",
            target.id,
            f"Deactivated user {target.email} instead of deleting (has linked records)",
            organization_id=org_id,
        )
        db.commit()
        return Message(message="User has recorded data and has been marked inactive instead of deleted")

    employee = db.execute(select(Employee).where(Employee.user_id == target.id)).scalar_one_or_none()
    if employee:
        employee.user_id = None

    audit.record(db, actor, "delete", "user", target.id, f"Deleted user {target.email}", organization_id=org_id)
    db.delete(target)
    db.commit()
    return Message(message="User deleted")


def reset_user_password(db: Session, org_id: str, actor: Actor, user_id: str, payload: AdminResetPasswordRequest) -> Message:
    target = _get_user(db, org_id, user_id)
    target.password_hash = hash_password(payload.new_password)
    # Whoever knew the old password may still hold a session: end them all.
    now = datetime.now(UTC)
    for token in db.execute(select(RefreshToken).where(RefreshToken.user_id == target.id, RefreshToken.revoked_at.is_(None))).scalars():
        token.revoked_at = now
    audit.record(db, actor, "update", "user", target.id, f"Password reset for {target.email}", organization_id=org_id)
    db.commit()
    return Message(message="Password reset")


# --------------------------------------------------------------------------- #
# Audit log
# --------------------------------------------------------------------------- #
def audit_log_page(db: Session, org_id: str, entity_type: Optional[str], pagination: Pagination) -> Page[AuditLogOut]:
    stmt = select(AuditLog).where(AuditLog.organization_id == org_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[AuditLogOut.model_validate(r) for r in rows], total=total, page=pagination.page, page_size=pagination.page_size)
