#!/usr/bin/env python
"""Create (or update) a platform super-admin.

Super-admins have no self-service signup by design, so the first one is created
here. Run from the repo root with the same DATABASE_URL the API uses:

    python scripts/create_superadmin.py --email you@example.com --name "You" --password 'Str0ngPass!'

Or via environment variables:

    SUPERADMIN_EMAIL=... SUPERADMIN_NAME=... SUPERADMIN_PASSWORD=... python scripts/create_superadmin.py

If an admin with the email already exists, its password/name are updated.
"""

from __future__ import annotations

import argparse
import os
import sys
from getpass import getpass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from backend.db import SessionLocal  # noqa: E402
from backend.models import PlatformAdmin  # noqa: E402
from backend.schemas.auth import _validate_password  # noqa: E402
from backend.security import hash_password  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update a platform super-admin")
    parser.add_argument("--email", default=os.environ.get("SUPERADMIN_EMAIL"))
    parser.add_argument("--name", default=os.environ.get("SUPERADMIN_NAME"))
    parser.add_argument("--password", default=os.environ.get("SUPERADMIN_PASSWORD"))
    args = parser.parse_args()

    email = (args.email or input("Email: ")).lower().strip()
    name = args.name or input("Name: ").strip()
    password = args.password or getpass("Password: ")

    if not email or "@" not in email:
        print("A valid email is required", file=sys.stderr)
        return 2
    if not name:
        print("A name is required", file=sys.stderr)
        return 2
    try:
        _validate_password(password)
    except ValueError as exc:
        print(f"Password rejected: {exc}", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        admin = db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email)).scalar_one_or_none()
        if admin:
            admin.name = name
            admin.password_hash = hash_password(password)
            admin.is_active = True
            action = "updated"
        else:
            admin = PlatformAdmin(name=name, email=email, password_hash=hash_password(password), is_active=True)
            db.add(admin)
            action = "created"
        db.commit()
        print(f"Super-admin {email} {action}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
