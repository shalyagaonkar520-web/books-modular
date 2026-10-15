"""Connected apps: platform-admin management and the app's own view."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator

from backend.schemas.common import APIModel
from backend.services import integrations


class ConnectedAppIn(APIModel):
    name: str = Field(min_length=2, max_length=120)
    scopes: List[str] = Field(default_factory=list, max_length=100)
    events: List[str] = Field(default_factory=list, max_length=100)
    webhook_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("scopes")
    @classmethod
    def _scopes(cls, value: List[str]) -> List[str]:
        return integrations.normalize_scopes(value)

    @field_validator("events")
    @classmethod
    def _events(cls, value: List[str]) -> List[str]:
        return integrations.normalize_events(value)

    @field_validator("webhook_url")
    @classmethod
    def _url(cls, value: Optional[str]) -> Optional[str]:
        return value or None


class ConnectedAppUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    scopes: Optional[List[str]] = Field(default=None, max_length=100)
    events: Optional[List[str]] = Field(default=None, max_length=100)
    webhook_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("scopes")
    @classmethod
    def _scopes(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return None if value is None else integrations.normalize_scopes(value)

    @field_validator("events")
    @classmethod
    def _events(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return None if value is None else integrations.normalize_events(value)


class ConnectedAppOut(APIModel):
    id: str
    organization_id: str
    name: str
    key_prefix: str
    scopes: List[str]
    events: List[str]
    webhook_url: Optional[str] = None
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    pending_deliveries: int = 0
    failed_deliveries: int = 0


class ConnectedAppSecrets(APIModel):
    """Shown once: the platform admin passes them to the app's developer."""

    connection: ConnectedAppOut
    api_key: Optional[str] = None
    webhook_secret: Optional[str] = None


class WebhookDeliveryOut(APIModel):
    id: str
    event_id: str
    event_type: str
    entity_id: Optional[str] = None
    status: str
    attempts: int
    next_attempt_at: datetime
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None
    delivered_at: Optional[datetime] = None
    created_at: datetime


class WebhookTestResult(APIModel):
    ok: bool
    status_code: Optional[int] = None
    error: Optional[str] = None
