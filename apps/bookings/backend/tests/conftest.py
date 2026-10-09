"""Test setup: a throwaway SQLite database unless TEST_DATABASE_URL is set."""

from __future__ import annotations

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="bookings-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/bookings-test.db"
os.environ.setdefault("ENVIRONMENT", "test")

from fastapi.testclient import TestClient  # noqa: E402

from bookings_api.main import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
