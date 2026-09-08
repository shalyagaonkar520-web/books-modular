"""SQLAlchemy engine/session management."""
from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    pass


def _build_engine():
    url = settings.database_url
    if url.startswith("sqlite"):
        path = url.replace("sqlite:///", "", 1)
        if path and path != ":memory:":
            directory = os.path.dirname(os.path.abspath(path))
            os.makedirs(directory, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _record):  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    from backend import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)
