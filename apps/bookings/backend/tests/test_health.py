from __future__ import annotations


def test_health_reports_database_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["database"] == "ok"
    assert body["service"] == "Rooman Bookings"


def test_every_response_carries_a_request_id(client):
    response = client.get("/api/health", headers={"X-Request-ID": "abc123"})
    assert response.headers["X-Request-ID"] == "abc123"
    generated = client.get("/api/health").headers["X-Request-ID"]
    assert len(generated) == 12


def test_secure_headers_are_set(client):
    response = client.get("/api/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_unknown_route_is_404(client):
    assert client.get("/api/nope").status_code == 404
