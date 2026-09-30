"""Request/response models for organization subscriptions (trial, plan, requests)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.schemas.common import APIModel
from backend.services import module_pricing

BillingCycle = Literal["monthly", "yearly"]


class SubscriptionPlanOut(APIModel):
    modules: List[str]
    billing_cycle: str
    monthly_price: Optional[float] = None
    plan_price: Optional[float] = None


class SubscriptionPendingOut(SubscriptionPlanOut):
    requested_at: Optional[datetime] = None


class SubscriptionRejectionOut(APIModel):
    reason: str
    decided_at: Optional[datetime] = None


class SubscriptionOut(APIModel):
    # trial | active | expired (trial over without an active plan -> locked)
    status: str
    trial_ends_at: Optional[datetime] = None
    trial_days_left: Optional[int] = None
    locked: bool
    plan: Optional[SubscriptionPlanOut] = None
    pending_request: Optional[SubscriptionPendingOut] = None
    last_rejection: Optional[SubscriptionRejectionOut] = None
    # The caller may request or cancel a plan (tenant admins only).
    can_manage: bool = False


class SubscriptionRequestIn(APIModel):
    modules: List[str] = Field(max_length=50)
    billing_cycle: BillingCycle = "monthly"

    @field_validator("modules")
    @classmethod
    def _modules(cls, value):
        return module_pricing.validate_selection(value)


class ApproveSubscriptionRequest(APIModel):
    # Omitted -> the pending request's modules / billing cycle.
    modules: Optional[List[str]] = Field(default=None, max_length=50)
    billing_cycle: Optional[BillingCycle] = None

    @field_validator("modules")
    @classmethod
    def _modules(cls, value):
        return module_pricing.validate_selection(value)


class RejectSubscriptionRequest(APIModel):
    reason: str = Field(min_length=1, max_length=500)


class ExtendTrialRequest(APIModel):
    days: int = Field(ge=1, le=90)


class SubscriptionRequestRow(APIModel):
    organization_id: str
    organization_name: str
    requested_at: Optional[datetime] = None
    modules: List[str]
    billing_cycle: str
    monthly_price: Optional[float] = None
    plan_price: Optional[float] = None
    subscription_status: str
    trial_ends_at: Optional[datetime] = None
