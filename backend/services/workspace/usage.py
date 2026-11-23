"""Claude API access for the workspace: the only place that calls the model.

Everything that makes the API cheap and safe lives here:
- ``gate`` decides, before any call, whether this employee may spend (owner switch, per-employee
  switch, monthly budgets, daily call limit, per-minute rate limit);
- ``call`` sends one request with a hard output cap and timeout, records tokens and estimated
  cost in ``ai_usage``, and maps every failure to a short message that never contains the key;
- ``cached`` / ``store_cache`` reuse non-sensitive results (routing plans, photo reads);
- the API key is read from the server environment only (config.anthropic_api_key) and is never
  logged, stored or returned.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

import anthropic
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.services import ai as ai_core
from backend.services.ratelimit import RateLimiter
from backend.workspace_models import AiCache, AiEmployee, AiOrgSettings, AiUsage

logger = logging.getLogger("roomanbooks.workspace.ai")

# USD per million tokens (input, output). Estimates for the owner's dashboard only.
DEFAULT_PRICES: Dict[str, tuple] = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
}

_limiter = RateLimiter(limit=get_settings().workspace_ai_rate_limit_per_minute, window_seconds=60)
CACHE_TTL_ROUTING = timedelta(hours=6)
CACHE_TTL_PHOTO = timedelta(days=30)


class AiRefused(Exception):
    """The call may not (or could not) be made; ``str(exc)`` is safe to show the employee."""


def reset_limiter() -> None:
    _limiter.reset()


def _prices() -> Dict[str, tuple]:
    prices = dict(DEFAULT_PRICES)
    raw = get_settings().ai_price_table.strip()
    if raw:
        try:
            for model, pair in json.loads(raw).items():
                prices[model] = (float(pair[0]), float(pair[1]))
        except (ValueError, TypeError, IndexError, AttributeError):
            logger.warning("AI_PRICE_TABLE is not valid JSON; using built-in prices")
    return prices


def estimate_cost(model: str, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> Decimal:
    inp, out = _prices().get(model, (4.0, 20.0))
    billed_in = max(input_tokens - cache_read_tokens, 0) + cache_read_tokens * 0.1
    return Decimal(str(round((billed_in * inp + output_tokens * out) / 1_000_000, 6)))


def org_settings(db: Session, org_id: str) -> AiOrgSettings:
    row = db.get(AiOrgSettings, org_id)
    if row is None:
        row = AiOrgSettings(organization_id=org_id)
        db.add(row)
        db.flush()
    return row


def _month_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def spent(db: Session, org_id: str, user_id: Optional[str] = None, since: Optional[datetime] = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(AiUsage.cost_usd), 0)).where(AiUsage.organization_id == org_id, AiUsage.created_at >= (since or _month_start()))
    if user_id:
        stmt = stmt.where(AiUsage.user_id == user_id)
    return Decimal(str(db.execute(stmt).scalar_one() or 0))


HARD_UNITS = 3  # a hard request (larger model) counts as this many of the plan's AI requests


def units_used(db: Session, org_id: str, since: Optional[datetime] = None) -> int:
    """AI requests used this month: one per Claude call, a larger-model call counts as HARD_UNITS."""
    rows = db.execute(
        select(AiUsage.feature, func.count()).where(AiUsage.organization_id == org_id, AiUsage.created_at >= (since or _month_start())).group_by(AiUsage.feature)
    ).all()
    return int(sum(n * (HARD_UNITS if str(f).endswith("_hard") else 1) for f, n in rows))


def allowance(db: Session, org_id: str) -> Dict[str, Any]:
    """What the plan includes this month, how much is used, and when it resets."""
    from backend.models import Organization
    from backend.services import plans

    limit = plans.ai_allowance(db, db.get(Organization, org_id))
    used = units_used(db, org_id)
    start = _month_start()
    resets = (start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)).date().isoformat()
    return {"requests": limit, "used": used, "remaining": None if limit is None else max(limit - used, 0), "hardCounts": HARD_UNITS, "resetsOn": resets}


def calls_today(db: Session, user_id: str) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return db.execute(select(func.count()).select_from(AiUsage).where(AiUsage.user_id == user_id, AiUsage.created_at >= start)).scalar_one()


def gate(db: Session, org_id: str, employee: AiEmployee) -> Optional[str]:
    """Why this employee may not make a Claude call right now, else None."""
    if not ai_core.configured():
        return "Smart understanding is not set up on this server, so I can only answer the quick questions I know."
    settings = org_settings(db, org_id)
    if not settings.ai_enabled:
        return "Your organization has paused AI understanding. Quick questions still work, or switch to Manual mode."
    if not employee.ai_enabled:
        return "AI is turned off for your account. Quick questions still work, or switch to Manual mode."
    plan = allowance(db, org_id)
    if plan["requests"] is not None and plan["used"] >= plan["requests"]:
        return f"Your plan's {plan['requests']:,} AI requests for this month are used up. Quick answers and Manual mode still work. Upgrade your plan, or AI requests renew on {plan['resetsOn']}."
    if spent(db, org_id) >= settings.monthly_budget_usd:
        return "The organization's monthly AI budget is used up. Quick questions still work, or switch to Manual mode."
    budget = employee.monthly_budget_usd if employee.monthly_budget_usd is not None else settings.default_employee_budget_usd
    if spent(db, org_id, employee.user_id) >= budget:
        return "Your monthly AI budget is used up. Quick questions still work, or switch to Manual mode."
    limit = employee.daily_call_limit if employee.daily_call_limit is not None else settings.default_daily_call_limit
    if employee.user_id and calls_today(db, employee.user_id) >= limit:
        return "You have reached today's AI limit. Quick questions still work, or switch to Manual mode."
    return None


def _record(db: Session, org_id: str, workspace_id: str, user_id: str, feature: str, model: str, usage: Any, ok: bool) -> AiUsage:
    inp = int(getattr(usage, "input_tokens", 0) or 0)
    out = int(getattr(usage, "output_tokens", 0) or 0)
    cached = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
    row = AiUsage(
        organization_id=org_id,
        workspace_id=workspace_id,
        user_id=user_id,
        feature=feature,
        model=model,
        input_tokens=inp,
        output_tokens=out,
        cache_read_tokens=cached,
        cost_usd=estimate_cost(model, inp, out, cached),
        ok=ok,
    )
    db.add(row)
    db.flush()
    return row


def call(
    db: Session,
    employee: AiEmployee,
    *,
    feature: str,
    model: str,
    system: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    max_tokens: Optional[int] = None,
    json_schema: Optional[Dict[str, Any]] = None,
    effort: str = "low",
):
    """One Claude request, gated, capped, timed out and metered. Raises AiRefused with a safe message."""
    settings = get_settings()
    reason = gate(db, employee.organization_id, employee)
    if reason:
        raise AiRefused(reason)
    try:
        _limiter.check(f"ws:{employee.user_id}", "You are sending requests very quickly. Wait a few seconds and try again.")
    except Exception as exc:
        raise AiRefused(getattr(exc, "detail", "Too many requests. Wait a moment.")) from exc
    kwargs: Dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens or settings.workspace_ai_max_output_tokens,
        # A short, frozen prefix: marked cacheable so repeat calls re-read it cheaply.
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": messages,
        "timeout": settings.workspace_ai_timeout_seconds,
    }
    if "-5" in model:
        kwargs["output_config"] = {"effort": effort}
        if json_schema:
            kwargs["output_config"]["format"] = {"type": "json_schema", "schema": json_schema}
    if tools:
        kwargs["tools"] = tools
    try:
        response = ai_core._client().messages.create(**kwargs)
    except anthropic.AuthenticationError:
        logger.error("Claude API rejected the configured key")  # never the key, never the exception text
        raise AiRefused("The AI service key on the server is not valid. Please tell your administrator.") from None
    except anthropic.RateLimitError:
        raise AiRefused("The AI service is busy. Try again in a minute.") from None
    except anthropic.APITimeoutError:
        raise AiRefused("The AI service took too long. Try again.") from None
    except anthropic.APIConnectionError:
        raise AiRefused("Could not reach the AI service. Try again shortly.") from None
    except anthropic.APIStatusError as exc:
        logger.warning("Claude API error status=%s", getattr(exc, "status_code", "?"))
        raise AiRefused("The AI service had a problem. Try again shortly.") from None
    except Exception as exc:  # noqa: BLE001 - HTTPException from a missing key, SDK internals
        detail = getattr(exc, "detail", None)
        logger.warning("Claude call failed: %s", type(exc).__name__)
        raise AiRefused(str(detail) if detail else "The AI service is not available right now.") from None
    _record(db, employee.organization_id, employee.workspace_id, employee.user_id or "", feature, model, getattr(response, "usage", None), True)
    if getattr(response, "stop_reason", None) == "refusal":
        raise AiRefused("The AI declined this request.")
    return response


# --------------------------------------------------------------------------- #
# Cache of reusable, non-sensitive results
# --------------------------------------------------------------------------- #
def cache_key(org_id: str, kind: str, *parts: str) -> str:
    return hashlib.sha256("|".join((org_id, kind, *parts)).encode("utf-8")).hexdigest()


def cached(db: Session, key: str) -> Optional[Any]:
    row = db.get(AiCache, key)
    if row is None:
        return None
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        db.delete(row)
        return None
    try:
        return json.loads(row.value)
    except ValueError:
        return None


def store_cache(db: Session, org_id: str, key: str, kind: str, value: Any, ttl: timedelta) -> None:
    now = datetime.now(UTC)
    row = db.get(AiCache, key)
    payload = json.dumps(value, default=str)
    if row is None:
        db.add(AiCache(key=key, organization_id=org_id, kind=kind, value=payload, created_at=now, expires_at=now + ttl))
    else:
        row.value, row.created_at, row.expires_at = payload, now, now + ttl


def response_text(response: Any) -> str:
    return "".join(b.text for b in getattr(response, "content", []) if getattr(b, "type", "") == "text").strip()


def tool_uses(response: Any) -> List[Any]:
    return [b for b in getattr(response, "content", []) if getattr(b, "type", "") == "tool_use"]
