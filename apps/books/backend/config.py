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
    database_url: str = Field(default="sqlite:///./data/roomanbooks.db")
    data_dir: str = Field(default="./data", description="Directory for SQLite DB and uploaded files")
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

    # Uploads
    max_upload_size_mb: int = 25

    # Outbound email (SMTP). Read from the environment only -- this file is
    # committed, so a default here would be a leaked credential.
    smtp_host: str = Field(default="smtp.gmail.com")
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="", description="SMTP_USER")
    smtp_password: str = Field(default="", description="SMTP_PASSWORD (app password)")
    smtp_sender_name: str = Field(default="Rooman Books Accounts")

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
    razorpay_sync_initial_days: int = Field(
        default=365, ge=1, le=3650, description="How far back the very first import reaches"
    )
    razorpay_sync_overlap_minutes: int = Field(
        default=60, ge=0, le=1440, description="Re-scan window before the last sync so late captures are not missed"
    )


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
    if settings.is_production and settings.auto_create_tables:
        # Migrations are the source of truth in production.
        settings.auto_create_tables = False
    if settings.is_production and settings.razorpay_mode == "live" and not settings.razorpay_webhook_secret:
        raise RuntimeError("RAZORPAY_WEBHOOK_SECRET must be set when running Razorpay in live mode")
    return settings
