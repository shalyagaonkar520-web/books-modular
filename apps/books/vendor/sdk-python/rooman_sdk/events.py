"""The event envelope shared by every Rooman One service, and its signature.

Matches contracts/events/envelope.schema.json.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from rooman_sdk.ids import canonical_uuid

SIGNATURE_PREFIX = "sha256="


class Actor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["user", "service", "system"]
    id: str | None = None


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex}", pattern=r"^evt_[0-9a-f]{32}$")
    type: str = Field(pattern=r"^[a-z][a-z_]*\.[a-z][a-z_]*$")
    version: int = Field(default=1, ge=1)
    org_id: str
    actor: Actor
    source: str = Field(min_length=1, max_length=40)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    data: dict[str, Any]

    @field_validator("org_id")
    @classmethod
    def _org_id_is_uuid(cls, value: str) -> str:
        return canonical_uuid(value)

    @field_validator("occurred_at")
    @classmethod
    def _aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at must include a time zone")
        return value.astimezone(UTC)

    def to_json(self) -> str:
        """Canonical JSON: sorted keys, no spaces, so the signature is stable."""
        return json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))


def sign(body: bytes | str, secret: str) -> str:
    if not secret:
        raise ValueError("An event signing secret is required.")
    raw = body.encode() if isinstance(body, str) else body
    return SIGNATURE_PREFIX + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def verify(body: bytes | str, signature: str, secrets: list[str]) -> bool:
    """True when the signature matches any current secret (several during a rotation)."""
    return any(hmac.compare_digest(sign(body, secret), signature or "") for secret in secrets if secret)
