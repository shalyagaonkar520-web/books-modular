"""Unexpected errors answer in a controlled way: a readable message and a reference that matches the server log."""

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.main import app


def _boom():
    raise RuntimeError("kaboom")


def _duplicate():
    raise IntegrityError("INSERT ...", {}, Exception("UNIQUE constraint failed: invoices.invoice_number"))


def _db_down():
    raise OperationalError("SELECT 1", {}, Exception("database is locked"))


app.add_api_route("/api/__test__/boom", _boom, methods=["GET"])
app.add_api_route("/api/__test__/db-down", _db_down, methods=["GET"])
app.add_api_route("/api/__test__/duplicate", _duplicate, methods=["GET"])


def test_unexpected_error_returns_500_with_a_reference():
    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/__test__/boom", headers={"X-Request-ID": "abc123"})
    assert res.status_code == 500
    body = res.json()
    assert body["requestId"] == "abc123" and "abc123" in body["detail"] and "kaboom" not in body["detail"]


def test_database_conflict_returns_409_not_500():
    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/__test__/duplicate")
    assert res.status_code == 409
    assert "duplicate" in res.json()["detail"].lower() and res.json()["requestId"]


def test_database_unavailable_returns_503_to_retry():
    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/__test__/db-down")
    assert res.status_code == 503 and res.headers["retry-after"] == "5"
    assert "try again" in res.json()["detail"] and "locked" not in res.json()["detail"]
