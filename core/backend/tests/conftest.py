"""Test setup: a throwaway SQLite database unless TEST_DATABASE_URL is set."""

from __future__ import annotations

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="core-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/core-test.db"
os.environ.setdefault("ENVIRONMENT", "test")
# A throwaway key that encrypts signing keys in tests, and the token issuer.
os.environ.setdefault("KEY_ENCRYPTION_KEYS", "q0n6Hr5u1b7Kp0W3vL9yS2dF8gT4hJ6kM1nB5vC7xZ0=")
os.environ.setdefault("PUBLIC_URL", "https://id.test.rooman")

from fastapi.testclient import TestClient  # noqa: E402

from core_api.main import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
