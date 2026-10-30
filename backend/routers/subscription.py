"""The signed-in organization's subscription: trial state, plan and plan requests.

Deliberately NOT behind the subscription lock (see main.py): a locked
organization's admin must still be able to choose a plan. Every role may read;
only a tenant admin may request, pay for or cancel a plan. A plan paid online
(Razorpay checkout) starts at once; see services/plan_payments.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from razorpay.errors import BadRequestError, GatewayError, ServerError
from requests.exceptions import RequestException
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ROLE_ADMIN, get_current_user
from backend.models import Organization, User
from backend.schemas.subscription import PlanCheckoutConfirmIn, PlanCheckoutIn, PlanRequestIn, SubscriptionOut, SubscriptionRequestIn
from backend.services import audit, module_pricing, plan_payments, plans
from backend.services import subscription as subs
from backend.services.razorpay_service import RazorpayNotConfigured

logger = logging.getLogger(__name__)

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
    pending = subs.pending_request(org)
    wanted = module_pricing.quote(payload.modules, payload.billing_cycle)
    if pending and pending["billingCycle"] == wanted["billingCycle"] and set(pending["modules"]) == set(wanted["modules"]):
        # The same request again (e.g. a double click): nothing to change or log.
        return subs.summary(org, user)
    priced = subs.request_plan(org, payload.modules, payload.billing_cycle)
    audit.record(db, user, "request", "subscription", org.id, f"Subscription requested: {module_pricing.describe(priced)}")
    db.commit()
    db.refresh(org)
    return subs.summary(org, user)


@router.get("/plans")
def plan_catalog(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The plans by users, the custom-plan rules, the features and how to pay."""
    return plans.catalog(db)


@router.get("/quote")
def plan_quote(
    plan_key: str,
    billing_cycle: str = "monthly",
    users: int | None = None,
    modules: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The price of a plan before paying (modules: comma separated, custom plan only)."""
    return plans.quote(db, plan_key, billing_cycle, users, [m for m in (modules or "").split(",") if m])


@router.get("/pay-qr")
def pay_qr(amount: float, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """UPI QR for paying a plan's amount to the platform."""
    return plans.pay_qr(db, amount, _org(db, user).name)


@router.post("/plan-request", response_model=SubscriptionOut)
def request_users_plan(payload: PlanRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ask for a plan by users after paying; a super admin checks the payment and accepts it."""
    _require_admin(user)
    org = _org(db, user)
    priced = subs.request_users_plan(
        db, org, payload.plan_key, payload.billing_cycle, payload.payment_reference.strip(), payload.users, payload.modules
    )
    audit.record(
        db,
        user,
        "request",
        "subscription",
        org.id,
        f"Plan requested: {priced['planKey']} for {priced['maxUsers']} users, {priced['billingCycle']} "
        f"{priced['planPrice']:.2f}, payment ref {payload.payment_reference.strip()}",
    )
    db.commit()
    db.refresh(org)
    return subs.summary(org, user)


@router.post("/checkout")
def plan_checkout(payload: PlanCheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Start paying for a plan online: a Razorpay order for the plan's price."""
    _require_admin(user)
    org = _org(db, user)
    try:
        order = plan_payments.create_order(db, org, user, payload.plan_key, payload.billing_cycle, payload.users, payload.modules)
    except RazorpayNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online payment is not set up yet. Contact support.") from exc
    except (BadRequestError, GatewayError, ServerError, RequestException) as exc:
        logger.exception("Razorpay order for a plan failed.")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach Razorpay. Please try again.") from exc
    db.commit()
    return order


@router.post("/checkout/confirm", response_model=SubscriptionOut)
def plan_checkout_confirm(payload: PlanCheckoutConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """After Razorpay's checkout succeeds: check the payment and start the plan straight away."""
    _require_admin(user)
    org = _org(db, user)
    plan_payments.confirm(db, org, user, payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature)
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
