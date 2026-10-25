#!/usr/bin/env python
"""Create (or reset) a test organization with an admin login, on any server.

For manual testing after a deploy: a company with every module on an active
plan (so no trial expiry), the standard chart of accounts, a Petty Cash
account and an admin user. Run from the repo root (or inside the API
container) with the same DATABASE_URL the API uses:

    python scripts/create_test_org.py --email tester@example.com --password 'Str0ngPass!'

Options: --org-name (default "Test Company"), --name (default "Test Admin").
Or set TEST_ORG_EMAIL / TEST_ORG_PASSWORD / TEST_ORG_NAME / TEST_ORG_ADMIN.

If the login already exists, its password is reset and the account and its
organization are made active again; no data is deleted.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from sqlalchemy import select  # noqa: E402

from backend.db import SessionLocal  # noqa: E402
from backend.models import BankAccount, Organization, User  # noqa: E402
from backend.schemas.auth import _validate_password  # noqa: E402
from backend.security import hash_password  # noqa: E402
from backend.services import module_pricing, platform_settings, subscription  # noqa: E402
from backend.services.chart_of_accounts import bootstrap_accounts  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or reset a test organization and its admin login")
    parser.add_argument("--email", default=os.environ.get("TEST_ORG_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("TEST_ORG_PASSWORD"))
    parser.add_argument("--org-name", default=os.environ.get("TEST_ORG_NAME", "Test Company"))
    parser.add_argument("--name", default=os.environ.get("TEST_ORG_ADMIN", "Test Admin"))
    args = parser.parse_args()

    email = (args.email or "").lower().strip()
    if not email or "@" not in email:
        print("A valid --email is required", file=sys.stderr)
        return 2
    try:
        _validate_password(args.password or "")
    except ValueError as exc:
        print(f"Password rejected: {exc}", file=sys.stderr)
        return 2

    now = datetime.now(dt.UTC)  # backend adds datetime.UTC on Python 3.10
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user:
            org = db.get(Organization, user.organization_id)
            user.password_hash = hash_password(args.password)
            user.is_active = True
            org.approval_status = "approved"
            org.approved_at = org.approved_at or now
            action = "reset"
        else:
            defaults = platform_settings.get_org_defaults(db)
            org = Organization(
                name=args.org_name,
                currency=defaults.currency,
                default_tax_rate=defaults.tax_rate,
                default_payment_terms_days=defaults.payment_terms_days,
                approval_status="approved",
                approved_at=now,
                subscription_status=subscription.STATUS_TRIAL,
            )
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
            db.add(User(organization_id=org.id, name=args.name, email=email, password_hash=hash_password(args.password), role="admin"))
            action = "created"
        # Every module on an active plan, so the test company never hits a trial lock.
        subscription.approve(db, org, modules=module_pricing.module_keys(), billing_cycle="monthly", now=now)
        db.commit()
        print(f"Test organization '{org.name}' {action}: sign in as {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
