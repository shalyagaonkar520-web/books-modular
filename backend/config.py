"""Application configuration loaded from environment variables / .env file."""

from __future__ import annotations

import os
import secrets
from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Rooman Books"
    environment: str = Field(default="development", description="development | test | production")
    debug: bool = False

    # Persistence
    database_url: str = Field(default="sqlite:///./database/data/roomanbooks.db")
    data_dir: str = Field(default="./database/data", description="Directory for SQLite DB and uploaded files")
    auto_create_tables: bool = Field(
        default=True,
        description="Create tables on startup (dev/test). Production should rely on Alembic migrations.",
    )

    # Security
    secret_key: str = Field(default="")
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    cookie_secure: bool = Field(default=False, description="Set True behind HTTPS in production")
    cookie_domain: str | None = None
    cors_origins: List[str] | str = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])
    allow_public_signup: bool = Field(default=True, description="If false, only invited users can join")
    login_rate_limit_per_minute: int = 10
    # Comma-separated IPs/CIDRs of reverse proxies whose X-Forwarded-For header
    # is believed. Empty means never trust it (the header is client-controlled).
    # Behind the bundled nginx set e.g. TRUSTED_PROXIES=172.16.0.0/12.
    trusted_proxies: str = Field(default="", description="TRUSTED_PROXIES")

    # Uploads
    max_upload_size_mb: int = 25

    # Outbound email (SMTP). Read from the environment only -- this file is
    # committed, so a default here would be a leaked credential.
    smtp_host: str = Field(default="smtp.gmail.com")
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="", description="SMTP_USER")
    smtp_password: str = Field(default="", description="SMTP_PASSWORD (app password)")
    smtp_sender_name: str = Field(default="Rooman Books Accounts")
    smtp_from: str = Field(default="", description="SMTP_FROM email address")
    app_url: str = Field(default="http://localhost:3000", description="Frontend application URL")

    # AI assistant (Claude API). The key is read from the environment only; with
    # no key the AI features answer 503 and the rest of the app is unaffected.
    anthropic_api_key: str = Field(default="", description="ANTHROPIC_API_KEY")
    ai_model: str = Field(default="claude-opus-5-5", description="Claude model used by the AI assistant")

    # AI Employee Workspace. Cheap models on purpose: routing and photo reading are small jobs.
    # Prices are USD per million tokens, for the owner's cost estimate only (override with
    # AI_PRICE_TABLE='{"model": [input, output]}' if the published prices change).
    workspace_ai_model: str = Field(default="claude-haiku-5-5", description="AI_WORKSPACE_MODEL: understands chat requests")
    workspace_vision_model: str = Field(default="claude-haiku-5-5", description="AI_WORKSPACE_VISION_MODEL: reads product photos")
    # The larger model is used only for genuinely hard jobs (multi-step plans, analysis, unclear photos).
    workspace_hard_model: str = Field(default="claude-sonnet-5-5", description="AI_WORKSPACE_HARD_MODEL: used only for hard requests")
    workspace_hard_max_output_tokens: int = Field(default=900, ge=200, le=4000)
    workspace_ai_timeout_seconds: float = Field(default=30.0, ge=5, le=120)
    workspace_ai_max_output_tokens: int = Field(default=500, ge=100, le=4000)
    workspace_ai_rate_limit_per_minute: int = Field(default=12, ge=1, le=600, description="Claude calls per employee per minute")
    ai_price_table: str = Field(default="", description="AI_PRICE_TABLE JSON {model: [input_per_mtok, output_per_mtok]}")
    invite_expire_days: int = Field(default=3, ge=1, le=30, description="Workspace invitation lifetime")

    # WhatsApp Cloud API (Meta). Off until the token and phone number id are set.
    whatsapp_token: str = Field(default="", description="WHATSAPP_TOKEN (permanent system-user token)")
    whatsapp_phone_number_id: str = Field(default="", description="WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_api_version: str = Field(default="v21.0", description="Graph API version")
    # Approved message template with one body parameter; empty = free-form text (24-hour window only).
    whatsapp_template: str = Field(default="", description="WHATSAPP_TEMPLATE")
    whatsapp_template_language: str = Field(default="en", description="WHATSAPP_TEMPLATE_LANGUAGE")

    # Razorpay gateway
    # Credentials are read from the environment only. Never hardcode them here:
    # this file is committed to Git, so a default value is a leaked secret.
    razorpay_key_id: str = Field(default="", description="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", description="RAZORPAY_KEY_SECRET (server-side only)")
    razorpay_webhook_secret: str = Field(default="", description="RAZORPAY_WEBHOOK_SECRET")
    razorpay_mode: str = Field(default="test", description="test | live")

    # Razorpay transaction synchronisation
    razorpay_sync_enabled: bool = Field(default=True, description="Run the background sync loop")
    razorpay_sync_interval_minutes: int = Field(default=30, ge=5, le=1440)
    razorpay_sync_initial_days: int = Field(default=365, ge=1, le=3650, description="How far back the very first import reaches")
    razorpay_sync_overlap_minutes: int = Field(
        default=60, ge=0, le=1440, description="Re-scan window before the last sync so late captures are not missed"
    )

    # Connected apps (services/integrations.py): other apps using Books with a
    # scoped API key, and webhooks Books sends them.
    integration_rate_limit_per_minute: int = Field(default=300, ge=10, le=10000, description="API requests per minute per connected app")
    webhooks_enabled: bool = Field(default=True, description="Run the webhook delivery loop")
    webhook_allowed_hosts: List[str] | str = Field(
        default_factory=list, description="WEBHOOK_ALLOWED_HOSTS: comma-separated internal hosts webhooks may reach (other Rooman apps)"
    )
    webhook_allow_private: bool | None = Field(
        default=None, description="WEBHOOK_ALLOW_PRIVATE: allow webhooks to private/local addresses (default: only outside production)"
    )

    @field_validator("webhook_allowed_hosts", mode="before")
    @classmethod
    def _split_hosts(cls, value):
        if isinstance(value, str):
            return [host.strip().lower() for host in value.split(",") if host.strip()]
        return [str(host).strip().lower() for host in (value or [])]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            val = value.strip()
            if val.startswith("[") and val.endswith("]"):
                import json

                try:
                    return json.loads(val)
                except Exception:
                    pass
            return [origin.strip() for origin in val.split(",") if origin.strip()]
        return value

    @field_validator("razorpay_mode", mode="before")
    @classmethod
    def _normalise_mode(cls, value):
        mode = str(value or "test").strip().lower()
        return mode if mode in {"test", "live"} else "test"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def razorpay_configured(self) -> bool:
        """True when a key id and secret are both present in the environment."""
        return bool(self.razorpay_key_id.strip() and self.razorpay_key_secret.strip())

    @property
    def razorpay_key_id_masked(self) -> str:
        """Safe-to-display key id: rzp_test_ABCD...WXYZ. Never returns the secret."""
        key = self.razorpay_key_id.strip()
        if not key:
            return ""
        return key if len(key) <= 12 else f"{key[:12]}...{key[-4:]}"

    @property
    def razorpay_allows_simulation(self) -> bool:
        """Offline order/refund simulation is a local development aid only."""
        return self.razorpay_mode == "test" and not self.is_production

    @property
    def smtp_configured(self) -> bool:
        """True when outbound email can actually be sent."""
        return bool(self.smtp_user.strip() and self.smtp_password.strip())

    @property
    def frontend_url(self) -> str:
        """Base URL of the web app, for links sent by email (e.g. invite links).

        Reuses the first configured CORS origin rather than a separate setting,
        since that is already exactly the deployed web origin.
        """
        origins = self.cors_origins if isinstance(self.cors_origins, list) else [self.cors_origins]
        return origins[0].rstrip("/") if origins else "http://localhost:3000"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def upload_dir(self) -> str:
        return os.path.join(self.data_dir, "uploads")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.secret_key:
        if settings.is_production:
            raise RuntimeError("SECRET_KEY must be set in production")
        # Ephemeral key for local development only. Tokens are invalidated on restart.
        settings.secret_key = secrets.token_urlsafe(48)
    if settings.is_production and len(settings.secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters in production")
    if settings.webhook_allow_private is None:
        settings.webhook_allow_private = not settings.is_production
    if settings.is_production and settings.auto_create_tables:
        # Migrations are the source of truth in production.
        settings.auto_create_tables = False
    if settings.is_production and settings.razorpay_mode == "live" and not settings.razorpay_webhook_secret:
        raise RuntimeError("RAZORPAY_WEBHOOK_SECRET must be set when running Razorpay in live mode")
    return settings
