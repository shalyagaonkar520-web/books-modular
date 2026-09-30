"""Module pricing catalog: which app modules an organization pays for.

The catalog (``backend/content/module_pricing.json``) lists every switchable
app module (the same keys as the app content ``modules``) with a monthly price
and the modules it depends on. Dashboard and Settings are always included in
the base price. A yearly plan costs ``yearlyMultiplier`` months (see
services/subscription for how a plan is requested and activated).
"""

from __future__ import annotations

import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from backend.models import Organization
from backend.services.app_content import set_org_modules

PRICING_PATH = Path(__file__).resolve().parent.parent / "content" / "module_pricing.json"


@lru_cache
def catalog() -> Dict[str, Any]:
    return json.loads(PRICING_PATH.read_text(encoding="utf-8"))


def module_keys() -> List[str]:
    return [m["key"] for m in catalog()["modules"]]


def _by_key() -> Dict[str, Dict[str, Any]]:
    return {m["key"]: m for m in catalog()["modules"]}


def resolve(modules: Iterable[str]) -> List[str]:
    """The selection plus everything it requires, in catalog order.

    Raises ValueError on an unknown module key.
    """
    by_key = _by_key()
    requested = list(modules)
    unknown = sorted({m for m in requested if m not in by_key})
    if unknown:
        raise ValueError(f"Unknown module(s): {', '.join(unknown)}")
    selected: set[str] = set()
    pending = list(requested)
    while pending:
        key = pending.pop()
        if key in selected:
            continue
        selected.add(key)
        pending.extend(by_key[key].get("requires") or [])
    return [key for key in module_keys() if key in selected]


BILLING_CYCLES = ("monthly", "yearly")


def yearly_multiplier() -> int:
    """A yearly plan costs this many months (10 = two months free)."""
    return int(catalog().get("yearlyMultiplier", 12))


def quote(modules: Iterable[str], billing_cycle: str = "monthly") -> Dict[str, Any]:
    """Price a selection (requires are added first) for a billing cycle.

    ``planPrice`` is what one cycle costs: the monthly price, or
    ``yearlyMultiplier`` times it for a yearly plan.
    """
    if billing_cycle not in BILLING_CYCLES:
        raise ValueError(f"Billing cycle must be one of {', '.join(BILLING_CYCLES)}")
    resolved = resolve(modules)
    by_key = _by_key()
    base = catalog()["basePrice"]
    modules_total = sum(by_key[key]["price"] for key in resolved)
    monthly = base + modules_total
    return {
        "modules": resolved,
        "basePrice": base,
        "modulesTotal": modules_total,
        "monthlyPrice": monthly,
        "billingCycle": billing_cycle,
        "planPrice": monthly * yearly_multiplier() if billing_cycle == "yearly" else monthly,
    }


def validate_selection(modules: Optional[List[str]]) -> Optional[List[str]]:
    """Pydantic validator body: None stays None, otherwise at least one known module (requires added)."""
    if modules is None:
        return None
    if not modules:
        raise ValueError("Choose at least one module")
    return resolve(modules)


def parse_stored(value: Any) -> Optional[List[str]]:
    """Organization.requested_modules is a JSON list in a Text column (NULL = all modules)."""
    if value is None or isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    return [str(m) for m in parsed] if isinstance(parsed, list) else None


def apply_to_org(db: Session, org: Organization, modules: Iterable[str], billing_cycle: str = "monthly") -> Dict[str, Any]:
    """Make a selection the organization's active plan and switch its modules to match (not committed)."""
    priced = quote(modules, billing_cycle)
    org.requested_modules = json.dumps(priced["modules"])
    org.monthly_price = Decimal(str(priced["monthlyPrice"]))
    org.billing_cycle = priced["billingCycle"]
    org.plan_price = Decimal(str(priced["planPrice"]))
    set_org_modules(db, org.id, priced["modules"])
    return priced


def describe(priced: Dict[str, Any]) -> str:
    """Audit-log fragment, e.g. "5 modules, INR 1,494/month" or "5 modules, INR 14,940/year"."""
    count = len(priced["modules"])
    yearly = priced.get("billingCycle") == "yearly"
    price = priced.get("planPrice", priced["monthlyPrice"]) if yearly else priced["monthlyPrice"]
    return f"{count} module{'s' if count != 1 else ''}, {catalog()['currency']} {float(price):,.0f}/{'year' if yearly else catalog()['period']}"
