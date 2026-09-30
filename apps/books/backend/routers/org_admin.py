"""The organization admin panel: an organization's own admins manage their
organization's users, app content and settings.

Everything here is scoped to the caller's organization and restricted to its
admins. Users, the organization profile, e-mail and the activity log reuse the
tenant endpoints in ``organization.py``; this router adds the panel's
dashboard summary and the organization's own app-content customization (the
same per-organization overrides a platform admin can edit).
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_admin
from backend.models import AuditLog, User
from backend.schemas.app_content import AppContent, AppContentOverrides, OrgAppContentOut
from backend.schemas.auth import AuditLogOut, UserOut
from backend.schemas.common import APIModel
from backend.services import audit
from backend.services.app_content import (
    delete_org_app_content,
    get_app_content,
    get_org_app_content,
    get_org_overrides,
    save_org_app_content,
)

router = APIRouter(prefix="/api/org-admin", tags=["Organization admin"])

RECENT_USERS = 5
RECENT_ACTIVITY = 10


class OrgAdminUserStats(APIModel):
    total: int
    active: int
    inactive: int
    pending_invites: int
    by_role: Dict[str, int]
    signed_in_last_30_days: int


class OrgAdminAppContentStats(APIModel):
    customized_fields: int
    disabled_modules: List[str]


class OrgAdminOrgSummary(APIModel):
    id: str
    name: str
    created_at: datetime
    approval_status: Optional[str] = None


class OrgAdminDashboardOut(APIModel):
    organization: OrgAdminOrgSummary
    users: OrgAdminUserStats
    recent_users: List[UserOut]
    recent_activity: List[AuditLogOut]
    activity_last_7_days: int
    app_content: OrgAdminAppContentStats


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    # SQLite hands back naive datetimes; they are stored in UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


@router.get("/dashboard", response_model=OrgAdminDashboardOut)
def dashboard(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = user.organization
    users = db.execute(select(User).where(User.organization_id == org.id).order_by(User.created_at.desc())).scalars().all()
    now = datetime.now(UTC)
    month_ago, week_ago = now - timedelta(days=30), now - timedelta(days=7)
    outs = [UserOut.model_validate(u) for u in users]

    activity = (
        db.execute(select(AuditLog).where(AuditLog.organization_id == org.id).order_by(AuditLog.created_at.desc()).limit(RECENT_ACTIVITY))
        .scalars()
        .all()
    )
    week_count = db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.organization_id == org.id, AuditLog.created_at >= week_ago)
    ).scalar_one()

    content = get_org_app_content(db, org.id)
    overrides = get_org_overrides(db, org.id)
    return OrgAdminDashboardOut(
        organization=OrgAdminOrgSummary(
            id=org.id, name=org.name, created_at=org.created_at, approval_status=getattr(org, "approval_status", None)
        ),
        users=OrgAdminUserStats(
            total=len(users),
            active=sum(1 for u in users if u.is_active),
            inactive=sum(1 for u in users if not u.is_active),
            pending_invites=sum(1 for o in outs if o.pending_invite),
            by_role=dict(Counter(u.role for u in users)),
            signed_in_last_30_days=sum(1 for u in users if (_aware(u.last_login_at) or datetime.min.replace(tzinfo=UTC)) >= month_ago),
        ),
        recent_users=outs[:RECENT_USERS],
        recent_activity=[AuditLogOut.model_validate(a) for a in activity],
        activity_last_7_days=week_count,
        app_content=OrgAdminAppContentStats(
            customized_fields=sum(len(v) for v in overrides.values()),
            disabled_modules=sorted(k for k, on in content.modules.items() if not on),
        ),
    )


# --------------------------------------------------------------------------- #
# The organization's own app content
# --------------------------------------------------------------------------- #
def _content_out(db: Session, user: User) -> OrgAppContentOut:
    org = user.organization
    overrides = get_org_overrides(db, org.id)
    return OrgAppContentOut(
        organization_id=org.id,
        organization_name=org.name,
        content=get_org_app_content(db, org.id),
        shared=get_app_content(db),
        overridden=AppContentOverrides(
            branding=sorted(overrides["branding"]),
            modules=sorted(overrides["modules"]),
            texts=sorted(overrides["texts"]),
        ),
    )


@router.get("/app-content", response_model=OrgAppContentOut)
def read_app_content(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _content_out(db, user)


@router.put("/app-content", response_model=OrgAppContentOut)
def update_app_content(payload: AppContent, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    overrides = save_org_app_content(db, user.organization_id, payload)
    count = sum(len(v) for v in overrides.values())
    audit.record(db, user, "update", "app_content", user.organization_id, f"App content customized ({count} field(s))")
    db.commit()
    return _content_out(db, user)


@router.post("/app-content/reset", response_model=OrgAppContentOut)
def reset_app_content(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    delete_org_app_content(db, user.organization_id)
    audit.record(db, user, "update", "app_content", user.organization_id, "App content reset to the shared content")
    db.commit()
    return _content_out(db, user)
