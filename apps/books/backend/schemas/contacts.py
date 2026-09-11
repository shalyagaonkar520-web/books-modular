from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas.common import APIModel

ContactType = Literal["customer", "vendor"]
GstTreatment = Literal["registered_business", "unregistered", "consumer", "overseas", "sez"]


def _validate_person_name(value: Optional[str], label: str) -> Optional[str]:
    """Names are people, not codes - reject digits so "Shivani 123" is caught at entry.

    Only applies to the name fields; company_name is left alone so businesses
    that genuinely contain digits (3M, 7-Eleven) can still be recorded.
    """
    if value is None:
        return value
    if any(ch.isdigit() for ch in value):
        raise ValueError(f"{label} cannot contain numbers")
    return value


class ContactBase(APIModel):
    type: ContactType
    display_name: str = Field(min_length=1, max_length=200)
    company_name: Optional[str] = Field(default=None, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    gstin: Optional[str] = Field(default=None, max_length=20)
    pan: Optional[str] = Field(default=None, max_length=20)
    gst_treatment: GstTreatment = "unregistered"
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    notes: Optional[str] = None


class ContactCreate(ContactBase):
    # Deliberately on the input models only. ContactOut also extends
    # ContactBase, and validating on the way out would make any existing row
    # whose name contains a digit unreadable - a bulk import or older record
    # would break the whole contacts list instead of just being flagged here.
    @field_validator("display_name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _validate_person_name(value, "Name")

    @field_validator("contact_person")
    @classmethod
    def _contact_person(cls, value: Optional[str]) -> Optional[str]:
        return _validate_person_name(value, "Contact person name")


class ContactUpdate(APIModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    gst_treatment: Optional[GstTreatment] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    notes: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        return _validate_person_name(value, "Name")

    @field_validator("contact_person")
    @classmethod
    def _contact_person(cls, value: Optional[str]) -> Optional[str]:
        return _validate_person_name(value, "Contact person name")


class ContactOut(ContactBase):
    id: str
    is_active: bool
    outstanding_balance: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime


class ContactSummary(APIModel):
    contact: ContactOut
    total_invoiced: Decimal
    total_paid: Decimal
    outstanding: Decimal
    overdue: Decimal
    document_count: int
