"""Setting up a new organization in Books.

One place for everything a new organization gets, used by Books' own sign-up
(routers/auth.py) and by the first "Sign in with Rooman One" from an
organization created on Rooman One (routers/rooman_one_login.py), so both
paths end in exactly the same organization.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.models import BankAccount, Organization
from backend.services import platform_settings, subscription
from backend.services.chart_of_accounts import bootstrap_accounts


def create_organization(db: Session, name: str, gstin: Optional[str] = None, org_id: Optional[str] = None) -> tuple[Organization, bool]:
    """Create the organization with its defaults, trial, chart of accounts and Petty Cash (flushes, does not commit).

    Returns the organization and whether it waits for a super-admin's approval
    (the platform's REQUIRE_ORG_APPROVAL rule applies to every path in).
    """
    defaults = platform_settings.get_org_defaults(db)
    needs_approval = platform_settings.require_org_approval(db)
    org = Organization(
        name=name,
        gstin=gstin or None,
        currency=defaults.currency,
        default_tax_rate=defaults.tax_rate,
        default_payment_terms_days=defaults.payment_terms_days,
        approval_status="pending" if needs_approval else "approved",
        approved_at=None if needs_approval else datetime.now(UTC),
        # Free trial of every module; it starts once the org is usable (now,
        # or when a super-admin approves it).
        subscription_status=subscription.STATUS_TRIAL,
    )
    if org_id:
        org.id = org_id
    if not needs_approval:
        subscription.start_trial(db, org)
    db.add(org)
    db.flush()

    accounts = bootstrap_accounts(db, org.id)
    db.add(
        BankAccount(
            organization_id=org.id,
            name="Petty Cash",
            type="cash",
            opening_balance=0,
            opening_balance_date=date.today(),
            ledger_account_id=accounts["1000"].id,
            is_primary=True,
        )
    )
    return org, needs_approval
