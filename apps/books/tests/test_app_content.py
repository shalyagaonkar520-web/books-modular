"""Editable tenant-app content: branding, module switches and UI texts."""

import copy
import json
import uuid
from pathlib import Path

import pytest

from backend.db import SessionLocal
from backend.models import PlatformAdmin
from backend.security import hash_password
from backend.services import platform_settings
from backend.services.app_content import APP_CONTENT_KEY
from tests.conftest import auth, register_org

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DEFAULT = json.loads((ROOT / "backend" / "content" / "app_content_default.json").read_text(encoding="utf-8"))
FRONTEND_DEFAULT = ROOT / "frontend" / "src" / "content" / "appContentDefault.json"
FIRST_TEXT = next(iter(BACKEND_DEFAULT["texts"]))
FIRST_MODULE = next(iter(BACKEND_DEFAULT["modules"]))


@pytest.fixture
def admin_h(client):
    email = f"appc-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="App Admin", email=email, password_hash=hash_password("AppAdmin1!"), is_active=True))
        db.commit()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": "AppAdmin1!"}).json()["accessToken"]
    h = auth(token)
    yield h
    client.post("/api/platform/app-content/reset", headers=h)


def test_default_catalog_is_complete():
    assert set(BACKEND_DEFAULT) >= {"branding", "modules", "texts"}
    assert len(BACKEND_DEFAULT["texts"]) >= 50, "the text catalog should cover the whole app"
    assert all(isinstance(v, bool) for v in BACKEND_DEFAULT["modules"].values())
    assert {"items", "invoices", "payroll", "banking"} <= set(BACKEND_DEFAULT["modules"])


def test_frontend_bundled_default_matches_backend():
    assert FRONTEND_DEFAULT.exists(), "frontend/src/content/appContentDefault.json is missing"
    assert json.loads(FRONTEND_DEFAULT.read_text(encoding="utf-8")) == BACKEND_DEFAULT


def test_public_read_needs_no_auth(client):
    res = client.get("/api/public/app-content")
    assert res.status_code == 200 and res.headers.get("cache-control") == "no-cache"
    assert res.json() == BACKEND_DEFAULT


def test_only_platform_admins_can_edit(client, org):
    body = copy.deepcopy(BACKEND_DEFAULT)
    assert client.put("/api/platform/app-content", json=body).status_code == 401
    assert client.put("/api/platform/app-content", json=body, headers=org["h"]).status_code == 401


