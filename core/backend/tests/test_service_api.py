"""Service-to-service identity: signing keys, /jwks, POST /token, and the
internal API the apps call (shared customers, entitlements)."""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from rooman_sdk.tokens import AccessError, TokenVerifier
from sqlalchemy import select

from core_api import clients, keys
from core_api import models as m
from core_api.db import Base, SessionLocal, engine
from core_api.main import app
from core_api.routers import oauth

ISSUER = "https://id.test.rooman"


@pytest.fixture(autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    oauth._failures.reset()
    with SessionLocal() as s:
        s.add_all([m.App(key="books", name="Rooman Books"), m.App(key="bookings", name="Rooman Bookings")])
        s.commit()
    yield


@pytest.fixture
def api() -> TestClient:
    return TestClient(app)


def _org(code: str = "acme") -> uuid.UUID:
    with SessionLocal() as s:
        org = m.Organization(
            code=f"{code}-{uuid.uuid4().hex[:4]}", name="Acme Traders", trial_ends_at=datetime.now(UTC) + timedelta(days=3)
        )
        s.add(org)
        s.flush()
        s.add(m.OrgApp(org_id=org.id, app_key="books"))
        s.add(m.OrgSubscription(org_id=org.id, app_key="books", status="active", cycle="monthly", modules=["customers", "invoices"]))
        s.commit()
        return org.id


def _client(scopes=("parties:write", "parties:read", "entitlements:read"), app_key="books") -> tuple[str, str]:
    with SessionLocal() as s:
        client, secret = clients.create(s, app_key, list(scopes))
        s.commit()
        return client.client_id, secret


def _token(api: TestClient, client_id: str, secret: str) -> str:
    res = api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _h(api: TestClient, scopes=("parties:write", "parties:read", "entitlements:read")) -> dict:
    return {"Authorization": f"Bearer {_token(api, *_client(scopes))}"}


# --------------------------------------------------------------------------- #
# Keys and tokens
# --------------------------------------------------------------------------- #
def test_token_verifies_with_published_keys(api):
    client_id, secret = _client()
    res = api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
    body = res.json()
    assert res.status_code == 200 and body["token_type"] == "Bearer" and body["expires_in"] == 15 * 60
    assert res.headers["cache-control"] == "no-store"
    jwk = api.get("/jwks").json()["keys"][0]
    assert "d" not in jwk and jwk["kty"] == "RSA" and jwk["alg"] == "RS256"  # never the private half
    public = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
    claims = jwt.decode(body["access_token"], public, algorithms=["RS256"], audience="core", issuer=ISSUER)
    assert claims["app"] == "books" and claims["typ"] == "service" and claims["client_id"] == client_id
    assert set(claims["scope"].split()) == {"parties:write", "parties:read", "entitlements:read"}


def test_basic_auth_and_scope_narrowing(api):
    client_id, secret = _client()
    basic = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    res = api.post(
        "/token", data={"grant_type": "client_credentials", "scope": "parties:read"}, headers={"Authorization": f"Basic {basic}"}
    )
    assert res.status_code == 200 and res.json()["scope"] == "parties:read"


def test_bad_credentials_are_refused_and_rate_limited(api):
    client_id, _ = _client()
    for _ in range(10):
        assert (
            api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": "wrong"}).status_code
            == 401
        )
    assert (
        api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": "wrong"}).status_code == 429
    )
    assert api.post("/token", data={"grant_type": "password", "client_id": client_id}).status_code == 400


def test_disabled_client_gets_no_token(api):
    client_id, secret = _client()
    with SessionLocal() as s:
        s.scalar(select(m.OAuthClient).where(m.OAuthClient.client_id == client_id)).is_active = False
        s.commit()
    assert api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret}).status_code == 401


def test_private_keys_are_stored_encrypted():
    with SessionLocal() as s:
        key = keys.active_key(s)
        assert "PRIVATE KEY" not in key.private_key_encrypted and key.private_key_encrypted.startswith("gAAAA")


def test_rotation_keeps_old_tokens_valid_for_the_overlap_then_drops_them(api):
    client_id, secret = _client()
    old_token = _token(api, client_id, secret)
    with SessionLocal() as s:
        old_kid = keys.active_key(s).kid
        new = keys.rotate(s)
        new_kid = new.kid
    kids = [k["kid"] for k in api.get("/jwks").json()["keys"]]
    assert kids[0] == new_kid and old_kid in kids
    assert jwt.get_unverified_header(_token(api, client_id, secret))["kid"] == new_kid
    h = {"Authorization": f"Bearer {old_token}"}
    assert api.get(f"/internal/orgs/{_org()}/entitlements", headers=h).status_code == 200
    with SessionLocal() as s:  # the overlap window passes
        s.scalar(select(m.SigningKey).where(m.SigningKey.kid == old_kid)).retiring_at = datetime.now(UTC) - timedelta(hours=25)
        s.commit()
    assert old_kid not in [k["kid"] for k in api.get("/jwks").json()["keys"]]
    assert api.get(f"/internal/orgs/{_org()}/entitlements", headers=h).status_code == 401


def test_sdk_verifier_accepts_core_tokens(api):
    """The apps' own verifier (rooman_sdk) checks Core's signature and issuer."""
    client_id, secret = _client()
    token = _token(api, client_id, secret)
    public = jwt.algorithms.RSAAlgorithm.from_jwk(api.get("/jwks").json()["keys"][0])
    payload = jwt.decode(token, public, algorithms=["RS256"], audience="core", issuer=ISSUER)
    assert payload["sub"] == f"client:{client_id}"
    with pytest.raises(AccessError):
        TokenVerifier(issuer=ISSUER, audience="books", public_key=public).verify(token)  # wrong audience


