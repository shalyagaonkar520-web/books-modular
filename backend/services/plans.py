"""Plans by number of users, their prices, and the user limit.

Three plans (up to 100 / 500 / 1000 users, every feature) and a custom plan
(any number of users, chosen features). Each plan also has file storage
(``storageGb``, for uploaded documents); a custom plan gets the storage of the
smallest plan that covers its users. The super admin edits prices and the
payment details shown to organizations (platform setting ``subscription_plans``).

Custom price: the price of the smallest plan that covers the users (above the
largest plan: its price plus ``per100Over`` for every 100 users more), scaled by
the share of features chosen, never below ``customMinimum``.
"""

from __future__ import annotations

import json
import math
from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import Organization, User
from backend.services import module_pricing, platform_settings

SETTINGS_KEY = "subscription_plans"
CUSTOM = "custom"
MAX_USERS = 100000

DEFAULTS: Dict[str, Any] = {
    "currency": "INR",
    "tiers": [
        {"key": "u100", "label": "Starter", "users": 100, "monthly": 299, "storageGb": 10},
        {"key": "u500", "label": "Business", "users": 500, "monthly": 599, "storageGb": 50},
        {"key": "u1000", "label": "Enterprise", "users": 1000, "monthly": 999, "storageGb": 200},
    ],
    "per100Over": 99,
    "customMinimum": 99,
    "yearlyMonths": 10,
    "payment": {
        "upiId": "",
        "payeeName": "",
        "bankDetails": "",
        "note": "Pay the amount, then enter the UPI / bank reference (UTR) below.",
    },
}


def config(db: Session) -> Dict[str, Any]:
    raw = platform_settings.get_value(db, SETTINGS_KEY)
    data = dict(DEFAULTS)
    if raw:
        try:
            stored = json.loads(raw)
            if isinstance(stored, dict):
                data.update({k: v for k, v in stored.items() if k in DEFAULTS})
                data["payment"] = {**DEFAULTS["payment"], **(stored.get("payment") or {})}
        except ValueError:
            pass
    # Plans saved before storage existed get the default storage of their tier.
    default_storage = {t["key"]: t["storageGb"] for t in DEFAULTS["tiers"]}
    data["tiers"] = sorted(
        ({**t, "storageGb": t.get("storageGb", default_storage.get(t.get("key"), 10))} for t in data["tiers"]),
        key=lambda t: t["users"],
    )
    return data


def save_config(db: Session, new: Dict[str, Any]) -> Dict[str, Any]:
    tiers = new.get("tiers") or []
    keys = [t.get("key") for t in tiers]
    if len(tiers) != 3 or set(keys) != {"u100", "u500", "u1000"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the three plans u100, u500 and u1000.")
    for t in tiers:
        if not (1 <= int(t.get("users", 0)) <= MAX_USERS) or float(t.get("monthly", -1)) < 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Each plan needs users between 1 and 100000 and a price of 0 or more."
            )
        if "storageGb" in t and not (1 <= int(t["storageGb"]) <= 100000):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each plan's storage must be between 1 and 100000 GB.")
    for k in ("per100Over", "customMinimum", "yearlyMonths"):
        if float(new.get(k, 0)) < 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{k} cannot be negative.")
    merged = {**config(db), **{k: v for k, v in new.items() if k in DEFAULTS}}
    platform_settings.set_value(db, SETTINGS_KEY, json.dumps(merged))
    return config(db)


def tier(db: Session, key: str) -> Optional[Dict[str, Any]]:
    return next((t for t in config(db)["tiers"] if t["key"] == key), None)


def _base_for_users(cfg: Dict[str, Any], users: int) -> float:
    tiers = cfg["tiers"]
    for t in tiers:
        if users <= t["users"]:
            return float(t["monthly"])
    top = tiers[-1]
    return float(top["monthly"]) + math.ceil((users - top["users"]) / 100) * float(cfg["per100Over"])


def _storage_for_users(cfg: Dict[str, Any], users: int) -> int:
    """The storage (GB) of the smallest plan that covers ``users`` (the largest plan's above it)."""
    for t in cfg["tiers"]:
        if users <= t["users"]:
            return int(t["storageGb"])
    return int(cfg["tiers"][-1]["storageGb"])


