"""Set (or reset) a Books user's password from the server.

People who only ever signed in with Rooman One have no Books password; after
moving to this Books they sign in with email + password, so give them one:

    docker compose -p roomanbooks --env-file .env -f deployment/docker-compose.yml \
        exec api python scripts/set_password.py --email shalya@rooman.com --password 'New-Pass-2026'

    ... --list   shows every user and whether they have a password yet.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db import SessionLocal  # noqa: E402
from backend.models import User  # noqa: E402
from backend.security import hash_password  # noqa: E402

MIN_LENGTH = 8


def set_password(email: str, password: str) -> str:
    if len(password) < MIN_LENGTH:
        raise SystemExit(f"The password must be at least {MIN_LENGTH} characters")
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email.strip().lower()).one_or_none()
        if user is None:
            raise SystemExit(f"No user with the email {email}")
        user.password_hash = hash_password(password)
        db.commit()
        return f"Password set for {user.email} ({user.name}). They can sign in with it now."


def list_users() -> list[str]:
    with SessionLocal() as db:
        return [
            f"{u.email:40} {'has a password' if u.password_hash else 'NO PASSWORD'}   {u.role}"
            for u in db.query(User).order_by(User.email).all()
        ]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--list", action="store_true", help="show every user and whether they have a password")
    args = parser.parse_args(argv)
    if args.list:
        print("\n".join(list_users()) or "No users yet")
        return
    if not args.email or not args.password:
        parser.error("give --email and --password, or --list")
    print(set_password(args.email, args.password))


if __name__ == "__main__":
    main()
