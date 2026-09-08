"""Default chart of accounts bootstrapped for every new organization.

This is configuration (like Zoho Books' default accounts), not sample data.
"""
from __future__ import annotations

from typing import Dict

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Account

# code, name, type, subtype
DEFAULT_ACCOUNTS = [
    # Assets
    ("1000", "Cash", "asset", "cash"),
    ("1100", "Accounts Receivable", "asset", "accounts_receivable"),
    ("1200", "Inventory Asset", "asset", "inventory"),
    ("1300", "Input GST", "asset", "tax"),
    ("1400", "Prepaid Expenses", "asset", "other_current_asset"),
    ("1500", "Furniture and Equipment", "asset", "fixed_asset"),
    ("1900", "Undeposited Funds", "asset", "other_current_asset"),
    # Liabilities
    ("2000", "Accounts Payable", "liability", "accounts_payable"),
    ("2100", "Output GST", "liability", "tax"),
    ("2200", "TDS Payable", "liability", "other_current_liability"),
    ("2300", "Salaries Payable", "liability", "other_current_liability"),
    ("2310", "Provident Fund Payable", "liability", "other_current_liability"),
    ("2320", "Professional Tax Payable", "liability", "other_current_liability"),
    ("2400", "Unearned Revenue", "liability", "other_current_liability"),
    # Equity
    ("3000", "Owner's Equity", "equity", "equity"),
    ("3100", "Opening Balance Adjustments", "equity", "equity"),
    ("3200", "Retained Earnings", "equity", "equity"),
    # Income
    ("4000", "Sales", "income", "sales"),
    ("4100", "Service Revenue", "income", "sales"),
    ("4200", "Consulting Revenue", "income", "sales"),
    ("4300", "Discount Given", "income", "contra_income"),
    ("4900", "Other Income", "income", "other_income"),
    # Expenses
    ("5000", "Cost of Goods Sold", "expense", "cogs"),
    ("5100", "Subcontractor Costs", "expense", "cogs"),
    ("5900", "Purchase Discounts", "expense", "contra_expense"),
    ("6000", "Advertising and Marketing", "expense", "operating"),
    ("6100", "Bank Fees and Charges", "expense", "operating"),
    ("6200", "Office Supplies", "expense", "operating"),
    ("6300", "Rent Expense", "expense", "operating"),
    ("6400", "Salaries and Employee Wages", "expense", "operating"),
    ("6410", "Employer PF Contribution", "expense", "operating"),
    ("6500", "Travel Expense", "expense", "operating"),
    ("6600", "Telephone and Internet", "expense", "operating"),
    ("6700", "Utilities", "expense", "operating"),
    ("6800", "Professional Fees", "expense", "operating"),
    ("6900", "Repairs and Maintenance", "expense", "operating"),
    ("6950", "Depreciation Expense", "expense", "operating"),
    ("6990", "Other Expenses", "expense", "operating"),
    ("7000", "Inventory Adjustments", "expense", "operating"),
]

SYSTEM_CODES = {"1000", "1100", "1200", "1300", "2000", "2100", "2200", "2300", "2310", "2320", "3100", "4000", "4300", "5000", "5900", "1400", "2400", "6400", "7000"}


def bootstrap_accounts(db: Session, organization_id: str) -> Dict[str, Account]:
    accounts: Dict[str, Account] = {}
    for code, name, acc_type, subtype in DEFAULT_ACCOUNTS:
        account = Account(
            organization_id=organization_id,
            code=code,
            name=name,
            type=acc_type,
            subtype=subtype,
            is_system=code in SYSTEM_CODES,
        )
        db.add(account)
        accounts[code] = account
    db.flush()
    return accounts


def get_account_by_code(db: Session, organization_id: str, code: str) -> Account:
    account = db.execute(
        select(Account).where(Account.organization_id == organization_id, Account.code == code)
    ).scalar_one_or_none()
    if account is None:
        raise RuntimeError(f"System account {code} missing for organization {organization_id}")
    return account


def get_account_by_subtype(db: Session, organization_id: str, subtype: str) -> Account:
    account = db.execute(
        select(Account)
        .where(Account.organization_id == organization_id, Account.subtype == subtype, Account.is_active.is_(True))
        .order_by(Account.code)
    ).scalars().first()
    if account is None:
        raise RuntimeError(f"No account with subtype {subtype} for organization {organization_id}")
    return account
