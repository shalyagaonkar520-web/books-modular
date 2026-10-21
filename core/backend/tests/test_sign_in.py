"""User sign-in (OIDC code flow + PKCE): the full journey and the attacks it must refuse."""

from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import bcrypt
import jwt
import pytest
from fastapi.testclient import TestClient
from rooman_sdk.tokens import TokenVerifier, check_access
from sqlalchemy import select

from core_api import clients
from core_api import models as m
from core_api.db import Base, SessionLocal, engine
from core_api.main import app
from core_api.routers import oauth, oidc

ISSUER = "https://id.test.rooman"
CALLBACK = "https://books.test.rooman/auth/callback"
PASSWORD = "Str0ngPass!"
PAGE = {"X-Rooman-Signin": "1"}


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


def _org(s, name="Acme Traders", modules=("customers", "invoices"), status="active", sub_status="active") -> m.Organization:
    org = m.Organization(code=f"o-{uuid.uuid4().hex[:6]}", name=name, status=status, trial_ends_at=datetime.now(UTC) + timedelta(days=3))
    s.add(org)
    s.flush()
    s.add(m.OrgApp(org_id=org.id, app_key="books"))
    s.add(m.OrgSubscription(org_id=org.id, app_key="books", status=sub_status, modules=list(modules) if modules else None))
    return org


def _user(email="ravi@acme.test", orgs=(), role="admin", status="active", password=PASSWORD) -> uuid.UUID:
    with SessionLocal() as s:
        user = m.User(
            email=email, name="Ravi Kumar", status=status, password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()
        )
        s.add(user)
        s.flush()
        made = list(orgs) or [_org(s)]
        for org in made:
            s.add(m.Membership(user_id=user.id, org_id=org.id if isinstance(org, m.Organization) else org, role=role))
        s.commit()
        return user.id


def _web_client(public=True) -> tuple[str, str | None]:
    with SessionLocal() as s:
        client, secret = clients.create_web(s, "books", [CALLBACK], public=public)
        s.commit()
        return client.client_id, secret


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def _authorize(api, client_id, challenge, state="st-1", nonce="n-1", **extra):
    params = {
        "client_id": client_id,
        "redirect_uri": CALLBACK,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        **extra,
    }
    return api.get("/api/oauth/authorize", params=params)


def _request_id(res) -> str:
    assert res.status_code == 302, res.text
    location = urlparse(res.headers["location"])
    assert location.path == "/signin"
    return parse_qs(location.query)["request"][0]


def _code_from(url: str, state="st-1") -> str:
    query = parse_qs(urlparse(url).query)
    assert url.startswith(CALLBACK) and query["state"] == [state]
    return query["code"][0]


def _sign_in(api, client_id, email="ravi@acme.test"):
    verifier, challenge = _pkce()
    res = _authorize(api, client_id, challenge)
    if res.headers["location"].startswith(CALLBACK):  # already signed in at Core: straight back with a code
        return _code_from(res.headers["location"]), verifier
    request_id = _request_id(res)
    res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return _code_from(res.json()["redirect"]), verifier


def _exchange(api, client_id, code, verifier, secret=None):
    data = {"grant_type": "authorization_code", "client_id": client_id, "code": code, "redirect_uri": CALLBACK, "code_verifier": verifier}
    if secret:
        data["client_secret"] = secret
    return api.post("/api/oauth/token", data=data)


def _public_key(api):
    return jwt.algorithms.RSAAlgorithm.from_jwk(api.get("/api/oauth/jwks").json()["keys"][0])


