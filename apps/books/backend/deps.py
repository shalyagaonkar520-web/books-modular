"""FastAPI dependencies: DB session, current user, role guards."""

from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import Organization, OrgPanelAdmin, PlatformAdmin, User
from backend.security import decode_access_token, decode_org_panel_token, decode_platform_token
from backend.services import subscription

_bearer = HTTPBearer(auto_error=False)

ROLE_ADMIN = "admin"
ROLE_STAFF = "staff"
ROLE_VIEWER = "viewer"
# Employee is deliberately NOT in ALL_ROLES: it is a restricted portal role
# (their own payslips and profile only), not a member of the main app. Every
# router except auth and the employee portal itself is gated on ALL_ROLES via
# require_full_app_access, registered in main.py - so a new router that only
# checks get_current_user is safe by default rather than accidentally open to
# this role.
ROLE_EMPLOYEE = "employee"
ALL_ROLES = (ROLE_ADMIN, ROLE_STAFF, ROLE_VIEWER)
WRITE_ROLES = (ROLE_ADMIN, ROLE_STAFF)
# Accounting, Banking and Razorpay Payments hold sensitive financial data that
# Staff should not see at all — only Admin (full access) and Viewer (read-only,
# same as everywhere else) are let in.
FINANCIAL_ROLES = (ROLE_ADMIN, ROLE_VIEWER)


PENDING_APPROVAL_DETAIL = (
    "PENDING_APPROVAL: Your organization is awaiting approval by an administrator. You'll be able to sign in once it's approved."
)
REJECTED_DETAIL = "REGISTRATION_REJECTED: Your organization's registration was declined."


def org_approval_error(org: Organization | None) -> str | None:
    """The 403 detail for an org whose sign-up is not (yet) approved, else None."""
    if org is None or org.approval_status in (None, "approved"):
        return None
    if org.approval_status == "rejected":
        reason = (org.rejection_reason or "").strip()
        return f"{REJECTED_DETAIL} Reason: {reason}" if reason else REJECTED_DETAIL
    return PENDING_APPROVAL_DETAIL


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive or does not exist")
    org = db.get(Organization, user.organization_id)
    if org is not None and org.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization has been suspended. Contact support.")
    approval_error = org_approval_error(org)
    if approval_error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=approval_error)
    # Set when a platform admin is working inside this org via impersonation;
    # audit.record() uses it to attribute changes to the admin.
    user.impersonated_by = payload.get("imp")
    request.state.user = user
    return user


def get_current_superuser(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> PlatformAdmin:
    """Authenticate a platform super-admin from a platform-scoped bearer token.

    Kept entirely separate from tenant auth: only a token minted by the platform
    login (type ``platform_access``) is accepted, and it resolves to a
    ``PlatformAdmin`` row, never a tenant ``User``.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_platform_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    admin = db.get(PlatformAdmin, payload.get("sub"))
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrator is inactive or does not exist")
    request.state.platform_admin = admin
    return admin


require_superuser = get_current_superuser


ARCHIVED_ORG_DETAIL = "This organization has been archived. Contact support."
SUSPENDED_ORG_DETAIL = "This organization has been suspended. Contact support."


def org_panel_access_error(org: Organization | None) -> str | None:
    """Why an organization's admin panel is closed (the 403 detail), else None.

    The panel is open only for an approved organization that is neither
    archived nor suspended.
    """
    if org is None:
        return None
    if org.deleted_at is not None:
        return ARCHIVED_ORG_DETAIL
    if org.is_suspended:
        return SUSPENDED_ORG_DETAIL
    return org_approval_error(org)


def get_current_org_panel_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> OrgPanelAdmin:
    """Authenticate an organization admin-panel login.

    Only a token minted by the panel login (type ``org_panel_access``) is
    accepted - tenant ``access`` and ``platform_access`` tokens are not - and
    it resolves to an ``OrgPanelAdmin`` of exactly one organization.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_org_panel_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    admin = db.get(OrgPanelAdmin, payload.get("sub"))
    if not admin or not admin.is_active or admin.organization_id != payload.get("org"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrator is inactive or does not exist")
    org = db.get(Organization, admin.organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Organization does not exist")
    error = org_panel_access_error(org)
    if error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)
    request.state.org_panel_admin = admin
    return admin


def ensure_subscription_access(user: User) -> None:
    """HTTP 402 ``subscription_required`` once the org's trial is over without an active plan.

    Applied by every role guard below, so it covers every router registered
    with require_full_app_access in main.py and the individually guarded
    payments / Razorpay endpoints. Auth, app content, the public site and
    /api/subscription only use get_current_user and stay reachable, so a
    locked organization can still sign in and choose a plan.
    """
    org = user.organization
    if subscription.is_locked(org):
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=subscription.lock_detail(org))


def require_subscription(user: User = Depends(get_current_user)) -> User:
    """Any signed-in role, but only while the organization's app is not locked."""
    ensure_subscription_access(user)
    return user


def require_roles(*roles: str):
    allowed: Iterable[str] = roles or ALL_ROLES

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        ensure_subscription_access(user)
        return user

    return _guard


require_write = require_roles(*WRITE_ROLES)
require_admin = require_roles(ROLE_ADMIN)
# Read access to Accounting / Banking / Razorpay Payments: Admin and Viewer only.
require_financial_read = require_roles(*FINANCIAL_ROLES)
# Write access to those same areas: Admin only (Staff is blocked entirely,
# Viewer was already read-only).
require_financial_write = require_admin
# The main application, as a whole: every router except auth and the employee
# portal requires this at the router level (see main.py), so Employee - a
# portal-only role - is blocked everywhere by default rather than by omission.
require_full_app_access = require_roles(*ALL_ROLES)
