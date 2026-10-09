from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from rooman_sdk.tokens import AccessError, Claims, TokenVerifier, check_access

ISSUER = "https://id.example.test"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ORG = "7b0c3a9e-6f0e-4d7a-9a51-3d2f4c1b8e01"


def _token(key=KEY, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "user-1",
        "org_id": ORG,
        "org_code": "ACME01",
        "role": "staff",
        "apps": ["books"],
        "modules": {"books": ["sales"]},
        "aud": "books",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 900,
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256")


@pytest.fixture
def verifier() -> TokenVerifier:
    return TokenVerifier(issuer=ISSUER, audience="books", public_key=KEY.public_key())


def test_valid_token_gives_claims(verifier):
    claims = verifier.verify(_token())
    assert claims.org_id == ORG
    assert claims.modules == {"books": ["sales"]}


@pytest.mark.parametrize(
    ("token_kwargs", "code"),
    [
        ({"key": OTHER_KEY}, "TOKEN_INVALID"),
        ({"aud": "bookings"}, "TOKEN_INVALID"),
        ({"iss": "https://evil.test"}, "TOKEN_INVALID"),
        ({"exp": int(time.time()) - 120}, "TOKEN_EXPIRED"),
    ],
)
def test_bad_tokens_are_401(verifier, token_kwargs, code):
    with pytest.raises(AccessError) as caught:
        verifier.verify(_token(**token_kwargs))
    assert caught.value.status_code == 401
    assert caught.value.code == code


def test_missing_token_is_401(verifier):
    with pytest.raises(AccessError) as caught:
        verifier.verify("")
    assert caught.value.status_code == 401


def test_hs256_token_is_refused(verifier):
    forged = jwt.encode(
        {"sub": "x", "aud": "books", "iss": ISSUER, "exp": int(time.time()) + 60, "iat": int(time.time())}, "secret", algorithm="HS256"
    )
    with pytest.raises(AccessError):
        verifier.verify(forged)


def _claims(**overrides) -> Claims:
    base = {"sub": "u", "org_id": ORG, "role": "staff", "apps": ["books"], "modules": {"books": ["sales"]}}
    base.update(overrides)
    return Claims.model_validate(base)


def test_app_outside_plan_is_403():
    with pytest.raises(AccessError) as caught:
        check_access(_claims(), app="bookings")
    assert caught.value.status_code == 403


def test_reads_are_open_for_any_module():
    check_access(_claims(), app="books", method="GET", module="payroll")


def test_write_to_locked_module_is_403():
    with pytest.raises(AccessError) as caught:
        check_access(_claims(), app="books", method="POST", module="payroll")
    assert caught.value.status_code == 403
    check_access(_claims(), app="books", method="POST", module="sales")


def test_no_module_list_means_all_open():
    check_access(_claims(modules={}), app="books", method="POST", module="payroll")


def test_role_not_allowed_is_403():
    with pytest.raises(AccessError) as caught:
        check_access(_claims(role="viewer"), app="books", roles=("admin", "staff"))
    assert caught.value.status_code == 403


@pytest.mark.parametrize("role", ["admin", "staff"])
def test_ended_trial_is_402_for_every_role(role):
    ended = datetime.now(UTC) - timedelta(days=1)
    with pytest.raises(AccessError) as caught:
        check_access(_claims(role=role, trial_ends_at=ended), app="books")
    assert caught.value.status_code == 402


def test_active_plan_ignores_old_trial_date():
    ended = datetime.now(UTC) - timedelta(days=1)
    check_access(_claims(trial_ends_at=ended, subscription_status="active"), app="books")
