"""Regression tests for the authentication hardening pass.

Covers: one-time codes never leaving the server in a response, session
revocation on password resets, X-Forwarded-For spoofing, the per-email OTP
failure cap, the admin password-reset body, explicit nulls on PATCH-style
updates, and refresh-token reuse detection.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import EmailVerification, RefreshToken
from backend.routers import auth as auth_router
from backend.security import hash_token
from backend.services.ratelimit import RateLimiter, client_ip
from tests.conftest import auth, invite_and_accept, register_org

_n = {"i": 0}


def _email(tag: str) -> str:
    _n["i"] += 1
    return f"{tag}{_n['i']}@hardening.example.com"


class _Inbox:
    """Stands in for both OTP emails and records the codes they would carry."""

    def __init__(self, success: bool = True):
        self.success = success
        self.codes: dict[str, str] = {}

    def verify(self, email, verify_url="", otp=""):
        self.codes["verify"] = otp
        return {"success": True} if self.success else {"success": False, "error": "SMTP down"}

    def reset(self, email, otp):
        self.codes["reset"] = otp
        return {"success": True} if self.success else {"success": False, "error": "SMTP down"}

    def __enter__(self):
        self._patches = [
            patch("backend.routers.auth.send_verification_email", side_effect=self.verify),
            patch("backend.routers.auth.send_password_reset_email", side_effect=self.reset),
        ]
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in self._patches:
            p.stop()


@pytest.fixture(autouse=True)
def _fresh_otp_counters():
    auth_router.otp_failures.reset()
    yield
    auth_router.otp_failures.reset()


def _refresh_cookie(c: TestClient) -> str:
    return c.cookies.get("rb_refresh")


def _client_with_cookie(app, raw: str) -> TestClient:
    c = TestClient(app)
    c.cookies.set("rb_refresh", raw)
    return c


# --- 1. OTP never returned ---------------------------------------------------


def test_otp_not_returned_in_development(client, monkeypatch):
    monkeypatch.setattr(auth_router.settings, "environment", "development")
    ctx = register_org(client, "DevOtp")
    signup = _email("devotp")
    with _Inbox() as inbox:
        send = client.post("/api/auth/send-verification-email", json={"email": signup})
        forgot = client.post("/api/auth/forgot-password", json={"email": ctx["email"]})
    assert send.status_code == 200 and forgot.status_code == 200
    for res, code in ((send, inbox.codes["verify"]), (forgot, inbox.codes["reset"])):
        body = res.json()
        assert "devOtp" not in body and "dev_otp" not in body
        assert code not in res.text


def test_verification_send_failure_is_503_without_code(client):
    signup = _email("smtpfail")
    with _Inbox(success=False) as inbox:
        res = client.post("/api/auth/send-verification-email", json={"email": signup})
        assert res.status_code == 503
        assert inbox.codes["verify"] not in res.text
        # The undeliverable code was dropped, so a retry is not stuck behind the cooldown.
        inbox.success = True
        assert client.post("/api/auth/send-verification-email", json={"email": signup}).status_code == 200


def test_forgot_password_send_failure_stays_generic(client):
    ctx = register_org(client, "ResetFail")
    with _Inbox(success=False) as inbox:
        res = client.post("/api/auth/forgot-password", json={"email": ctx["email"]})
    assert res.status_code == 200
    assert inbox.codes["reset"] not in res.text
    assert "If an account exists" in res.json()["message"]


def test_code_is_logged_when_smtp_not_configured(client, caplog):
    signup = _email("nosmtp")
    with _Inbox() as inbox, patch("backend.routers.auth.smtp_configured", return_value=False):
        with caplog.at_level(logging.INFO, logger="roomanbooks.auth"):
            res = client.post("/api/auth/send-verification-email", json={"email": signup})
    assert res.status_code == 200
    assert inbox.codes["verify"] not in res.text
    assert inbox.codes["verify"] in caplog.text


# --- 2. reset-password revokes sessions ---------------------------------------


def test_reset_password_revokes_refresh_tokens(client):
    ctx = register_org(client, "ResetRevoke")
    other = TestClient(client.app)
    assert other.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200
    with _Inbox() as inbox:
        assert client.post("/api/auth/forgot-password", json={"email": ctx["email"]}).status_code == 200
    res = client.post("/api/auth/reset-password", json={"email": ctx["email"], "otp": inbox.codes["reset"], "newPassword": "Rotated123Pw"})
    assert res.status_code == 200
    assert other.post("/api/auth/refresh").status_code == 401


# --- 3. X-Forwarded-For --------------------------------------------------------


def test_rotating_forwarded_for_does_not_escape_login_limit(client, monkeypatch):
    monkeypatch.setattr(auth_router, "login_limiter", RateLimiter(limit=3, window_seconds=60))
    ctx = register_org(client, "Xff")
    codes = []
    for i in range(5):
        res = client.post(
            "/api/auth/login",
            json={"email": ctx["email"], "password": "WrongPass1"},
            headers={"X-Forwarded-For": f"203.0.113.{i}"},
        )
        codes.append(res.status_code)
    assert codes == [401, 401, 401, 429, 429]


def _request(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "client": (peer, 1234), "headers": headers})


def test_client_ip_only_trusts_configured_proxies(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "trusted_proxies", "")
    assert client_ip(_request("198.51.100.7", "1.2.3.4")) == "198.51.100.7"

    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8, ::1")
    # Untrusted peer: header ignored.
    assert client_ip(_request("198.51.100.7", "1.2.3.4")) == "198.51.100.7"
    # Trusted proxy chain: the right-most untrusted hop is the client; anything
    # to its left was supplied by that client and is ignored.
    assert client_ip(_request("10.0.0.5", "6.6.6.6, 9.9.9.9, 10.0.0.7")) == "9.9.9.9"
    assert client_ip(_request("10.0.0.5")) == "10.0.0.5"


# --- 4. OTP attempt cap and rate limits -----------------------------------------


def test_verify_otp_is_rate_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr(auth_router, "login_limiter", RateLimiter(limit=2, window_seconds=60))
    statuses = [client.post("/api/auth/verify-otp", json={"email": _email("rl"), "otp": "000000"}).status_code for _ in range(3)]
    assert statuses == [400, 400, 429]
    statuses = [client.post("/api/auth/verify-email", json={"token": "whatever-token"}).status_code for _ in range(3)]
    assert statuses == [400, 400, 429]


def test_verify_otp_attempt_cap_burns_the_code(client):
    signup = _email("cap")
    with _Inbox() as inbox:
        assert client.post("/api/auth/send-verification-email", json={"email": signup}).status_code == 200
    good = inbox.codes["verify"]
    wrong = "111111" if good != "111111" else "222222"
    statuses = [client.post("/api/auth/verify-otp", json={"email": signup, "otp": wrong}).status_code for _ in range(5)]
    assert statuses == [400, 400, 400, 400, 429]
    # Locked: even the right code is refused now...
    assert client.post("/api/auth/verify-otp", json={"email": signup, "otp": good}).status_code == 429
    with SessionLocal() as db:
        rec = db.query(EmailVerification).filter_by(token_hash=hash_token(f"{signup}:{good}")).one()
        assert rec.status == "EXPIRED"
    # ...and once the window has passed it is still dead: a new code is needed.
    auth_router.otp_failures.reset()
    assert client.post("/api/auth/verify-otp", json={"email": signup, "otp": good}).status_code == 400


def test_reset_password_attempt_cap(client):
    ctx = register_org(client, "ResetCap")
    with _Inbox() as inbox:
        client.post("/api/auth/forgot-password", json={"email": ctx["email"]})
    good = inbox.codes["reset"]
    wrong = "111111" if good != "111111" else "222222"
    body = {"email": ctx["email"], "newPassword": "Another123Pw"}
    statuses = [client.post("/api/auth/reset-password", json={**body, "otp": wrong}).status_code for _ in range(5)]
    assert statuses == [400, 400, 400, 400, 429]
    assert client.post("/api/auth/reset-password", json={**body, "otp": good}).status_code == 429
    auth_router.otp_failures.reset()
    assert client.post("/api/auth/reset-password", json={**body, "otp": good}).status_code == 400
    # Password unchanged.
    assert client.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200


def test_reset_password_unknown_email_looks_like_wrong_code(client):
    res = client.post("/api/auth/reset-password", json={"email": _email("ghost"), "otp": "123456", "newPassword": "Another123Pw"})
    assert res.status_code == 400
    assert "Invalid verification code" in res.json()["detail"]


# --- 5. admin reset-password ----------------------------------------------------


def test_admin_reset_password_body_strength_and_revocation(client):
    ctx = register_org(client, "AdminReset")
    h = auth(ctx["token"])
    email = _email("staff")
    staff = invite_and_accept(client, h, "Staff Person", email, "staff", "Staff12345")
    staff_browser = TestClient(client.app)
    assert staff_browser.post("/api/auth/login", json={"email": email, "password": "Staff12345"}).status_code == 200

    url = f"/api/users/{staff['id']}/reset-password"
    # The old query-string form is gone.
    assert client.post(url, headers=h, params={"new_password": "Query123Pass"}).status_code == 422
    # Same strength rules as sign-up.
    assert client.post(url, headers=h, json={"newPassword": "alllowercase1"}).status_code == 422
    assert client.post(url, headers=h, json={"newPassword": "Short1"}).status_code == 422

    res = client.post(url, headers=h, json={"newPassword": "AdminSet123"})
    assert res.status_code == 200
    assert staff_browser.post("/api/auth/refresh").status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "AdminSet123"}).status_code == 200


# --- 6. change-password keeps the current session -----------------------------


def test_change_password_keeps_current_session_refreshable(client):
    ctx = register_org(client, "KeepSession")
    me = TestClient(client.app)
    login = me.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).json()
    other = TestClient(client.app)
    assert other.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200

    res = me.post(
        "/api/auth/change-password",
        headers=auth(login["accessToken"]),
        json={"currentPassword": ctx["password"], "newPassword": "Changed123Pw"},
    )
    assert res.status_code == 200
    assert "rb_refresh" in res.cookies
    assert me.post("/api/auth/refresh").status_code == 200
    assert other.post("/api/auth/refresh").status_code == 401


# --- 7. explicit nulls ------------------------------------------------------------


def test_explicit_null_is_rejected_for_required_fields(client):
    ctx = register_org(client, "Nulls")
    h = auth(ctx["token"])
    for field in ("name", "country", "fiscalYearStartMonth"):
        res = client.put("/api/organization", headers=h, json={field: None})
        assert res.status_code == 422, (field, res.text)
    # Nullable fields can still be cleared.
    assert client.put("/api/organization", headers=h, json={"legalName": None}).status_code == 200

    uid = ctx["user"]["id"]
    for field in ("name", "role", "isActive"):
        res = client.patch(f"/api/users/{uid}", headers=h, json={field: None})
        assert res.status_code == 422, (field, res.text)
    # The admin is still an active admin.
    me = client.get("/api/auth/me", headers=h).json()["user"]
    assert me["role"] == "admin" and me["isActive"] is True


# --- 8. enumeration ---------------------------------------------------------------


def test_forgot_password_same_answer_for_every_case(client):
    ctx = register_org(client, "Enum")
    h = auth(ctx["token"])
    deactivated = _email("off")
    target = invite_and_accept(client, h, "Gone Person", deactivated, "staff", "Staff12345")
    assert client.patch(f"/api/users/{target['id']}", headers=h, json={"isActive": False}).status_code == 200

    with _Inbox() as inbox:
        answers = [client.post("/api/auth/forgot-password", json={"email": e}) for e in (_email("nobody"), deactivated)]
        assert "reset" not in inbox.codes
        answers.append(client.post("/api/auth/forgot-password", json={"email": ctx["email"]}))
        assert "reset" in inbox.codes
        # Within the cooldown: still the same 200, nothing new sent.
        inbox.codes.clear()
        answers.append(client.post("/api/auth/forgot-password", json={"email": ctx["email"]}))
        assert "reset" not in inbox.codes
    assert {a.status_code for a in answers} == {200}
    assert len({a.text for a in answers}) == 1


def test_login_unknown_email_still_runs_bcrypt(client):
    with patch("backend.routers.auth.verify_password", wraps=auth_router.verify_password) as spy:
        res = client.post("/api/auth/login", json={"email": _email("unknown"), "password": "Whatever123"})
    assert res.status_code == 401
    assert spy.call_count >= 1


# --- 9. refresh-token reuse ---------------------------------------------------------


def _age_rotation(raw: str, seconds: int) -> None:
    with SessionLocal() as db:
        tok = db.query(RefreshToken).filter_by(token_hash=hash_token(raw)).one()
        when = datetime.now(UTC) - timedelta(seconds=seconds)
        tok.revoked_at = when
        tok.expires_at = when
        db.commit()


def test_replayed_rotated_refresh_token_revokes_all_sessions(client):
    ctx = register_org(client, "Reuse")
    victim = TestClient(client.app)
    assert victim.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200
    stolen = _refresh_cookie(victim)
    assert victim.post("/api/auth/refresh").status_code == 200  # rotates `stolen`
    _age_rotation(stolen, 120)

    attacker = _client_with_cookie(client.app, stolen)
    assert attacker.post("/api/auth/refresh").status_code == 401
    # The whole family is gone, including the victim's current token.
    assert victim.post("/api/auth/refresh").status_code == 401


def test_immediate_replay_within_grace_does_not_revoke(client):
    ctx = register_org(client, "Grace")
    tab = TestClient(client.app)
    assert tab.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200
    old = _refresh_cookie(tab)
    assert tab.post("/api/auth/refresh").status_code == 200
    # A second tab racing with the same (just rotated) cookie.
    assert _client_with_cookie(client.app, old).post("/api/auth/refresh").status_code == 401
    assert tab.post("/api/auth/refresh").status_code == 200


def test_logged_out_token_replay_is_not_treated_as_theft(client):
    ctx = register_org(client, "LogoutReplay")
    a = TestClient(client.app)
    assert a.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200
    raw = _refresh_cookie(a)
    assert a.post("/api/auth/logout").status_code == 200
    b = TestClient(client.app)
    assert b.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200
    assert _client_with_cookie(client.app, raw).post("/api/auth/refresh").status_code == 401
    assert b.post("/api/auth/refresh").status_code == 200


# --- 10 / 11. retired link endpoint, admin-only user list ------------------------------


def test_verify_email_link_is_retired(client):
    res = client.post("/api/auth/verify-email", json={"token": "some-old-link-token"})
    assert res.status_code == 400
    assert "6-digit code" in res.json()["detail"]


def test_user_list_is_admin_only(client):
    ctx = register_org(client, "UserList")
    h = auth(ctx["token"])
    email = _email("lister")
    invite_and_accept(client, h, "Staff Lister", email, "staff", "Staff12345")
    staff = client.post("/api/auth/login", json={"email": email, "password": "Staff12345"}).json()
    assert client.get("/api/users", headers=auth(staff["accessToken"])).status_code == 403
    assert client.get("/api/users", headers=h).status_code == 200
