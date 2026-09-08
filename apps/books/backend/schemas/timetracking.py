from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field

from backend.schemas.common import APIModel


class ProjectCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    customer_id: Optional[str] = None
    description: Optional[str] = None
    billing_method: Literal["hourly", "fixed"] = "hourly"
    hourly_rate: Decimal = Field(default=Decimal("0"), ge=0)
    budget_hours: Decimal = Field(default=Decimal("0"), ge=0)


class ProjectUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    customer_id: Optional[str] = None
    description: Optional[str] = None
    billing_method: Optional[Literal["hourly", "fixed"]] = None
    hourly_rate: Optional[Decimal] = Field(default=None, ge=0)
    budget_hours: Optional[Decimal] = Field(default=None, ge=0)
    status: Optional[Literal["active", "completed", "on_hold"]] = None


class ProjectOut(APIModel):
    id: str
    name: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    description: Optional[str] = None
    billing_method: str
    hourly_rate: Decimal
    budget_hours: Decimal
    status: str
    logged_hours: Decimal = Decimal("0")
    billable_hours: Decimal = Decimal("0")
    unbilled_hours: Decimal = Decimal("0")
    unbilled_amount: Decimal = Decimal("0")
    created_at: datetime


class TimeEntryCreate(APIModel):
    project_id: str
    date: date
    hours: Decimal = Field(gt=0, le=24)
    description: Optional[str] = None
    is_billable: bool = True
    user_id: Optional[str] = Field(default=None, description="Admins may log time for other users")


class TimeEntryUpdate(APIModel):
    date: Optional[date] = None
    hours: Optional[Decimal] = Field(default=None, gt=0, le=24)
    description: Optional[str] = None
    is_billable: Optional[bool] = None


class TimeEntryOut(APIModel):
    id: str
    project_id: str
    project_name: str
    customer_name: Optional[str] = None
    user_id: str
    user_name: str
    date: date
    hours: Decimal
    description: Optional[str] = None
    is_billable: bool
    invoice_id: Optional[str] = None
    created_at: datetime


class InvoiceFromTimeRequest(APIModel):
    project_id: str
    date: date
    due_date: Optional[date] = None
    time_entry_ids: Optional[List[str]] = None
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