def quote(
    db: Session, plan_key: str, billing_cycle: str, users: Optional[int] = None, modules: Optional[Iterable[str]] = None
) -> Dict[str, Any]:
    """Price of a plan: {planKey, maxUsers, modules, billingCycle, monthlyPrice, planPrice}."""
    if billing_cycle not in ("monthly", "yearly"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Billing cycle must be monthly or yearly.")
    from backend.services import permissions

    cfg = config(db)
    every = list(permissions.FEATURE_KEYS)
    features: Optional[List[str]] = None
    if plan_key == CUSTOM:
        if users is None or not 1 <= users <= MAX_USERS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Choose between 1 and {MAX_USERS} users.")
        unknown = sorted(set(modules or []) - set(every))
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown feature(s): {', '.join(unknown)}")
        features = sorted(set(modules or []) | set(permissions.CORE_FEATURES), key=every.index)
        monthly = max(float(cfg["customMinimum"]), math.ceil(_base_for_users(cfg, users) * len(features) / len(every)))
        max_users = users
        storage_gb = _storage_for_users(cfg, users)
    else:
        t = tier(db, plan_key)
        if t is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown plan.")
        monthly, max_users, storage_gb = float(t["monthly"]), int(t["users"]), int(t["storageGb"])
    plan_price = monthly * (float(cfg["yearlyMonths"]) if billing_cycle == "yearly" else 1)
    return {
        "planKey": plan_key,
        "maxUsers": max_users,
        "storageGb": storage_gb,
        # Every module stays switched on; a custom plan is limited by ``features``.
        "modules": list(module_pricing.module_keys()),
        "features": features,
        "billingCycle": billing_cycle,
        "monthlyPrice": round(monthly, 2),
        "planPrice": round(plan_price, 2),
    }


def catalog(db: Session) -> Dict[str, Any]:
    """What the plan page shows: plans, custom rules, the features to choose from and how to pay."""
    from backend.services import permissions

    from backend.services.razorpay_service import get_razorpay_service

    cfg = config(db)
    return {
        **cfg,
        "features": [{**f, "core": f["key"] in permissions.CORE_FEATURES} for f in permissions.catalog()],
        # The free trial a new organization gets (it has the smallest plan's users and storage).
        "trialDays": platform_settings.trial_days(db),
        # Razorpay is set up: plans are paid online and start at once.
        "onlinePayment": get_razorpay_service().is_configured,
    }


# --------------------------------------------------------------------------- #
# The user limit
# --------------------------------------------------------------------------- #
def user_limit(db: Session, org: Organization) -> Optional[int]:
    """Most active logins allowed: the plan's, else (trial) the smallest plan's; None = no cap."""
    from backend.services import subscription

    if org.subscription_status == subscription.STATUS_ACTIVE:
        return org.max_users
    return int(config(db)["tiers"][0]["users"])


def users_used(db: Session, org_id: str) -> int:
    """Active logins that count against the limit (not employee-portal or app keys)."""
    return (
        db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.organization_id == org_id, User.is_active.is_(True), User.role.notin_(("integration", "employee")))
        )
        or 0
    )


def storage_limit_bytes(db: Session, org: Organization) -> Optional[int]:
    """File storage allowed: the plan's (by its tier, or a custom plan's users), else (trial) the
    smallest plan's; None = no cap (an active plan from before plans by users)."""
    from backend.services import subscription

    cfg = config(db)
    if org.subscription_status != subscription.STATUS_ACTIVE:
        return int(cfg["tiers"][0]["storageGb"]) * 1024**3
    t = next((t for t in cfg["tiers"] if t["key"] == org.plan_key), None)
    if t is not None:
        return int(t["storageGb"]) * 1024**3
    return _storage_for_users(cfg, org.max_users) * 1024**3 if org.max_users else None


def storage_used_bytes(db: Session, org_id: str) -> int:
    """Bytes of every document the organization has uploaded."""
    from backend.models import Document

    return int(db.scalar(select(func.coalesce(func.sum(Document.size_bytes), 0)).where(Document.organization_id == org_id)) or 0)


def public_catalog(db: Session) -> Dict[str, Any]:
    """The plans as the public website shows them (no payment details)."""
    cfg = config(db)
    return {k: cfg[k] for k in ("currency", "tiers", "per100Over", "customMinimum", "yearlyMonths")}


def check_room_for(db: Session, org: Organization, adding: int = 1) -> None:
    """Refuse a new or re-activated login that would go over the plan's user limit."""
    limit = user_limit(db, org)
    used = users_used(db, org.id)
    if limit is not None and used + adding > limit:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Your plan allows {limit} users and {used} are in use. Choose a bigger plan, or send a request "
            "to the platform administrator from the admin panel (Requests).",
        )


def module_labels() -> List[Dict[str, str]]:
    return [{"key": m["key"], "label": m["label"]} for m in module_pricing.catalog()["modules"]]


def pay_qr(db: Session, amount: float, org_name: str) -> Dict[str, Any]:
    """The platform's UPI QR for paying ``amount`` (an SVG), or none when no UPI ID is set."""
    from decimal import Decimal

    from backend.services import upi

    pay = config(db)["payment"]
    upi_id = (pay.get("upiId") or "").strip()
    if not upi_id:
        return {"svg": None, "uri": None}
    uri = upi.pay_uri(upi_id, pay.get("payeeName") or "Rooman Books", Decimal(str(round(amount, 2))), f"Books plan {org_name}"[:80])
    return {"svg": upi.qr_svg(uri, 220), "uri": uri}
