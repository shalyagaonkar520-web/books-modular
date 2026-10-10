"""Settings for the Rooman Bookings service, read from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    debug: bool = False

    # No default database: Bookings always runs on its own Postgres. Tests set a
    # SQLite URL explicitly.
    database_url: str = Field(default="", alias="DATABASE_URL")
    # Migrations run as the schema owner; the app itself connects as a
    # least-privilege runtime user. Falls back to DATABASE_URL when unset.
    migrations_database_url: str = Field(default="", alias="MIGRATIONS_DATABASE_URL")

    # Public base URL of this service, e.g. https://bookings.<domain>.
    public_url: str = ""
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. Bookings needs its own database.")
    return settings
