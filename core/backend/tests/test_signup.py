"""Create an organization on Rooman One: proven email, created once, opened by every app."""

from __future__ import annotations

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from core_api import models as m
from core_api import signup
from core_api.config import get_settings
from core_api.db import Base, SessionLocal, engine
from core_api.main import app
from core_api.routers import oauth, oidc
from tests.test_sign_in import PAGE, _authorize, _code_from, _exchange, _pkce, _public_key, _user, _web_client


@pytest.fixture(autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    oauth._failures.reset()
    oidc._login_failures.reset()
    with SessionLocal() as s:
        s.add_all([m.App(key="books", name="Rooman Books"), m.App(key="bookings", name="Rooman Bookings")])
        s.commit()
    yield


@pytest.fixture
def api() -> TestClient:
    return TestClient(app, follow_redirects=False)


DETAILS = {"name": "Asha Rao", "email": "Asha@NewCo.test", "password": "Str0ngPass!", "organization": "NewCo Traders"}


@pytest.fixture
def open_signup(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "allow_signup", True)
    monkeypatch.setattr(settings, "signup_apps_raw", "books")
    monkeypatch.setattr(settings, "app_links_raw", "books=https://books.test.rooman/api/auth/rooman-one/start")
    signup._code_failures.reset()
    oidc._signup_starts.reset()
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(signup, "send_code", lambda email, name, code: sent.append((email, code)))
    return sent


def _start(api, **changes):
    return api.post("/api/oauth/signup", headers=PAGE, json={**DETAILS, **changes})


def test_closed_unless_switched_on(api):
    assert _start(api).status_code == 403
    assert api.get("/api/oauth/me").json()["signupAllowed"] is False


def test_signup_creates_the_organization_once_and_signs_in(api, open_signup):
    assert api.get("/api/oauth/me").json() == {"signedIn": False, "signupAllowed": True}
    res = _start(api)
    assert res.status_code == 200, res.text
    assert open_signup[0][0] == "asha@newco.test" and len(open_signup[0][1]) == 6
    with SessionLocal() as s:  # nothing is created before the code comes back
        assert s.scalar(select(m.User).where(m.User.email == "asha@newco.test")) is None

    done = api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": res.json()["ticket"], "code": open_signup[0][1]})
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["signedIn"] is True and body["user"]["email"] == "asha@newco.test"
    assert [a["key"] for a in body["apps"]] == ["books"] and body["apps"][0]["organizations"] == ["NewCo Traders"]
    assert oidc.COOKIE in done.cookies
    with SessionLocal() as s:
        user = s.scalar(select(m.User).where(m.User.email == "asha@newco.test"))
        membership = s.scalar(select(m.Membership).where(m.Membership.user_id == user.id))
        org = s.get(m.Organization, membership.org_id)
        assert membership.role == "admin" and org.name == "NewCo Traders" and org.status == "active"
        assert [a.app_key for a in s.scalars(select(m.OrgApp).where(m.OrgApp.org_id == org.id))] == ["books"]

    # Opening Books from here: straight through, and the id_token tells Books what to set up.
    client_id, _ = _web_client()
    verifier, challenge = _pkce()
    location = _authorize(api, client_id, challenge).headers["location"]
    tokens = _exchange(api, client_id, _code_from(location), verifier).json()
    claims = jwt.decode(tokens["id_token"], _public_key(api), algorithms=["RS256"], audience=client_id, options={"verify_iss": False})
    assert claims["org_name"] == "NewCo Traders" and claims["role"] == "admin" and claims["email"] == "asha@newco.test"


def test_the_same_ticket_cannot_make_a_second_account(api, open_signup):
    ticket = _start(api).json()["ticket"]
    code = open_signup[0][1]
    assert api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": ticket, "code": code}).status_code == 200
    again = api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": ticket, "code": code})
    assert again.status_code == 409


def test_wrong_codes_are_limited(api, open_signup):
    ticket = _start(api).json()["ticket"]
    right = open_signup[0][1]
    wrong = "000000" if right != "000000" else "111111"
    for _ in range(signup.CODE_TRIES):
        assert api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": ticket, "code": wrong}).status_code == 400
    blocked = api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": ticket, "code": right})
    assert blocked.status_code == 429  # even the right code, once too many wrong ones were tried


def test_tampered_ticket_is_refused(api, open_signup):
    ticket = _start(api).json()["ticket"]
    res = api.post("/api/oauth/signup/confirm", headers=PAGE, json={"ticket": ticket[:-6] + "AAAAAA", "code": open_signup[0][1]})
    assert res.status_code == 400 and res.json()["code"] == "ticket_expired"


def test_existing_email_and_weak_passwords_are_refused(api, open_signup):
    _user(email="asha@newco.test")
    assert _start(api).status_code == 409
    assert _start(api, email="new@newco.test", password="weakpass").json()["code"] == "weak_password"
    assert _start(api, email="not-an-email").json()["code"] == "bad_email"
    assert open_signup == []  # no email sent for refused details


def test_signup_calls_need_the_page_header(api, open_signup):
    assert api.post("/api/oauth/signup", json=DETAILS).status_code == 403
    assert api.post("/api/oauth/signup/confirm", json={"ticket": "x", "code": "123456"}).status_code == 403


def test_production_without_email_refuses_rather_than_leaking_the_code(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "smtp_host", "")
    with pytest.raises(signup.SignupError) as caught:
        signup.send_code("a@b.test", "A", "123456")
    assert caught.value.status == 503
