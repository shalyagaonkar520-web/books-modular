"""The signed-in organization's subscription: trial state, plan and plan requests.

Deliberately NOT behind the subscription lock (see main.py): a locked
organization's admin must still be able to choose a plan. Every role may read;
only a tenant admin may request or cancel a plan.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ROLE_ADMIN, get_current_user
from backend.models import Organization, User
from backend.schemas.subscription import SubscriptionOut, SubscriptionRequestIn
from backend.services import audit, module_pricing
from backend.services import subscription as subs

router = APIRouter(prefix="/api/subscription", tags=["Subscription"])


def _org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def _require_admin(user: User) -> None:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage the subscription")


@router.get("", response_model=SubscriptionOut)
def get_subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return subs.summary(_org(db, user), user)


@router.post("/request", response_model=SubscriptionOut)
def request_subscription(payload: SubscriptionRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ask a super-admin for a plan (replaces a pending request)."""
    _require_admin(user)
    org = _org(db, user)
    priced = subs.request_plan(org, payload.modules, payload.billing_cycle)
    audit.record(db, user, "request", "subscription", org.id, f"Subscription requested: {module_pricing.describe(priced)}")
    db.commit()
    db.refresh(org)
    return subs.summary(org, user)


@router.delete("/request", response_model=SubscriptionOut)
def cancel_subscription_request(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    org = _org(db, user)
    if subs.pending_request(org) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "There is no pending subscription request")
    subs.cancel_request(org)
    audit.record(db, user, "cancel", "subscription", org.id, "Subscription request cancelled")
    db.commit()
    db.refresh(org)
    return subs.summary(org, user)
