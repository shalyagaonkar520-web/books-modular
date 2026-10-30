"""Paying for a plan by users online (Razorpay): the plan starts as soon as the payment is confirmed.

No super admin is involved. The server creates a Razorpay order for the price
it quoted and keeps that quote in a ``payment_events`` row (event id
``plan_order:<order id>``), so the browser can never change what is bought or
what it costs. The plan is activated by whichever arrives first, the checkout
callback (``confirm``) or the ``payment.captured`` webhook (``activate``), and
only once: the row is marked ``paid`` in the same transaction.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Organization, PaymentEvent, User
from backend.services import audit, plans
from backend.services import subscription as subs
from backend.services.razorpay_service import get_razorpay_service

logger = logging.getLogger(__name__)

PURPOSE = "subscription"
EVENT_TYPE = "subscription.order"


def _event_id(order_id: str) -> str:
    return f"plan_order:{order_id}"


def _paise(amount: Any) -> int:
    return int(round(Decimal(str(amount)) * 100))


def create_order(
    db: Session,
    org: Organization,
    user: User,
    plan_key: str,
    billing_cycle: str,
    users: Optional[int] = None,
    modules: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """A Razorpay order for the plan's price, and what the checkout needs (not committed)."""
    priced = plans.quote(db, plan_key, billing_cycle, users, modules)
    used = plans.users_used(db, org.id)
    if priced["maxUsers"] < used:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"You already have {used} users, more than this plan allows. Choose a bigger plan."
        )
    service = get_razorpay_service()
    order = service.create_order(
        amount_inr=Decimal(str(priced["planPrice"])),
        receipt=f"plan-{org.id}",
        notes={
            "purpose": PURPOSE,
            "organization_id": org.id,
            "organization_name": org.name[:200],
            "plan_key": priced["planKey"],
            "billing_cycle": priced["billingCycle"],
            "max_users": str(priced["maxUsers"]),
        },
    )
    db.add(
        PaymentEvent(
            organization_id=org.id,
            event_id=_event_id(order["id"]),
            event_type=EVENT_TYPE,
            entity_id=order["id"],
            payload=json.dumps(priced),
            status="created",
        )
    )
    cycle = "12 months" if priced["billingCycle"] == "yearly" else "1 month"
    return {
        "orderId": order["id"],
        "amount": order["amount"],
        "currency": order.get("currency", "INR"),
        "keyId": service.key_id,
        "mode": service.mode,
        "description": f"Plan for {priced['maxUsers']:,} users, {cycle}",
        "prefill": {"name": user.name, "email": user.email},
    }


def _order_event(db: Session, order_id: str) -> Optional[PaymentEvent]:
    # Locked so the checkout callback and the webhook cannot both activate it.
    return db.execute(select(PaymentEvent).where(PaymentEvent.event_id == _event_id(order_id)).with_for_update()).scalar_one_or_none()


def activate(
    db: Session, order_id: str, payment_id: str, amount_paise: Optional[int], actor: Optional[User] = None
) -> Optional[Organization]:
    """Start the plan paid for by this order (not committed).

    Returns None when the order is not a plan order. Raises ValueError when the
    amount paid is not the plan's price. Activating twice changes nothing.
    """
    evt = _order_event(db, order_id) if order_id else None
    if evt is None or evt.event_type != EVENT_TYPE:
        return None
    org = db.get(Organization, evt.organization_id)
    if org is None:
        return None
    if evt.status == "paid":
        return org
    priced = json.loads(evt.payload)
    if amount_paise is not None and amount_paise != _paise(priced["planPrice"]):
        raise ValueError(f"Payment {payment_id} is for {amount_paise} paise, not the plan's {_paise(priced['planPrice'])}.")

    now = datetime.now(UTC)
    org.pending_request = json.dumps({**priced, "paymentReference": payment_id, "requestedAt": now.isoformat()})
    subs.approve(db, org, now=now)
    evt.status = "paid"
    evt.processed_at = now
    evt.payload = json.dumps({**priced, "paymentId": payment_id})
    audit.record(
        db,
        actor,
        "approve",
        "subscription",
        org.id,
        f"Plan paid online and started: {priced['planKey']} for {priced['maxUsers']} users, {priced['billingCycle']} "
        f"{priced['planPrice']:.2f}, Razorpay payment {payment_id}",
        organization_id=org.id,
    )
    return org


def confirm(db: Session, org: Organization, user: User, order_id: str, payment_id: str, signature: str) -> Organization:
    """Check the checkout callback with Razorpay and start the plan (not committed)."""
    service = get_razorpay_service()
    if not service.verify_payment_signature(order_id=order_id, payment_id=payment_id, signature=signature):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The payment could not be verified.")
    evt = _order_event(db, order_id)
    if evt is None or evt.event_type != EVENT_TYPE or evt.organization_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This payment is not for a plan of your organization.")
    if evt.status == "paid":
        return org

    # The signature covers only order|payment; Razorpay's own record decides
    # that the money was taken and how much.
    amount: Optional[int]
    info = service.fetch_payment(payment_id)
    if info is None:
        if not service.allows_simulation:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not confirm this payment with Razorpay. Please try again.")
        amount = None  # offline development only: nothing to check against
    else:
        if info.get("order_id") != order_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This payment does not belong to the order being confirmed.")
        state = (info.get("status") or "").lower()
        if state == "authorized":
            try:
                info = service.client.payment.capture(payment_id, info["amount"], {"currency": info.get("currency", "INR")})
                state = (info.get("status") or "").lower()
            except Exception:
                logger.warning("Could not capture plan payment %s.", payment_id, exc_info=True)
        if state != "captured":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Razorpay has not confirmed this payment yet. Your plan starts automatically once it does.",
            )
        amount = int(info.get("amount") or 0)

    try:
        activate(db, order_id, payment_id, amount, actor=user)
    except ValueError as exc:
        logger.error("%s", exc)
        raise HTTPException(status.HTTP_409_CONFLICT, "The amount paid does not match the plan's price. Contact support.") from exc
    return org
