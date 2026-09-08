from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field

from backend.schemas.common import APIModel

BankAccountType = Literal["bank", "cash", "credit_card"]


class BankAccountCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    type: BankAccountType = "bank"
    bank_name: Optional[str] = Field(default=None, max_length=120)
    account_number: Optional[str] = Field(default=None, max_length=40)
    ifsc: Optional[str] = Field(default=None, max_length=20)
    opening_balance: Decimal = Field(default=Decimal("0"))
    opening_balance_date: date
    is_primary: bool = False


class BankAccountUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None


class BankAccountOut(APIModel):
    id: str
    name: str
    type: str
    bank_name: Optional[str] = None
    account_number_masked: Optional[str] = None
    ifsc: Optional[str] = None
    currency: str
    opening_balance: Decimal
    opening_balance_date: date
    current_balance: Decimal
    unreconciled_count: int
    is_active: bool
    is_primary: bool
    ledger_account_id: str
    created_at: datetime


class BankTransactionCreate(APIModel):
    date: date
    type: Literal["deposit", "withdrawal"]
    amount: Decimal = Field(gt=0)
    description: str = Field(min_length=1, max_length=255)
    reference: Optional[str] = Field(default=None, max_length=120)
    counter_account_id: str = Field(description="Ledger account for the other side of the entry")


class TransferCreate(APIModel):
    from_account_id: str
    to_account_id: str
    date: date
    amount: Decimal = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=255)
    reference: Optional[str] = Field(default=None, max_length=120)


class BankTransactionOut(APIModel):
    id: str
    bank_account_id: str
    bank_account_name: str
    date: date
    type: str
    amount: Decimal
    description: str
    reference: Optional[str] = None
    source_type: str
    source_id: Optional[str] = None
    counter_account_id: Optional[str] = None
    counter_account_name: Optional[str] = None
    is_reconciled: bool
    reconciled_at: Optional[datetime] = None
    running_balance: Optional[Decimal] = None
    created_at: datetime


class ReconcileRequest(APIModel):
    transaction_ids: List[str] = Field(min_length=1)
    reconciled: bool = True


class BankingSummary(APIModel):
    total_balance: Decimal
    accounts: List[BankAccountOut]
    unreconciled_count: int
