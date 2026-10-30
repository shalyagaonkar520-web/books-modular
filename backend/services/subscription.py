"""Organization subscriptions: free trial, plan requests and the app lock.

Lifecycle (columns documented on the Organization model):

1. A new organization is on ``trial``. The trial (``trial_days`` platform
   setting, default 3) starts when the organization becomes usable - at
   sign-up without the approval gate, otherwise when a super-admin approves
   it - and covers every module.
2. Its admin requests a plan (modules + monthly/yearly billing); the request
   waits in ``pending_request`` for a super-admin, who accepts it (the plan
   becomes active and the modules are switched to exactly the plan's) or
   rejects it (``subscription_note`` keeps the reason).
3. Lock rule: an organization that is not ``active`` and whose trial is over is
   "expired" and its tenant app answers HTTP 402 ``subscription_required``
   (see deps.require_roles) until a plan is accepted or the trial extended.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional

from sqlalchemy.orm import Session

from backend.models import Organization, User
from backend.services import module_pricing, platform_settings
from backend.services.app_content import set_org_modules

STATUS_TRIAL = "trial"
STATUS_ACTIVE = "active"
STATUS_EXPIRED = "expired"  # derived, never stored

LOCKED_MESSAGE = "Your organization's plan has expired. Ask your organization to renew it to keep using the app."


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _money(value) -> Optional[float]:
    return None if value is None else float(value)


def effective_status(org: Organization, now: Optional[datetime] = None) -> str:
    """``active``, ``trial`` or the derived ``expired``.

    A trial that has not started yet (awaiting approval: ``trial_ends_at`` is
    NULL) counts as ``trial``; such an organization cannot sign in anyway.
    """
    if org.subscription_status == STATUS_ACTIVE:
        # A paid month / year ends; an open-ended plan (from before periods) does not.
        plan_ends = _aware(org.plan_ends_at)
        if plan_ends is not None and plan_ends <= (now or _now()):
            return STATUS_EXPIRED
        return STATUS_ACTIVE
    ends = _aware(org.trial_ends_at)
    if ends is None or ends > (now or _now()):
        return STATUS_TRIAL
    return STATUS_EXPIRED


def is_locked(org: Optional[Organization], now: Optional[datetime] = None) -> bool:
    return org is not None and effective_status(org, now) == STATUS_EXPIRED


def lock_detail(org: Organization) -> Dict[str, Any]:
    """The HTTP 402 detail for a locked organization."""
    return {"code": "subscription_required", "status": effective_status(org), "message": LOCKED_MESSAGE}


def trial_days_left(org: Organization, now: Optional[datetime] = None) -> Optional[int]:
    ends = _aware(org.trial_ends_at)
    if ends is None or org.subscription_status == STATUS_ACTIVE:
        return None
    seconds = (ends - (now or _now())).total_seconds()
    return max(0, math.ceil(seconds / 86400))


def start_trial(db: Session, org: Organization, now: Optional[datetime] = None) -> None:
    """Start the free trial now (a no-op once it has started or the org is active)."""
    if org.subscription_status == STATUS_ACTIVE or org.trial_ends_at is not None:
        return
    org.subscription_status = STATUS_TRIAL
    org.trial_ends_at = (now or _now()) + timedelta(days=platform_settings.trial_days(db))


def extend_trial(org: Organization, days: int, now: Optional[datetime] = None) -> None:
    """``trial_ends_at = max(now, current end) + days``; a non-active org goes back on trial."""
    now = now or _now()
    current = _aware(org.trial_ends_at)
    org.trial_ends_at = max(now, current or now) + timedelta(days=days)
    if org.subscription_status != STATUS_ACTIVE:
        org.subscription_status = STATUS_TRIAL


# --------------------------------------------------------------------------- #
# Plans and requests
# --------------------------------------------------------------------------- #
def active_plan(org: Organization) -> Optional[Dict[str, Any]]:
    """The accepted plan, or None (on trial, or an org from before plans)."""
    modules = module_pricing.parse_stored(org.requested_modules)
    if org.subscription_status != STATUS_ACTIVE or modules is None:
        return None
    return {
        "modules": modules,
        "billingCycle": org.billing_cycle or "monthly",
        "monthlyPrice": _money(org.monthly_price),
        "planPrice": _money(org.plan_price if org.plan_price is not None else org.monthly_price),
    }


def paid_modules(org: Optional[Organization]) -> Optional[set]:
    """Module keys of the accepted plan, or None when every module is open (trial, or an org from before plans).

    The core modules are always part of it, so one added to the catalog later
    (the Point of Sale) reaches plans accepted before it existed.
    """
    plan = active_plan(org) if org is not None else None
    return set(plan["modules"]) | set(module_pricing.core_keys()) if plan else None


def pending_request(org: Organization) -> Optional[Dict[str, Any]]:
    if not org.pending_request:
        return None
    try:
        data = json.loads(org.pending_request)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("modules"), list):
        return None
    return {
        "modules": [str(m) for m in data["modules"]],
        "billingCycle": data.get("billingCycle") or "monthly",
        "monthlyPrice": data.get("monthlyPrice"),
        "planPrice": data.get("planPrice"),
        "requestedAt": data.get("requestedAt"),
        "planKey": data.get("planKey"),
        "maxUsers": data.get("maxUsers"),
        "paymentReference": data.get("paymentReference"),
        "features": data.get("features"),
    }


def last_rejection(org: Organization) -> Optional[Dict[str, Any]]:
    if not org.subscription_note:
        return None
    return {"reason": org.subscription_note, "decidedAt": org.subscription_decided_at}


def request_plan(org: Organization, modules: Iterable[str], billing_cycle: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Store (or replace) the organization's pending plan request (not committed)."""
    now = now or _now()
    priced = module_pricing.quote(modules, billing_cycle)
    org.pending_request = json.dumps(
        {
            "modules": priced["modules"],
            "billingCycle": priced["billingCycle"],
            "monthlyPrice": priced["monthlyPrice"],
            "planPrice": priced["planPrice"],
            "requestedAt": now.isoformat(),
        }
    )
    org.subscription_requested_at = now
    org.subscription_note = None
    return priced


