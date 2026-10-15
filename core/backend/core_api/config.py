"""Settings for the Rooman One Core service, read from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    debug: bool = False

    # No default database: Core always runs on its own Postgres. Tests set a
    # SQLite URL explicitly.
    database_url: str = Field(default="", alias="DATABASE_URL")
    # Migrations run as the schema owner; the app itself connects as a
    # least-privilege runtime user. Falls back to DATABASE_URL when unset.
    migrations_database_url: str = Field(default="", alias="MIGRATIONS_DATABASE_URL")

    # Public base URL of this service, e.g. https://id.<domain>. Used as the
    # token issuer from Phase 1; empty means "not configured yet".
    public_url: str = ""
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")

    # Fernet keys that encrypt the token-signing private keys stored in the
    # database, comma-separated, newest first. Only the first encrypts; the
    # others still decrypt, so this key can itself be rotated.
    key_encryption_keys_raw: str = Field(default="", alias="KEY_ENCRYPTION_KEYS")
    # How long a replaced signing key stays in /jwks. Must be longer than the
    # access-token lifetime plus the apps' JWKS cache time.
    signing_key_overlap_hours: int = 24
    # Lifetime of the tokens apps get from POST /token (client credentials).
    service_token_minutes: int = Field(default=15, ge=1, le=60)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def key_encryption_keys(self) -> list[str]:
        return [key.strip() for key in self.key_encryption_keys_raw.split(",") if key.strip()]

    @property
    def issuer(self) -> str:
        return self.public_url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. Core needs its own database.")
    return settings