def test_edit_branding_modules_and_texts(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["branding"] = {"appName": "Acme Ledger", "logoUrl": "https://cdn.example.com/logo.png", "primaryColor": "#16a34a"}
    body["modules"][FIRST_MODULE] = False
    body["texts"][FIRST_TEXT] = "Custom <b>label</b>"
    res = client.put("/api/platform/app-content", json=body, headers=admin_h)
    assert res.status_code == 200, res.text
    pub = client.get("/api/public/app-content").json()
    assert pub["branding"] == body["branding"]
    assert pub["modules"][FIRST_MODULE] is False
    assert pub["texts"][FIRST_TEXT] == "Custom <b>label</b>"  # stored as plain text


def test_empty_text_falls_back_to_default(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["texts"][FIRST_TEXT] = "   "
    assert client.put("/api/platform/app-content", json=body, headers=admin_h).status_code == 200
    assert client.get("/api/public/app-content").json()["texts"][FIRST_TEXT] == BACKEND_DEFAULT["texts"][FIRST_TEXT]


def test_partial_document_is_filled_from_defaults(client, admin_h):
    body = {"branding": BACKEND_DEFAULT["branding"], "texts": {FIRST_TEXT: "Only this"}}
    res = client.put("/api/platform/app-content", json=body, headers=admin_h)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["texts"][FIRST_TEXT] == "Only this"
    assert set(out["texts"]) == set(BACKEND_DEFAULT["texts"]) and out["modules"] == BACKEND_DEFAULT["modules"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["texts"].__setitem__("no.such.key", "x"),
        lambda b: b["modules"].__setitem__("rocketLauncher", True),
        lambda b: b["texts"].__setitem__(FIRST_TEXT, "x" * 301),
        lambda b: b["branding"].__setitem__("appName", ""),
        lambda b: b["branding"].__setitem__("appName", "x" * 61),
        lambda b: b["branding"].__setitem__("primaryColor", "blue"),
        lambda b: b["branding"].__setitem__("primaryColor", "#12345"),
        lambda b: b["branding"].__setitem__("logoUrl", "javascript:alert(1)"),
        lambda b: b["branding"].__setitem__("logoUrl", "http://insecure.example.com/l.png"),
    ],
)
def test_invalid_content_is_rejected(client, admin_h, mutate):
    body = copy.deepcopy(BACKEND_DEFAULT)
    mutate(body)
    assert client.put("/api/platform/app-content", json=body, headers=admin_h).status_code == 422
    assert client.get("/api/public/app-content").json() == BACKEND_DEFAULT


def test_reset_and_corrupt_fallback(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["branding"]["appName"] = "Changed"
    client.put("/api/platform/app-content", json=body, headers=admin_h)
    assert client.post("/api/platform/app-content/reset", headers=admin_h).json() == BACKEND_DEFAULT
    with SessionLocal() as db:
        platform_settings.set_value(db, APP_CONTENT_KEY, "{not json")
        db.commit()
    assert client.get("/api/public/app-content").json() == BACKEND_DEFAULT


# --------------------------------------------------------------------------- #
# Per-organization customization
# --------------------------------------------------------------------------- #
SECOND_TEXT = list(BACKEND_DEFAULT["texts"])[1]


@pytest.fixture
def two_orgs(client):
    a, b = register_org(client, "BrandA"), register_org(client, "BrandB")
    return {"a": {**a, "h": auth(a["token"])}, "b": {**b, "h": auth(b["token"])}}


def _org_url(org_id: str) -> str:
    return f"/api/platform/organizations/{org_id}/app-content"


def test_org_customization_only_reaches_that_org(client, admin_h, two_orgs):
    a, b = two_orgs["a"], two_orgs["b"]
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["branding"]["appName"] = "Brand A Books"
    body["branding"]["primaryColor"] = "#dc2626"
    body["modules"][FIRST_MODULE] = False
    body["texts"][FIRST_TEXT] = "A only"
    res = client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["organizationName"] == a["org"]["name"]
    assert out["overridden"] == {"branding": ["appName", "primaryColor"], "modules": [FIRST_MODULE], "texts": [FIRST_TEXT]}
    assert out["content"]["texts"][FIRST_TEXT] == "A only" and out["shared"] == BACKEND_DEFAULT

    mine = client.get("/api/app-content", headers=a["h"]).json()
    assert mine["branding"]["appName"] == "Brand A Books" and mine["modules"][FIRST_MODULE] is False
    assert mine["texts"][FIRST_TEXT] == "A only"
    # Another organization, and the public (pre-login) copy, keep the shared content.
    assert client.get("/api/app-content", headers=b["h"]).json() == BACKEND_DEFAULT
    assert client.get("/api/public/app-content").json() == BACKEND_DEFAULT


def test_org_inherits_later_shared_edits_for_fields_it_did_not_customize(client, admin_h, two_orgs):
    a = two_orgs["a"]
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["texts"][FIRST_TEXT] = "A only"
    assert client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h).status_code == 200
    shared = copy.deepcopy(BACKEND_DEFAULT)
    shared["texts"][FIRST_TEXT] = "Shared first"
    shared["texts"][SECOND_TEXT] = "Shared second"
    assert client.put("/api/platform/app-content", json=shared, headers=admin_h).status_code == 200
    mine = client.get("/api/app-content", headers=a["h"]).json()
    assert mine["texts"][FIRST_TEXT] == "A only"  # its own override wins
    assert mine["texts"][SECOND_TEXT] == "Shared second"  # the rest follows the shared copy


def test_org_blank_or_unchanged_fields_are_not_stored(client, admin_h, two_orgs):
    a = two_orgs["a"]
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["texts"][FIRST_TEXT] = "  "  # blank means "use the shared text"
    out = client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h).json()
    assert out["overridden"] == {"branding": [], "modules": [], "texts": []}
    with SessionLocal() as db:
        assert platform_settings.get_value(db, f"{APP_CONTENT_KEY}:org:{a['org']['id']}") is None


def test_org_reset_and_permanent_delete_drop_overrides(client, admin_h, two_orgs):
    a = two_orgs["a"]
    key = f"{APP_CONTENT_KEY}:org:{a['org']['id']}"
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["texts"][FIRST_TEXT] = "A only"
    client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h)
    res = client.post(_org_url(a["org"]["id"]) + "/reset", headers=admin_h)
    assert res.status_code == 200 and res.json()["overridden"]["texts"] == []
    assert client.get("/api/app-content", headers=a["h"]).json() == BACKEND_DEFAULT

    client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h)
    assert client.delete(f"/api/platform/organizations/{a['org']['id']}", headers=admin_h).status_code == 200
    with SessionLocal() as db:
        assert platform_settings.get_value(db, key) is None


def test_org_app_content_access_rules(client, admin_h, two_orgs):
    a = two_orgs["a"]
    body = copy.deepcopy(BACKEND_DEFAULT)
    assert client.get("/api/app-content").status_code == 401
    assert client.put(_org_url(a["org"]["id"]), json=body, headers=a["h"]).status_code == 401  # tenant token
    assert client.get(_org_url("0" * 32), headers=admin_h).status_code == 404
    body["texts"]["no.such.key"] = "x"
    assert client.put(_org_url(a["org"]["id"]), json=body, headers=admin_h).status_code == 422


def test_corrupt_org_overrides_fall_back_to_shared(client, admin_h, two_orgs):
    a = two_orgs["a"]
    with SessionLocal() as db:
        platform_settings.set_value(db, f"{APP_CONTENT_KEY}:org:{a['org']['id']}", "{not json")
        db.commit()
    assert client.get("/api/app-content", headers=a["h"]).json() == BACKEND_DEFAULT
    with SessionLocal() as db:
        platform_settings.set_value(db, f"{APP_CONTENT_KEY}:org:{a['org']['id']}", json.dumps({"branding": {"primaryColor": "red"}}))
        db.commit()
    assert client.get("/api/app-content", headers=a["h"]).json() == BACKEND_DEFAULT