def request_users_plan(
    db: Session,
    org: Organization,
    plan_key: str,
    billing_cycle: str,
    payment_reference: str,
    users: Optional[int] = None,
    modules: Optional[Iterable[str]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Store a plan-by-users request with its payment reference, for a super admin to check and accept (not committed)."""
    from backend.services import plans

    now = now or _now()
    priced = plans.quote(db, plan_key, billing_cycle, users, modules)
    org.pending_request = json.dumps({**priced, "paymentReference": payment_reference, "requestedAt": now.isoformat()})
    org.subscription_requested_at = now
    org.subscription_note = None
    return priced


def _add_months(start: datetime, months: int) -> datetime:
    month0 = start.month - 1 + months
    year, month = start.year + month0 // 12, month0 % 12 + 1
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return start.replace(year=year, month=month, day=min(start.day, days))


def period_end(org: Organization, cycle: str, now: datetime) -> datetime:
    """A new month / year from today, or on top of the current paid period when renewing early."""
    current = _aware(org.plan_ends_at) if org.subscription_status == STATUS_ACTIVE else None
    start = current if current and current > now else now
    return _add_months(start, 12 if cycle == "yearly" else 1)


def set_plan(
    db: Session,
    org: Organization,
    plan_key: Optional[str],
    max_users: Optional[int],
    billing_cycle: str,
    monthly_price: Optional[float],
    plan_ends_at: Optional[datetime],
    modules: Optional[Iterable[str]] = None,
    now: Optional[datetime] = None,
) -> None:
    """Make the organization's plan exactly this (super admin; not committed)."""
    from backend.services import plans

    now = now or _now()
    chosen = list(modules) if modules is not None else module_pricing.module_keys()
    module_pricing.apply_to_org(db, org, chosen, billing_cycle)
    if monthly_price is not None:
        months = float(plans.config(db)["yearlyMonths"]) if billing_cycle == "yearly" else 1
        org.monthly_price = Decimal(str(round(monthly_price, 2)))
        org.plan_price = Decimal(str(round(monthly_price * months, 2)))
    org.plan_key = plan_key
    org.max_users = max_users
    org.plan_ends_at = plan_ends_at
    org.plan_features = None
    org.subscription_status = STATUS_ACTIVE
    org.subscription_decided_at = now
    org.subscription_note = None
    cancel_request(org)


def cancel_request(org: Organization) -> None:
    org.pending_request = None
    org.subscription_requested_at = None


def approve(
    db: Session,
    org: Organization,
    modules: Optional[Iterable[str]] = None,
    billing_cycle: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Activate a plan: the pending request, or the given modules/cycle on top of it.

    Raises ValueError when there is neither a pending request nor modules.
    """
    pending = pending_request(org)
    chosen = list(modules) if modules is not None else (pending["modules"] if pending else None)
    if not chosen:
        raise ValueError("There is no pending subscription request; choose the modules to activate.")
    cycle = billing_cycle or (pending["billingCycle"] if pending else None) or org.billing_cycle or "monthly"
    if pending and pending.get("planKey"):
        # A plan by users: its user limit, the price quoted and paid, and a new month / year.
        now = now or _now()
        priced = module_pricing.apply_to_org(db, org, chosen, cycle)
        if cycle == pending["billingCycle"] and pending.get("monthlyPrice") is not None:
            org.monthly_price = Decimal(str(pending["monthlyPrice"]))
            org.plan_price = Decimal(str(pending["planPrice"]))
            priced = {**priced, "monthlyPrice": pending["monthlyPrice"], "planPrice": pending["planPrice"]}
        org.plan_ends_at = period_end(org, cycle, now)
        org.plan_features = json.dumps(pending["features"]) if pending.get("features") else None
        org.plan_key = pending["planKey"]
        org.max_users = pending.get("maxUsers")
        org.subscription_status = STATUS_ACTIVE
        org.subscription_decided_at = now
        org.subscription_note = None
        cancel_request(org)
        return priced
    priced = module_pricing.apply_to_org(db, org, chosen, cycle)
    org.subscription_status = STATUS_ACTIVE
    org.subscription_decided_at = now or _now()
    org.subscription_note = None
    cancel_request(org)
    return priced


def reject(org: Organization, reason: str, now: Optional[datetime] = None) -> None:
    """Decline the pending request; the organization keeps its trial or plan."""
    cancel_request(org)
    org.subscription_note = reason
    org.subscription_decided_at = now or _now()


def cancel_plan(db: Session, org: Organization, now: Optional[datetime] = None) -> None:
    """End an active plan: back to an expired trial (locked), every module switched back on."""
    now = now or _now()
    org.subscription_status = STATUS_TRIAL
    ends = _aware(org.trial_ends_at)
    if ends is None or ends > now:
        org.trial_ends_at = now
    org.requested_modules = None
    org.billing_cycle = None
    org.monthly_price = None
    org.plan_price = None
    org.plan_key = None
    org.max_users = None
    org.plan_ends_at = None
    org.plan_features = None
    org.subscription_decided_at = now
    set_org_modules(db, org.id, module_pricing.module_keys())


# --------------------------------------------------------------------------- #
# Read model
# --------------------------------------------------------------------------- #
def summary(org: Organization, user: Optional[User] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    """The tenant-facing subscription state (GET /api/subscription)."""
    now = now or _now()
    status = effective_status(org, now)
    return {
        "status": status,
        "trialEndsAt": org.trial_ends_at,
        "trialDaysLeft": trial_days_left(org, now),
        "locked": status == STATUS_EXPIRED,
        "plan": active_plan(org),
        "pendingRequest": pending_request(org),
        "lastRejection": last_rejection(org),
        "canManage": user is not None and user.role == "admin",
        "planKey": org.plan_key,
        "maxUsers": org.max_users,
        "planEndsAt": org.plan_ends_at,
        "planDaysLeft": plan_days_left(org, now),
        "planFeatures": plan_features(org),
        **_usage(org),
    }


def _usage(org: Organization) -> Dict[str, Any]:
    from sqlalchemy.orm import object_session

    from backend.services import plans

    db = object_session(org)
    if db is None:
        return {}
    return {
        "usersUsed": plans.users_used(db, org.id),
        "userLimit": plans.user_limit(db, org),
        "storageUsedBytes": plans.storage_used_bytes(db, org.id),
        "storageLimitBytes": plans.storage_limit_bytes(db, org),
    }


def plan_features(org: Optional[Organization]) -> Optional[list]:
    """The custom plan's features while it is active, or None (every feature)."""
    if org is None or not org.plan_features or org.subscription_status != STATUS_ACTIVE:
        return None
    try:
        keys = json.loads(org.plan_features)
    except ValueError:
        return None
    return [str(k) for k in keys] if isinstance(keys, list) else None


def plan_days_left(org: Organization, now: Optional[datetime] = None) -> Optional[int]:
    ends = _aware(org.plan_ends_at)
    if ends is None or org.subscription_status != STATUS_ACTIVE:
        return None
    return max(0, math.ceil((ends - (now or _now())).total_seconds() / 86400))