# --------------------------------------------------------------------------- #
# The happy path
# --------------------------------------------------------------------------- #
def test_full_sign_in_gives_books_a_token_its_sdk_accepts(api):
    _user()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    res = _exchange(api, client_id, code, verifier)
    assert res.status_code == 200, res.text
    tokens = res.json()
    assert {"access_token", "id_token", "refresh_token"} <= set(tokens) and tokens["token_type"] == "Bearer"

    claims = TokenVerifier(issuer=ISSUER, audience="books", public_key=_public_key(api)).verify(tokens["access_token"])
    assert claims.role == "admin" and claims.apps == ["books"] and claims.modules == {"books": ["customers", "invoices"]}
    check_access(claims, "books", "POST", module="invoices")  # allowed
    id_token = jwt.decode(tokens["id_token"], _public_key(api), algorithms=["RS256"], audience=client_id, issuer=ISSUER)
    assert id_token["nonce"] == "n-1" and id_token["email"] == "ravi@acme.test" and id_token["name"] == "Ravi Kumar"

    info = api.get("/api/oauth/userinfo", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert info.status_code == 200 and info.json()["email"] == "ravi@acme.test"


def test_signed_in_browser_goes_straight_back_to_the_app(api):
    _user()
    client_id, _ = _web_client()
    _sign_in(api, client_id)  # sets the Core session cookie on this client
    _, challenge = _pkce()
    res = _authorize(api, client_id, challenge, state="st-2")
    assert res.status_code == 302 and res.headers["location"].startswith(CALLBACK)
    _code_from(res.headers["location"], state="st-2")
    # prompt=login always asks again
    assert urlparse(_authorize(api, client_id, challenge, prompt="login").headers["location"]).path == "/signin"


def test_staff_modules_are_narrowed_by_their_own_access(api):
    with SessionLocal() as s:
        org = _org(s, modules=("customers", "invoices", "bills"))
        s.commit()
        org_id = org.id
    user_id = _user(orgs=[org_id], role="staff")
    with SessionLocal() as s:
        s.add(m.UserModuleAccess(user_id=user_id, org_id=org_id, app_key="books", modules=["invoices", "payroll"]))
        s.commit()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    access = _exchange(api, client_id, code, verifier).json()["access_token"]
    claims = TokenVerifier(issuer=ISSUER, audience="books", public_key=_public_key(api)).verify(access)
    assert claims.role == "staff" and claims.modules == {"books": ["invoices"]}


def test_user_in_two_organizations_chooses_one(api):
    with SessionLocal() as s:
        a, b = _org(s, "Alpha"), _org(s, "Beta")
        s.commit()
        a_id, b_id = a.id, b.id
    _user(orgs=[a_id, b_id])
    client_id, _ = _web_client()
    verifier, challenge = _pkce()
    request_id = _request_id(_authorize(api, client_id, challenge))
    res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": PASSWORD})
    assert [o["name"] for o in res.json()["chooseOrganization"]] == ["Alpha", "Beta"]
    page = api.get(f"/api/oauth/requests/{request_id}").json()
    assert page["signedIn"] is True and page["app"]["name"] == "Rooman Books" and len(page["organizations"]) == 2
    chosen = api.post("/api/oauth/choose-org", headers=PAGE, json={"request_id": request_id, "org_id": str(b_id)})
    code = _code_from(chosen.json()["redirect"])
    access = _exchange(api, client_id, code, verifier).json()["access_token"]
    claims = TokenVerifier(issuer=ISSUER, audience="books", public_key=_public_key(api)).verify(access)
    assert claims.org_id == str(b_id)


def test_refresh_rotates_and_a_reused_token_revokes_the_family(api):
    _user()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    first = _exchange(api, client_id, code, verifier).json()["refresh_token"]
    second = api.post("/api/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": first})
    assert second.status_code == 200 and second.json()["refresh_token"] != first
    replay = api.post("/api/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": first})
    assert replay.status_code == 400
    # The stolen-token signal also kills the good one.
    after = api.post(
        "/api/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": second.json()["refresh_token"]}
    )
    assert after.status_code == 400


