"""Token-signing keys (RS256) and the tokens Core signs with them.

- Exactly one key is ``active`` and signs new tokens. ``rotate`` makes a new
  active key and moves the old one to ``retiring``: it signs nothing more but
  stays in ``/jwks`` for SIGNING_KEY_OVERLAP_HOURS, so tokens it signed keep
  verifying until they expire. After that it becomes ``retired`` and leaves
  ``/jwks``.
- The private key is stored encrypted with the first of KEY_ENCRYPTION_KEYS
  (Fernet); any of them can decrypt, so that key can be rotated too. Private
  keys never leave Core.

Command line (inside the Core container):
    python -m core_api.keys list | rotate | retire-expired
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select
from sqlalchemy.orm import Session

from core_api.config import get_settings
from core_api.models import SigningKey

ALGORITHM = "RS256"


class KeyConfigError(RuntimeError):
    """KEY_ENCRYPTION_KEYS is missing or wrong, so signing keys cannot be used."""


def _fernet() -> MultiFernet:
    keys = get_settings().key_encryption_keys
    if not keys:
        raise KeyConfigError("KEY_ENCRYPTION_KEYS is not set. Generate one with: python -m core_api.keys new-encryption-key")
    try:
        return MultiFernet([Fernet(k.encode()) for k in keys])
    except (ValueError, TypeError) as exc:
        raise KeyConfigError("KEY_ENCRYPTION_KEYS holds a value that is not a Fernet key.") from exc


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


# --------------------------------------------------------------------------- #
# Key lifecycle
# --------------------------------------------------------------------------- #
def create_key(session: Session) -> SigningKey:
    """A new RSA-2048 key pair, stored with the private half encrypted (not committed)."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    kid = secrets.token_hex(8)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    jwk.update({"kid": kid, "alg": ALGORITHM, "use": "sig"})
    key = SigningKey(
        kid=kid,
        algorithm=ALGORITHM,
        status="active",
        public_jwk=jwk,
        private_key_encrypted=_fernet().encrypt(pem).decode(),
        created_at=_now(),
    )
    session.add(key)
    return key


def active_key(session: Session) -> SigningKey:
    """The key that signs new tokens; one is created the first time it is needed."""
    key = session.scalar(select(SigningKey).where(SigningKey.status == "active").order_by(SigningKey.created_at.desc()))
    if key is None:
        key = create_key(session)
        session.commit()
    return key


def rotate(session: Session) -> SigningKey:
    """Make a new active key; the previous one keeps verifying for the overlap window (commits)."""
    now = _now()
    for old in session.scalars(select(SigningKey).where(SigningKey.status == "active")):
        old.status = "retiring"
        old.retiring_at = now
    key = create_key(session)
    session.commit()
    return key


def retire_expired(session: Session) -> int:
    """Move retiring keys past the overlap window to retired (commits). Returns how many."""
    cutoff = _now() - timedelta(hours=get_settings().signing_key_overlap_hours)
    count = 0
    for key in session.scalars(select(SigningKey).where(SigningKey.status == "retiring")):
        if (_aware(key.retiring_at) or _now()) <= cutoff:
            key.status = "retired"
            key.retired_at = _now()
            count += 1
    session.commit()
    return count


def jwks(session: Session) -> dict[str, Any]:
    """Public keys apps verify with: the active key and those still retiring."""
    retire_expired(session)
    keys = session.scalars(select(SigningKey).where(SigningKey.status.in_(("active", "retiring"))).order_by(SigningKey.created_at.desc()))
    return {"keys": [dict(k.public_jwk) for k in keys]}


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
def sign(session: Session, claims: dict[str, Any], ttl: timedelta) -> str:
    """Sign ``claims`` with the active key. Adds iss, iat, nbf, exp and jti."""
    if not get_settings().issuer:
        raise KeyConfigError("PUBLIC_URL is not set: Core cannot issue tokens without its issuer URL.")
    key = active_key(session)
    try:
        pem = _fernet().decrypt(key.private_key_encrypted.encode())
    except InvalidToken as exc:
        raise KeyConfigError("The active signing key cannot be decrypted with KEY_ENCRYPTION_KEYS.") from exc
    now = _now()
    payload = {
        **claims,
        "iss": get_settings().issuer,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_hex(12),
    }
    return jwt.encode(payload, pem, algorithm=ALGORITHM, headers={"kid": key.kid})


def verify(session: Session, token: str, audience: str | None) -> dict[str, Any]:
    """Decode a token Core signed (any key still in /jwks). Raises jwt.PyJWTError when invalid."""
    kid = jwt.get_unverified_header(token).get("kid")
    key = session.scalar(select(SigningKey).where(SigningKey.kid == kid, SigningKey.status.in_(("active", "retiring"))))
    if key is None:
        raise jwt.InvalidTokenError("Unknown signing key")
    public = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key.public_jwk))
    return jwt.decode(
        token,
        public,
        algorithms=[ALGORITHM],
        audience=audience,
        issuer=get_settings().issuer,
        leeway=30,
        options={"require": ["exp", "iat", "iss", "aud", "sub"], "verify_aud": audience is not None},
    )


# --------------------------------------------------------------------------- #
# Command line
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage Core's token-signing keys.")
    parser.add_argument("command", choices=["list", "rotate", "retire-expired", "new-encryption-key"])
    args = parser.parse_args(argv)
    if args.command == "new-encryption-key":
        print(Fernet.generate_key().decode())  # put it first in KEY_ENCRYPTION_KEYS
        return 0
    from core_api.db import SessionLocal

    with SessionLocal() as session:
        if args.command == "rotate":
            key = rotate(session)
            print(f"New active key {key.kid}. The previous key verifies for {get_settings().signing_key_overlap_hours} more hours.")
        elif args.command == "retire-expired":
            print(f"Retired {retire_expired(session)} key(s).")
        for key in session.scalars(select(SigningKey).order_by(SigningKey.created_at.desc())):
            print(f"{key.kid}  {key.status:9}  created {key.created_at:%Y-%m-%d %H:%M}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
