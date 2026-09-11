from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import EmailStr, Field

from backend.schemas.common import APIModel


class EmployeeCreate(APIModel):
    employee_code: Optional[str] = Field(default=None, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    designation: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    date_of_joining: date
    pan: Optional[str] = Field(default=None, max_length=20)
    bank_account_number: Optional[str] = Field(default=None, max_length=40)
    bank_ifsc: Optional[str] = Field(default=None, max_length=20)
    basic_salary: Decimal = Field(ge=0)
    hra: Decimal = Field(default=Decimal("0"), ge=0)
    other_allowances: Decimal = Field(default=Decimal("0"), ge=0)
    pf_employee: Decimal = Field(default=Decimal("0"), ge=0)
    professional_tax: Decimal = Field(default=Decimal("0"), ge=0)
    tds: Decimal = Field(default=Decimal("0"), ge=0)


class EmployeeUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    date_of_joining: Optional[date] = None
    pan: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    basic_salary: Optional[Decimal] = Field(default=None, ge=0)
    hra: Optional[Decimal] = Field(default=None, ge=0)
    other_allowances: Optional[Decimal] = Field(default=None, ge=0)
    pf_employee: Optional[Decimal] = Field(default=None, ge=0)
    professional_tax: Optional[Decimal] = Field(default=None, ge=0)
    tds: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class EmployeeOut(APIModel):
    id: str
    employee_code: str
    name: str
    email: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    date_of_joining: date
    pan: Optional[str] = None
    bank_account_number_masked: Optional[str] = None
    bank_ifsc: Optional[str] = None
    basic_salary: Decimal
    hra: Decimal
    other_allowances: Decimal
    pf_employee: Decimal
    professional_tax: Decimal
    tds: Decimal
    gross_salary: Decimal
    net_salary: Decimal
    is_active: bool
    created_at: datetime
    # Whether this employee already has (or has been invited to) portal
    # access - drives whether "Invite to portal" or "Portal access" shows.
    has_login: bool = False


class PayRunCreate(APIModel):
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)
    loss_of_pay: dict[str, Decimal] = Field(default_factory=dict, description="employeeId -> LOP days")


class PayRunPay(APIModel):
    bank_account_id: str
    pay_date: date


class PayslipOut(APIModel):
    id: str
    employee_id: str
    employee_code: str
    employee_name: str
    designation: Optional[str] = None
    department: Optional[str] = None
    pan: Optional[str] = None
    bank_account_number_masked: Optional[str] = None
    basic_salary: Decimal
    hra: Decimal
    other_allowances: Decimal
    gross: Decimal
    pf_employee: Decimal
    professional_tax: Decimal
    tds: Decimal
    loss_of_pay_days: Decimal
    loss_of_pay_amount: Decimal
    total_deductions: Decimal
    net_pay: Decimal


class PayRunOut(APIModel):
    id: str
    period_year: int
    period_month: int
    period_label: str
    status: str
    pay_date: Optional[date] = None
    bank_account_id: Optional[str] = None
    total_gross: Decimal
    total_deductions: Decimal
    total_net: Decimal
    employee_count: int
    payslips: List[PayslipOut] = []
    created_at: datetime


class EmployeeOptionOut(APIModel):
    """A minimal, salary-free row for the "which employee is this?" invite picker."""

    id: str
    employee_code: str
    name: str
    email: Optional[str] = None
