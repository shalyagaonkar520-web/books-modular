"""Service clients: how Books, Bookings and other apps prove who they are to Core.

Each app gets an OAuth client (client id + secret, scopes). It swaps them for a
short-lived access token at ``POST /token`` (client-credentials grant) and
calls Core's ``/internal/...`` API with it. Only the SHA-256 of the secret is
stored; the secret is shown once when the client is created or rotated.

Command line (inside the Core container):
    python -m core_api.clients create --app books --scopes parties:write entitlements:read
    python -m core_api.clients rotate <client_id>
    python -m core_api.clients disable <client_id>
    python -m core_api.clients list
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import secrets
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from core_api.models import App, AuditLog, OAuthClient

# What a service client may be granted.
SCOPES = ("parties:read", "parties:write", "entitlements:read")


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def create(session: Session, app_key: str, scopes: list[str]) -> tuple[OAuthClient, str]:
    """A new confidential client for ``app_key`` (not committed). Returns (client, secret shown once)."""
    if session.get(App, app_key) is None:
        raise ValueError(f"Unknown app '{app_key}'.")
    unknown = sorted(set(scopes) - set(SCOPES))
    if unknown:
        raise ValueError(f"Unknown scope(s): {', '.join(unknown)}. Allowed: {', '.join(SCOPES)}")
    secret = secrets.token_urlsafe(32)
    client = OAuthClient(
        app_key=app_key,
        client_id=f"{app_key}-{secrets.token_hex(4)}",
        secret_hash=_hash(secret),
        scopes=sorted(set(scopes)),
        redirect_uris=[],
        is_active=True,
    )
    session.add(client)
    session.add(
        AuditLog(actor_type="system", action="client.created", target=client.client_id, detail={"app": app_key, "scopes": client.scopes})
    )
    return client, secret


def rotate(session: Session, client_id: str) -> str:
    client = session.scalar(select(OAuthClient).where(OAuthClient.client_id == client_id))
    if client is None:
        raise ValueError(f"No client '{client_id}'.")
    secret = secrets.token_urlsafe(32)
    client.secret_hash = _hash(secret)
    session.add(AuditLog(actor_type="system", action="client.secret_rotated", target=client_id))
    return secret


def authenticate(session: Session, client_id: str, secret: str) -> OAuthClient | None:
    """The active client these credentials belong to, else None (constant-time compare)."""
    client = session.scalar(select(OAuthClient).where(OAuthClient.client_id == client_id))
    expected = client.secret_hash if client is not None and client.secret_hash else _hash(secrets.token_hex(16))
    ok = hmac.compare_digest(expected, _hash(secret or ""))
    if client is None or not ok or not client.is_active or not client.secret_hash:
        return None
    return client


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage Core's service clients (apps calling Core).")
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("create")
    c.add_argument("--app", required=True)
    c.add_argument("--scopes", nargs="+", required=True, choices=SCOPES)
    for name in ("rotate", "disable"):
        sub.add_parser(name).add_argument("client_id")
    sub.add_parser("list")
    args = parser.parse_args(argv)

    from core_api.db import SessionLocal

    with SessionLocal() as session:
        if args.command == "create":
            client, secret = create(session, args.app, args.scopes)
            session.commit()
            print(
                f"CORE_CLIENT_ID={client.client_id}\nCORE_CLIENT_SECRET={secret}\n(The secret is shown once. Put both in the app's .env.)"
            )
        elif args.command == "rotate":
            secret = rotate(session, args.client_id)
            session.commit()
            print(f"CORE_CLIENT_SECRET={secret}\n(The old secret no longer works. Update the app's .env and restart it.)")
        elif args.command == "disable":
            client = session.scalar(select(OAuthClient).where(OAuthClient.client_id == args.client_id))
            if client is None:
                print(f"No client '{args.client_id}'.", file=sys.stderr)
                return 1
            client.is_active = False
            session.add(AuditLog(actor_type="system", action="client.disabled", target=args.client_id))
            session.commit()
            print(f"Disabled {args.client_id}.")
        else:
            for client in session.scalars(select(OAuthClient).order_by(OAuthClient.app_key)):
                print(
                    f"{client.client_id:24} {client.app_key:10} {'active' if client.is_active else 'disabled':9} {' '.join(client.scopes)}"
                )
    return 0


if __name__ == "__main__":
    sys.exit(main())