def test_logout_ends_the_session_and_its_refresh_tokens(api):
    _user()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    refresh = _exchange(api, client_id, code, verifier).json()["refresh_token"]
    res = api.get("/api/oauth/logout", params={"client_id": client_id, "post_logout_redirect_uri": CALLBACK})
    assert res.status_code == 302 and res.headers["location"] == CALLBACK
    assert (
        api.post("/api/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh}).status_code
        == 400
    )
    _, challenge = _pkce()
    assert urlparse(_authorize(api, client_id, challenge).headers["location"]).path == "/signin"


def test_confidential_web_client_must_send_its_secret(api):
    _user()
    client_id, secret = _web_client(public=False)
    code, verifier = _sign_in(api, client_id)
    assert _exchange(api, client_id, code, verifier).status_code == 401
    code, verifier = _sign_in(api, client_id)
    assert _exchange(api, client_id, code, verifier, secret=secret).status_code == 200


# --------------------------------------------------------------------------- #
# What must be refused
# --------------------------------------------------------------------------- #
def test_unknown_client_or_unregistered_redirect_never_redirects(api):
    client_id, _ = _web_client()
    _, challenge = _pkce()
    assert api.get("/api/oauth/authorize", params={"client_id": "nope", "redirect_uri": CALLBACK}).status_code == 400
    evil = _authorize(api, client_id, challenge, redirect_uri="https://evil.example/steal")
    assert evil.status_code == 400 and "location" not in evil.headers


def test_bad_requests_go_back_to_the_app_with_an_error(api):
    client_id, _ = _web_client()
    no_pkce = _authorize(api, client_id, "short", code_challenge_method="plain")
    assert no_pkce.status_code == 302 and "error=invalid_request" in no_pkce.headers["location"]
    no_openid = _authorize(api, client_id, _pkce()[1], scope="profile")
    assert "error=invalid_scope" in no_openid.headers["location"]


def test_code_is_single_use_bound_to_pkce_and_redirect(api):
    _user()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    assert _exchange(api, client_id, code, "x" * 43).status_code == 400  # wrong verifier
    code, verifier = _sign_in(api, client_id)
    bad_redirect = api.post(
        "/api/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": code,
            "redirect_uri": CALLBACK + "x",
            "code_verifier": verifier,
        },
    )
    assert bad_redirect.status_code == 400
    code, verifier = _sign_in(api, client_id)
    first = _exchange(api, client_id, code, verifier)
    assert first.status_code == 200
    assert _exchange(api, client_id, code, verifier).status_code == 400  # replay
    # The replay also revokes what the code produced.
    refresh = first.json()["refresh_token"]
    assert (
        api.post("/api/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh}).status_code
        == 400
    )


def test_another_client_cannot_use_the_code(api):
    _user()
    client_id, _ = _web_client()
    other_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    assert _exchange(api, other_id, code, verifier).status_code == 400


def test_expired_code_is_refused(api):
    _user()
    client_id, _ = _web_client()
    code, verifier = _sign_in(api, client_id)
    with SessionLocal() as s:
        for row in s.scalars(select(m.AuthCode)):
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        s.commit()
    assert _exchange(api, client_id, code, verifier).status_code == 400


def test_wrong_passwords_lock_the_account(api):
    _user()
    client_id, _ = _web_client()
    _, challenge = _pkce()
    request_id = _request_id(_authorize(api, client_id, challenge))
    for _ in range(5):
        res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": "wrong"})
        assert res.status_code == 401
    locked = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": PASSWORD})
    assert locked.status_code == 423 and locked.json()["code"] == "locked"


def test_unknown_email_and_wrong_password_look_the_same(api):
    _user()
    client_id, _ = _web_client()
    request_id = _request_id(_authorize(api, client_id, _pkce()[1]))
    a = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "nobody@acme.test", "password": "x"})
    b = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": "x"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_disabled_users_and_inactive_organizations_cannot_sign_in(api):
    _user(email="gone@acme.test", status="disabled")
    with SessionLocal() as s:
        org = _org(s, "Suspended", status="suspended")
        s.commit()
        org_id = org.id
    _user(email="susp@acme.test", orgs=[org_id])
    client_id, _ = _web_client()
    request_id = _request_id(_authorize(api, client_id, _pkce()[1]))
    res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "gone@acme.test", "password": PASSWORD})
    assert res.status_code == 403 and res.json()["code"] == "disabled"
    res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "susp@acme.test", "password": PASSWORD})
    assert res.status_code == 403 and res.json()["code"] == "no_organization"


def test_choose_org_refuses_an_organization_the_user_is_not_in(api):
    with SessionLocal() as s:
        a, b, stranger = _org(s, "Alpha"), _org(s, "Beta"), _org(s, "Stranger")
        s.commit()
        a_id, b_id, stranger_id = a.id, b.id, stranger.id
    _user(orgs=[a_id, b_id])
    client_id, _ = _web_client()
    request_id = _request_id(_authorize(api, client_id, _pkce()[1]))
    api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": PASSWORD})
    res = api.post("/api/oauth/choose-org", headers=PAGE, json={"request_id": request_id, "org_id": str(stranger_id)})
    assert res.status_code == 403


