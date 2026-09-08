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
    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])
    allow_public_signup: bool = Field(default=True, description="If false, only invited users can join")
    login_rate_limit_per_minute: int = 10

    # Uploads
    max_upload_size_mb: int = 25

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

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
    return settings