def test_discovery_document(api):
    doc = api.get("/.well-known/openid-configuration").json()
    assert doc["issuer"] == ISSUER and doc["jwks_uri"] == f"{ISSUER}/jwks" and doc["token_endpoint"] == f"{ISSUER}/token"


# --------------------------------------------------------------------------- #
# Internal API: access rules
# --------------------------------------------------------------------------- #
def test_internal_api_needs_a_valid_service_token_with_the_scope(api):
    org_id = _org()
    url = f"/internal/orgs/{org_id}/entitlements"
    assert api.get(url).status_code == 401
    assert api.get(url, headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert api.get(url, headers=_h(api, scopes=("parties:read",))).status_code == 403
    res = api.post("/internal/parties", headers=_h(api, scopes=("parties:read",)), json={"org_id": str(org_id), "display_name": "X"})
    assert res.status_code == 403


def test_a_token_signed_by_another_key_is_refused(api):
    from cryptography.hazmat.primitives.asymmetric import rsa

    rogue = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with SessionLocal() as s:
        kid = keys.active_key(s).kid
    forged = jwt.encode(
        {"sub": "client:x", "aud": "core", "iss": ISSUER, "typ": "service", "scope": "entitlements:read", "iat": 1, "exp": 4102444800},
        rogue,
        algorithm="RS256",
        headers={"kid": kid},
    )
    assert api.get(f"/internal/orgs/{_org()}/entitlements", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# --------------------------------------------------------------------------- #
# Parties
# --------------------------------------------------------------------------- #
def test_find_or_create_party_matches_by_local_id_email_then_phone(api):
    h, org_id = _h(api), str(_org())
    first = api.post(
        "/internal/parties",
        headers=h,
        json={"org_id": org_id, "display_name": "Ravi Kumar", "email": "Ravi@Example.com", "phone": "+919800000000", "local_id": "c1"},
    ).json()
    assert first["created"] is True and first["email"] == "ravi@example.com"
    by_local = api.post("/internal/parties", headers=h, json={"org_id": org_id, "display_name": "R K", "local_id": "c1"}).json()
    by_email = api.post("/internal/parties", headers=h, json={"org_id": org_id, "display_name": "R", "email": "ravi@example.com"}).json()
    by_phone = api.post("/internal/parties", headers=h, json={"org_id": org_id, "display_name": "R", "phone": "+919800000000"}).json()
    assert first["party_id"] == by_local["party_id"] == by_email["party_id"] == by_phone["party_id"]
    assert not any(p["created"] for p in (by_local, by_email, by_phone))
    vendor = api.post(
        "/internal/parties", headers=h, json={"org_id": org_id, "display_name": "Ravi", "email": "ravi@example.com", "type": "vendor"}
    )
    assert vendor.json()["type"] == "both"
    with SessionLocal() as s:
        links = s.scalars(select(m.ExternalId).where(m.ExternalId.local_id == "c1")).all()
        assert len(links) == 1 and links[0].app_key == "books"


def test_parties_never_cross_organizations(api):
    h = _h(api)
    a, b = str(_org("a")), str(_org("b"))
    pa = api.post("/internal/parties", headers=h, json={"org_id": a, "display_name": "Same Person", "email": "same@example.com"}).json()
    pb = api.post("/internal/parties", headers=h, json={"org_id": b, "display_name": "Same Person", "email": "same@example.com"}).json()
    assert pa["party_id"] != pb["party_id"] and pb["created"] is True
    # Updating or reading A's party with B's organization answers 404.
    assert api.patch(f"/internal/parties/{pa['party_id']}", headers=h, json={"org_id": b, "display_name": "Hijack"}).status_code == 404
    assert api.get(f"/internal/parties/{pa['party_id']}", headers=h, params={"org_id": b}).status_code == 404


def test_update_party(api):
    h, org_id = _h(api), str(_org())
    p = api.post("/internal/parties", headers=h, json={"org_id": org_id, "display_name": "Old Name", "email": "x@example.com"}).json()
    res = api.patch(
        f"/internal/parties/{p['party_id']}", headers=h, json={"org_id": org_id, "display_name": "New Name", "email": "", "phone": "123"}
    )
    assert (
        res.status_code == 200 and res.json()["display_name"] == "New Name" and res.json()["email"] is None and res.json()["phone"] == "123"
    )


def test_party_validation(api):
    h = _h(api)
    assert api.post("/internal/parties", headers=h, json={"org_id": str(uuid.uuid4()), "display_name": "X"}).status_code == 404
    assert api.post("/internal/parties", headers=h, json={"org_id": str(_org()), "display_name": ""}).status_code == 422
    assert api.post("/internal/parties", headers=h, json={"org_id": str(_org()), "display_name": "X", "email": "nope"}).status_code == 422


# --------------------------------------------------------------------------- #
# Entitlements
# --------------------------------------------------------------------------- #
def test_entitlements(api):
    org_id = _org()
    body = api.get(f"/internal/orgs/{org_id}/entitlements", headers=_h(api)).json()
    assert body["org_id"] == str(org_id) and body["status"] == "active"
    assert body["apps"] == [
        {
            "app": "books",
            "enabled": True,
            "subscription_status": "active",
            "modules": ["customers", "invoices"],
            "cycle": "monthly",
            "trial_ends_at": None,
        }
    ]
    assert api.get(f"/internal/orgs/{uuid.uuid4()}/entitlements", headers=_h(api)).status_code == 404


def test_missing_encryption_key_answers_503_not_500(api, monkeypatch):
    from core_api.config import get_settings

    client_id, secret = _client()
    monkeypatch.setattr(get_settings(), "key_encryption_keys_raw", "")
    res = api.post("/token", data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
    assert res.status_code == 503 and "signing keys" in res.json()["detail"]
