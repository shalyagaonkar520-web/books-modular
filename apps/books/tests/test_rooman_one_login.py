"""Sign in with Rooman One: Books trusts Core's signed id_token, and nothing else."""

from __future__ import annotations

import time
import urllib.parse
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.config import get_settings
from backend.routers import rooman_one_login as sso
from tests.conftest import auth, register_org

ISSUER = "https://one.example.test"
CLIENT_ID = "books-web-test"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def core(monkeypatch):
    """A fake Core: real RS256 tokens, no network."""
    settings = get_settings()
    monkeypatch.setattr(settings, "oidc_issuer", ISSUER)
    monkeypatch.setattr(settings, "oidc_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "oidc_client_secret", "test-secret")
    monkeypatch.setattr(settings, "app_url", "https://books.example.test")
    fake = {"claims": {}, "key": KEY, "token_reply": None, "exchanged": []}
    monkeypatch.setattr(
        sso,
        "discovery",
        lambda: {
            "issuer": ISSUER,
            "authorization_endpoint": f"{ISSUER}/api/oauth/authorize",
            "token_endpoint": f"{ISSUER}/api/oauth/token",
            "jwks_uri": f"{ISSUER}/api/oauth/jwks",
        },
    )
    monkeypatch.setattr(sso, "signing_key", lambda token: KEY.public_key())

    def exchange(code, verifier):
        fake["exchanged"].append((code, verifier))
        if fake["token_reply"] is not None:
            return fake["token_reply"]
        now = int(time.time())
        claims = {"iss": ISSUER, "aud": CLIENT_ID, "iat": now, "exp": now + 300, **fake["claims"]}
        return {"id_token": jwt.encode(claims, fake["key"], algorithm="RS256"), "access_token": "x", "token_type": "Bearer"}

    monkeypatch.setattr(sso, "exchange", exchange)
    return fake


def _start(client, next_path="/invoices"):
    res = client.get("/api/auth/rooman-one/start", params={"next": next_path}, follow_redirects=False)
    assert res.status_code == 303, res.text
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(res.headers["location"]).query))
    return res, query


def _sign_in(client, core, user_id: str, org_id: str, next_path="/invoices", **claims):
    _, query = _start(client, next_path)
    core["claims"] = {"sub": str(uuid.UUID(user_id)), "org_id": str(uuid.UUID(org_id)), "nonce": query["nonce"], **claims}
    return client.get("/api/auth/rooman-one/callback", params={"code": "abc", "state": query["state"]}, follow_redirects=False)


def _error(res) -> str:
    assert res.status_code == 303
    location = urllib.parse.urlsplit(res.headers["location"])
    assert location.path == "/login"
    return dict(urllib.parse.parse_qsl(location.query))["sso_error"]


def test_off_until_configured(client):
    assert client.get("/api/auth/rooman-one").json() == {"enabled": False}
    assert client.get("/api/auth/rooman-one/start", follow_redirects=False).status_code == 404


def test_start_sends_the_browser_to_core_with_pkce(client, core):
    assert client.get("/api/auth/rooman-one").json() == {"enabled": True}
    res, query = _start(client)
    assert res.headers["location"].startswith(f"{ISSUER}/api/oauth/authorize?")
    assert query["client_id"] == CLIENT_ID and query["code_challenge_method"] == "S256" and len(query["code_challenge"]) == 43
    assert query["redirect_uri"] == "https://books.example.test/api/auth/rooman-one/callback"
    assert "rb_oidc" in res.cookies


def test_signs_in_to_the_same_books_account(client, core):
    ctx = register_org(client, "SsoOk")
    res = _sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"])
    assert res.status_code == 303 and res.headers["location"] == "https://books.example.test/invoices"
    assert core["exchanged"][0][0] == "abc" and len(core["exchanged"][0][1]) >= 43  # code + PKCE verifier
    # The app restores the session from the refresh cookie, as on any page load.
    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200, refreshed.text
    me = client.get("/api/auth/me", headers=auth(refreshed.json()["accessToken"]))
    assert me.json()["user"]["email"] == ctx["email"]


def test_unknown_user_or_other_organization_is_refused(client, core):
    ctx = register_org(client, "SsoNo")
    assert _error(_sign_in(client, core, uuid.uuid4().hex, ctx["org"]["id"])) == sso.NO_ACCOUNT
    assert _error(_sign_in(client, core, ctx["user"]["id"], uuid.uuid4().hex)) == sso.OTHER_ORG


