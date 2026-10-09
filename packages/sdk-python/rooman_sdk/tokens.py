"""Check Core access tokens (RS256 JWTs) and enforce the apps, modules and role they grant.

Status codes follow Books' existing behaviour:
- 401 when the token is missing, expired or not valid;
- 402 when the organization's trial has ended and it has no active plan;
- 403 when the app, module or role is not granted.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

import jwt
from pydantic import BaseModel, ConfigDict, Field

ALGORITHMS = ["RS256"]
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AccessError(Exception):
    def __init__(self, status_code: int, code: str, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail


class Claims(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str
    org_id: str
    org_code: str | None = None
    role: str
    apps: list[str] = Field(default_factory=list)
    modules: dict[str, list[str]] = Field(default_factory=dict)
    trial_ends_at: datetime | None = None
    subscription_status: str | None = None

    def trial_over(self, now: datetime | None = None) -> bool:
        if self.subscription_status == "active" or self.trial_ends_at is None:
            return False
        ends = self.trial_ends_at if self.trial_ends_at.tzinfo else self.trial_ends_at.replace(tzinfo=UTC)
        return (now or datetime.now(UTC)) >= ends


class TokenVerifier:
    """Verifies tokens against Core's JWKS (keys cached by PyJWT), or a fixed key in tests."""

    def __init__(self, issuer: str, audience: str, jwks_url: str | None = None, public_key: Any = None, leeway_seconds: int = 30):
        if not issuer or not audience:
            raise ValueError("issuer and audience are required")
        if not jwks_url and public_key is None:
            raise ValueError("Either jwks_url or public_key is required")
        self.issuer = issuer
        self.audience = audience
        self.leeway = leeway_seconds
        self._public_key = public_key
        self._jwks = jwt.PyJWKClient(jwks_url, cache_keys=True) if jwks_url else None

    def _key_for(self, token: str) -> Any:
        if self._jwks is not None:
            return self._jwks.get_signing_key_from_jwt(token).key
        return self._public_key

    def verify(self, token: str | None) -> Claims:
        if not token:
            raise AccessError(401, "NOT_AUTHENTICATED", "Please sign in.")
        try:
            payload = jwt.decode(
                token,
                self._key_for(token),
                algorithms=ALGORITHMS,
                audience=self.audience,
                issuer=self.issuer,
                leeway=self.leeway,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
        except jwt.ExpiredSignatureError:
            raise AccessError(401, "TOKEN_EXPIRED", "Your session has expired. Please sign in again.") from None
        except (jwt.PyJWTError, ValueError):
            raise AccessError(401, "TOKEN_INVALID", "Your session is not valid. Please sign in again.") from None
        return Claims.model_validate(payload)


def check_access(
    claims: Claims,
    app: str,
    method: str = "GET",
    module: str | None = None,
    roles: Iterable[str] | None = None,
    now: datetime | None = None,
) -> None:
    """Raise AccessError unless these claims may make this request.

    Mirrors Books' guards: role first (403), then a locked trial (402 for every
    guarded request; sign-in and plan selection stay outside these guards),
    then the module for writes only (403). ``modules[app]`` holds the modules
    this user may edit: the plan's, narrowed by the user's own access.
    """
    if app not in claims.apps:
        raise AccessError(403, "APP_NOT_IN_PLAN", "Your organization's plan does not include this app.")
    if roles is not None and claims.role not in set(roles):
        raise AccessError(403, "ROLE_NOT_ALLOWED", "Insufficient permissions")
    if claims.trial_over(now):
        raise AccessError(402, "subscription_required", "The free trial has ended. Choose a plan to continue.")
    if module and method.upper() in WRITE_METHODS:
        granted = claims.modules.get(app)
        # No entry means every module of the app is open, as Books treats a NULL list today.
        if granted is not None and module not in granted:
            raise AccessError(403, "MODULE_LOCKED", "This module is not part of your plan or your access. Ask your administrator.")
