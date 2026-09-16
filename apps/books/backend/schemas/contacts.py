from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas import validators
from backend.schemas.common import APIModel

ContactType = Literal["customer", "vendor"]
ContactKind = Literal["business", "individual"]
GstTreatment = Literal["registered_business", "unregistered", "consumer", "overseas", "sez"]


class _ContactFieldRules:
    """Format rules shared by creating and updating a contact.

    Kept off ContactBase deliberately: ContactOut extends it too, and enforcing
    entry rules on the way out would make an existing row that predates them
    unreadable - one bad legacy value would break the whole contacts list
    instead of just being flagged at entry.
    """

    @field_validator("display_name")
    @classmethod
    def _display_name(cls, value: Optional[str]) -> Optional[str]:
        return validators.person_name(value, "Name")

    @field_validator("contact_person")
    @classmethod
    def _contact_person(cls, value: Optional[str]) -> Optional[str]:
        return validators.person_name(value, "Contact person name")

    @field_validator("company_name")
    @classmethod
    def _company_name(cls, value: Optional[str]) -> Optional[str]:
        return validators.business_name(value)

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, value: Optional[str]) -> Optional[str]:
        return validators.person_name(value, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, value: Optional[str]) -> Optional[str]:
        return validators.person_name(value, "Last name")

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: Optional[str]) -> Optional[str]:
        return validators.phone(value, "Work phone")

    @field_validator("mobile")
    @classmethod
    def _mobile(cls, value: Optional[str]) -> Optional[str]:
        return validators.phone(value, "Mobile number")

    @field_validator("bank_account_number")
    @classmethod
    def _bank_account_number(cls, value: Optional[str]) -> Optional[str]:
        return validators.bank_account_number(value)

    @field_validator("bank_ifsc")
    @classmethod
    def _bank_ifsc(cls, value: Optional[str]) -> Optional[str]:
        return validators.ifsc(value)

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, value: Optional[str]) -> Optional[str]:
        return validators.gstin(value)

    @field_validator("pan")
    @classmethod
    def _pan(cls, value: Optional[str]) -> Optional[str]:
        return validators.pan(value)


class ContactBase(APIModel):
    type: ContactType
    contact_type: ContactKind = "business"
    display_name: str = Field(min_length=1, max_length=200)
    company_name: Optional[str] = Field(default=None, max_length=200)
    salutation: Optional[str] = Field(default=None, max_length=10)
    first_name: Optional[str] = Field(default=None, max_length=60)
    last_name: Optional[str] = Field(default=None, max_length=60)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    mobile: Optional[str] = Field(default=None, max_length=40)
    gstin: Optional[str] = Field(default=None, max_length=20)
    pan: Optional[str] = Field(default=None, max_length=20)
    bank_account_holder: Optional[str] = Field(default=None, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    bank_account_number: Optional[str] = Field(default=None, max_length=40)
    bank_ifsc: Optional[str] = Field(default=None, max_length=20)
    gst_treatment: GstTreatment = "unregistered"
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    notes: Optional[str] = None


class ContactCreate(_ContactFieldRules, ContactBase):
    pass


class ContactUpdate(_ContactFieldRules, APIModel):
    contact_type: Optional[ContactKind] = None
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    company_name: Optional[str] = Field(default=None, max_length=200)
    salutation: Optional[str] = Field(default=None, max_length=10)
    first_name: Optional[str] = Field(default=None, max_length=60)
    last_name: Optional[str] = Field(default=None, max_length=60)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    mobile: Optional[str] = Field(default=None, max_length=40)
    gstin: Optional[str] = Field(default=None, max_length=20)
    pan: Optional[str] = Field(default=None, max_length=20)
    bank_account_holder: Optional[str] = Field(default=None, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    bank_account_number: Optional[str] = Field(default=None, max_length=40)
    bank_ifsc: Optional[str] = Field(default=None, max_length=20)
    gst_treatment: Optional[GstTreatment] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


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
