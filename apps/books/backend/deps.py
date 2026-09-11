"""FastAPI dependencies: DB session, current user, role guards."""
from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.security import decode_access_token

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
    request.state.user = user
    return user


def require_roles(*roles: str):
    allowed: Iterable[str] = roles or ALL_ROLES

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
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