def test_sign_in_page_calls_need_the_page_header(api):
    _user()
    client_id, _ = _web_client()
    request_id = _request_id(_authorize(api, client_id, _pkce()[1]))
    res = api.post("/api/oauth/login", json={"request_id": request_id, "email": "ravi@acme.test", "password": PASSWORD})
    assert res.status_code == 403


def test_app_not_in_the_plan_gets_no_token(api):
    _user()
    with SessionLocal() as s:
        client, _ = clients.create_web(s, "bookings", [CALLBACK], public=True)
        s.commit()
        client_id = client.client_id
    code, verifier = _sign_in(api, client_id)
    res = _exchange(api, client_id, code, verifier)
    assert res.status_code == 400 and "plan" in res.json()["error_description"]


def test_session_cookie_is_http_only_and_scoped(api):
    _user()
    client_id, _ = _web_client()
    request_id = _request_id(_authorize(api, client_id, _pkce()[1]))
    res = api.post("/api/oauth/login", headers=PAGE, json={"request_id": request_id, "email": "ravi@acme.test", "password": PASSWORD})
    cookie = res.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/api/oauth" in cookie


def test_web_clients_cannot_take_service_tokens(api):
    client_id, secret = _web_client(public=False)
    res = api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
    assert res.status_code == 401


def test_redirect_uris_must_be_https(api):
    with SessionLocal() as s, pytest.raises(ValueError):
        clients.create_web(s, "books", ["http://books.example.com/cb"], public=True)


# --------------------------------------------------------------------------- #
# Signing in on Core's own page (no app waiting): the person's apps are offered
# --------------------------------------------------------------------------- #
BOOKS_START = "https://books.test.rooman/api/auth/rooman-one/start"


@pytest.fixture
def links(monkeypatch):
    from core_api.config import get_settings

    monkeypatch.setattr(get_settings(), "app_links_raw", f"books={BOOKS_START},bookings=https://bookings.test.rooman/start")


def test_direct_sign_in_opens_the_session_and_lists_the_apps(api, links):
    _user()
    assert api.get("/api/oauth/me").json()["signedIn"] is False
    res = api.post("/api/oauth/login", headers=PAGE, json={"email": "ravi@acme.test", "password": PASSWORD})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["signedIn"] is True and body["user"]["email"] == "ravi@acme.test"
    # Only the apps the organization has (books), not every linked app (bookings).
    assert body["apps"] == [{"key": "books", "name": "Rooman Books", "url": BOOKS_START, "organizations": ["Acme Traders"]}]
    assert oidc.COOKIE in res.cookies
    assert api.get("/api/oauth/me").json()["apps"][0]["key"] == "books"


def test_after_a_direct_sign_in_apps_open_without_a_password(api, links):
    _user()
    api.post("/api/oauth/login", headers=PAGE, json={"email": "ravi@acme.test", "password": PASSWORD})
    client_id, _ = _web_client()
    verifier, challenge = _pkce()
    res = _authorize(api, client_id, challenge)
    assert res.headers["location"].startswith(CALLBACK)  # straight back to the app with a code
    assert _exchange(api, client_id, _code_from(res.headers["location"]), verifier).status_code == 200


def test_direct_sign_in_refuses_wrong_passwords_and_needs_the_page_header(api, links):
    _user()
    assert api.post("/api/oauth/login", headers=PAGE, json={"email": "ravi@acme.test", "password": "nope"}).status_code == 401
    assert api.post("/api/oauth/login", json={"email": "ravi@acme.test", "password": PASSWORD}).status_code == 403
    assert api.get("/api/oauth/me").json()["signedIn"] is False


def test_signing_out_ends_the_rooman_one_session(api, links):
    _user()
    api.post("/api/oauth/login", headers=PAGE, json={"email": "ravi@acme.test", "password": PASSWORD})
    api.get("/api/oauth/logout")
    assert api.get("/api/oauth/me").json()["signedIn"] is False


def test_no_apps_without_links(api):
    _user()
    body = api.post("/api/oauth/login", headers=PAGE, json={"email": "ravi@acme.test", "password": PASSWORD}).json()
    assert body["signedIn"] is True and body["apps"] == []
