from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import ClassVar, List, Literal, Optional, Tuple

from pydantic import Field, model_validator
from pydantic.alias_generators import to_camel

from backend.schemas.common import MAX_MONEY, APIModel

AccountType = Literal["asset", "liability", "equity", "income", "expense"]


class NoExplicitNulls:
    """For partial-update bodies: a field may be left out, but a column that
    cannot hold NULL may not be sent as ``null`` - that used to reach the
    database and come back as a 500 instead of a validation error."""

    non_nullable_fields: ClassVar[Tuple[str, ...]] = ()

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_nulls(cls, data):
        if isinstance(data, dict):
            for field in cls.non_nullable_fields:
                for key in {field, to_camel(field)}:
                    if key in data and data[key] is None:
                        raise ValueError(f"{to_camel(field)} cannot be null")
        return data


class AccountCreate(APIModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    type: AccountType
    subtype: Optional[str] = Field(default=None, max_length=40)
    description: Optional[str] = None


class AccountUpdate(NoExplicitNulls, APIModel):
    non_nullable_fields: ClassVar[Tuple[str, ...]] = ("name", "is_active")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    subtype: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class AccountOut(APIModel):
    id: str
    code: str
    name: str
    type: str
    subtype: Optional[str] = None
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    balance: Decimal = Decimal("0")


class AccountOptionOut(APIModel):
    """A slim chart-of-accounts row for pickers on entry forms: no balances,
    so every role that may create documents can read it."""

    id: str
    code: str
    name: str
    type: str
    subtype: Optional[str] = None
    is_active: bool


class JournalLineInput(APIModel):
    account_id: str
    description: Optional[str] = Field(default=None, max_length=255)
    debit: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    credit: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    contact_id: Optional[str] = None

    @model_validator(mode="after")
    def _one_side(self):
        if self.debit > 0 and self.credit > 0:
            raise ValueError("A line cannot have both debit and credit")
        return self


class JournalCreate(APIModel):
    date: date
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None
    lines: List[JournalLineInput] = Field(min_length=2)


class JournalLineOut(APIModel):
    id: str
    account_id: str
    account_code: str
    account_name: str
    description: Optional[str] = None
    debit: Decimal
    credit: Decimal
    contact_id: Optional[str] = None


class JournalOut(APIModel):
    id: str
    entry_number: str
    date: date
    reference: Optional[str] = None
    notes: Optional[str] = None
    source_type: str
    source_id: Optional[str] = None
    is_reversal: bool
    total: Decimal
    lines: List[JournalLineOut]
    created_at: datetime


class LedgerLine(APIModel):
    date: date
    entry_id: str
    entry_number: str
    source_type: str
    reference: Optional[str] = None
    description: Optional[str] = None
    debit: Decimal
    credit: Decimal
    balance: Decimal


class LedgerReport(APIModel):
    account: AccountOut
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    opening_balance: Decimal
    lines: List[LedgerLine]
    closing_balance: Decimal


class TrialBalanceRow(APIModel):
    account_id: str
    code: str
    name: str
    type: str
    debit: Decimal
    credit: Decimal


class TrialBalance(APIModel):
    as_of: date
    rows: List[TrialBalanceRow]
    total_debit: Decimal
    total_credit: Decimal