def test_tokens_not_from_core_are_refused(client, core):
    ctx = register_org(client, "SsoForged")
    core["key"] = OTHER_KEY  # signed by someone else
    assert _error(_sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"])) == sso.TRY_AGAIN
    core["key"] = KEY
    assert _error(_sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"], aud="some-other-app")) == sso.TRY_AGAIN
    assert _error(_sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"], nonce="replayed")) == sso.TRY_AGAIN
    assert _error(_sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"], iss="https://evil.test")) == sso.TRY_AGAIN


def test_state_must_match_the_browser_that_started(client, core):
    _start(client)
    res = client.get("/api/auth/rooman-one/callback", params={"code": "abc", "state": "forged"}, follow_redirects=False)
    assert _error(res) == sso.TRY_AGAIN
    client.cookies.clear()
    res = client.get("/api/auth/rooman-one/callback", params={"code": "abc", "state": "x"}, follow_redirects=False)
    assert _error(res) == sso.TRY_AGAIN


def test_books_not_in_plan(client, core):
    ctx = register_org(client, "SsoPlan")
    core["token_reply"] = {"error": "invalid_grant", "error_description": "app_not_in_plan"}
    assert _error(_sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"])) == sso.NOT_IN_PLAN


def test_next_stays_inside_books(client, core):
    ctx = register_org(client, "SsoNext")
    for bad in ("https://evil.test/", "//evil.test/x", "/\\evil.test"):
        res = _sign_in(client, core, ctx["user"]["id"], ctx["org"]["id"], next_path=bad)
        assert res.headers["location"] == "https://books.example.test/"


def test_flow_cookie_cannot_be_forged():
    sealed = sso.seal({"state": "s"})
    assert sso.unseal(sealed)["state"] == "s"
    body, mac = sealed.rsplit(".", 1)
    assert sso.unseal(body + "." + mac[:-2] + "AA") is None
    assert sso.unseal("garbage") is None


# --------------------------------------------------------------------------- #
# First sign-in of an organization or person created on Rooman One
# --------------------------------------------------------------------------- #
def test_new_organization_from_rooman_one_is_set_up_on_first_sign_in(client, core):
    from sqlalchemy import func, select

    from backend.db import SessionLocal
    from backend.models import Account, BankAccount, Organization, User

    org_id, user_id = uuid.uuid4().hex, uuid.uuid4().hex
    res = _sign_in(client, core, user_id, org_id, email="asha@newco.test", name="Asha Rao", org_name="NewCo Traders", role="admin")
    assert res.status_code == 303 and res.headers["location"] == "https://books.example.test/invoices", res.headers["location"]
    with SessionLocal() as db:
        org = db.get(Organization, org_id)
        user = db.get(User, user_id)
        assert org.name == "NewCo Traders" and org.approval_status == "approved" and org.subscription_status == "trial"
        assert user.email == "asha@newco.test" and user.role == "admin" and user.organization_id == org_id
        assert db.scalar(select(func.count()).select_from(Account).where(Account.organization_id == org_id)) > 10  # chart of accounts
        assert db.scalar(select(BankAccount.name).where(BankAccount.organization_id == org_id)) == "Petty Cash"
    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200, refreshed.text
    me = client.get("/api/auth/me", headers=auth(refreshed.json()["accessToken"])).json()
    assert me["organization"]["name"] == "NewCo Traders" and me["user"]["email"] == "asha@newco.test"

    # A colleague added on Rooman One later joins the same organization with their role.
    colleague = uuid.uuid4().hex
    client.cookies.clear()
    _sign_in(client, core, colleague, org_id, email="ravi@newco.test", name="Ravi", org_name="NewCo Traders", role="viewer")
    with SessionLocal() as db:
        assert db.get(User, colleague).role == "viewer"
        assert db.scalar(select(func.count()).select_from(Organization).where(Organization.id == org_id)) == 1


def test_an_email_with_its_own_books_account_is_not_duplicated(client, core):
    ctx = register_org(client, "SsoDup")
    res = _sign_in(client, core, uuid.uuid4().hex, uuid.uuid4().hex, email=ctx["email"], org_name="Elsewhere", role="admin")
    assert _error(res) == sso.EMAIL_IN_USE


def test_new_organizations_wait_for_approval_when_books_requires_it(client, core, monkeypatch):
    from backend.db import SessionLocal
    from backend.models import Organization
    from backend.services import platform_settings

    monkeypatch.setattr(platform_settings, "require_org_approval", lambda db: True)
    org_id = uuid.uuid4().hex
    res = _sign_in(client, core, uuid.uuid4().hex, org_id, email="pending@newco.test", org_name="Pending Co", role="admin")
    assert "approv" in _error(res).lower()
    with SessionLocal() as db:  # kept, so a super-admin can approve it
        assert db.get(Organization, org_id).approval_status == "pending"
