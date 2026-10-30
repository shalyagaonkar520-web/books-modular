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
    # A plan by users (services/plans): which plan, how many users, and the payment to check.
    plan_key: Optional[str] = None
    max_users: Optional[int] = None
    payment_reference: Optional[str] = None
    features: Optional[List[str]] = None


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
    plan_key: Optional[str] = None
    max_users: Optional[int] = None
    plan_ends_at: Optional[datetime] = None
    plan_days_left: Optional[int] = None
    # A custom plan's features; None = every feature.
    plan_features: Optional[List[str]] = None
    # Logins in use and the most allowed now (the plan's, or the trial's); None = no cap.
    users_used: int = 0
    user_limit: Optional[int] = None
    # Uploaded documents against the plan's storage (the trial's: the smallest plan's).
    storage_used_bytes: int = 0
    storage_limit_bytes: Optional[int] = None


class SubscriptionRequestIn(APIModel):
    modules: List[str] = Field(max_length=50)
    billing_cycle: BillingCycle = "monthly"

    @field_validator("modules")
    @classmethod
    def _modules(cls, value):
        return module_pricing.validate_selection(value)


class PlanRequestIn(APIModel):
    """Choose a plan by users and say how it was paid (UPI / bank reference)."""

    plan_key: Literal["u100", "u500", "u1000", "custom"]
    billing_cycle: BillingCycle = "monthly"
    payment_reference: str = Field(min_length=4, max_length=60)
    # Custom plan only: how many users and which features.
    users: Optional[int] = Field(default=None, ge=1, le=100000)
    modules: Optional[List[str]] = Field(default=None, max_length=50)


class PlanCheckoutIn(APIModel):
    """Choose a plan by users to pay for online (Razorpay)."""

    plan_key: Literal["u100", "u500", "u1000", "custom"]
    billing_cycle: BillingCycle = "monthly"
    # Custom plan only: how many users and which features.
    users: Optional[int] = Field(default=None, ge=1, le=100000)
    modules: Optional[List[str]] = Field(default=None, max_length=50)


class PlanCheckoutConfirmIn(APIModel):
    """What Razorpay's checkout hands back after a successful payment."""

    razorpay_order_id: str = Field(min_length=1, max_length=64)
    razorpay_payment_id: str = Field(min_length=1, max_length=64)
    razorpay_signature: str = Field(min_length=1, max_length=255)


class SetPlanRequest(APIModel):
    """Super admin: make an organization's plan exactly this."""

    plan_key: Optional[Literal["u100", "u500", "u1000", "custom"]] = None
    max_users: Optional[int] = Field(default=None, ge=1, le=100000)
    billing_cycle: BillingCycle = "monthly"
    monthly_price: Optional[float] = Field(default=None, ge=0, le=10000000)
    plan_ends_at: Optional[datetime] = None
    # Omitted = every feature.
    modules: Optional[List[str]] = Field(default=None, max_length=50)

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
    plan_key: Optional[str] = None
    max_users: Optional[int] = None
    payment_reference: Optional[str] = None
