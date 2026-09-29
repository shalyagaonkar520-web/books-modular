"""Editable public-website content: public read, admin-only write, validation."""

import copy
import json
import uuid
from pathlib import Path

import pytest

from backend.db import SessionLocal
from backend.models import PlatformAdmin
from backend.security import hash_password
from backend.services import platform_settings
from backend.services.site_content import SITE_CONTENT_KEY
from tests.conftest import auth

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DEFAULT = json.loads((ROOT / "backend" / "content" / "site_content_default.json").read_text(encoding="utf-8"))
FRONTEND_DEFAULT = ROOT / "frontend" / "src" / "content" / "siteContentDefault.json"


@pytest.fixture
def admin_h(client):
    email = f"web-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="Web Admin", email=email, password_hash=hash_password("WebAdmin1!"), is_active=True))
        db.commit()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": "WebAdmin1!"}).json()["accessToken"]
    h = auth(token)
    yield h
    # Leave the shared session DB on the defaults for other tests.
    client.post("/api/platform/site-content/reset", headers=h)


def test_public_read_needs_no_auth_and_serves_default(client):
    res = client.get("/api/public/site-content")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-cache"
    assert res.json() == BACKEND_DEFAULT


def test_frontend_bundled_default_matches_backend():
    assert FRONTEND_DEFAULT.exists(), "frontend/src/content/siteContentDefault.json is missing"
    assert json.loads(FRONTEND_DEFAULT.read_text(encoding="utf-8")) == BACKEND_DEFAULT


def test_only_platform_admins_can_edit(client, org):
    body = copy.deepcopy(BACKEND_DEFAULT)
    assert client.put("/api/platform/site-content", json=body).status_code == 401
    assert client.put("/api/platform/site-content", json=body, headers=org["h"]).status_code == 401
    assert client.get("/api/platform/site-content", headers=org["h"]).status_code == 401


def test_edit_pricing_shows_on_public_site(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["pricing"]["plans"][0]["monthlyPrice"] = 777
    body["pricing"]["plans"][0]["annualPrice"] = 555
    body["pricing"]["plans"].append(
        {"name": "Mega", "description": "", "monthlyPrice": 9999, "annualPrice": 8888, "features": ["All the things"], "ctaLabel": "Talk to us", "ctaTarget": "login", "popular": False}
    )
    body["hero"]["titleLine1"] = "<b>Books</b> & more"  # stored as plain text
    body["sections"]["showFaq"] = False
    res = client.put("/api/platform/site-content", json=body, headers=admin_h)
    assert res.status_code == 200, res.text

    pub = client.get("/api/public/site-content").json()
    assert pub["pricing"]["plans"][0]["monthlyPrice"] == 777
    assert pub["pricing"]["plans"][0]["annualPrice"] == 555
    assert pub["pricing"]["plans"][-1]["name"] == "Mega"
    assert pub["hero"]["titleLine1"] == "<b>Books</b> & more"
    assert pub["sections"]["showFaq"] is False
    assert client.get("/api/platform/site-content", headers=admin_h).json() == pub


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["pricing"]["plans"][0].__setitem__("monthlyPrice", -1),
        lambda b: b["pricing"]["plans"][0].__setitem__("annualPrice", 10_000_001),
        lambda b: b["pricing"].__setitem__("plans", []),
        lambda b: b["pricing"]["plans"][0].__setitem__("ctaTarget", "javascript:alert(1)"),
        lambda b: b["pricing"]["plans"][0].__setitem__("features", ["x"] * 13),
        lambda b: b["pricing"].__setitem__("plans", [b["pricing"]["plans"][0]] * 7),
        lambda b: b["hero"].__setitem__("titleLine1", "x" * 201),
        lambda b: b["hero"].__setitem__("trustItems", ["t"] * 7),
        lambda b: b["faq"].__setitem__("items", [{"question": "q", "answer": "a"}] * 21),
        lambda b: b["footer"].__setitem__("columns", [{"heading": "h", "links": []}] * 5),
        lambda b: b.pop("hero"),
    ],
)
def test_invalid_content_is_rejected(client, admin_h, mutate):
    body = copy.deepcopy(BACKEND_DEFAULT)
    mutate(body)
    assert client.put("/api/platform/site-content", json=body, headers=admin_h).status_code == 422
    # Nothing was stored.
    assert client.get("/api/public/site-content").json() == BACKEND_DEFAULT


def test_new_branding_nav_and_seo_fields_round_trip(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["brand"].update({"name": "Ledger", "logoUrl": "https://cdn.example.com/l.png"})
    body["nav"].update({"featuresLabel": "Tools", "pricingLabel": "Plans", "testimonialsLabel": "Reviews", "faqLabel": "Help"})
    body["pricing"]["description"] = "Pick the plan that fits."
    body["testimonials"]["description"] = "What customers say."
    body["faq"]["description"] = "Answers to common questions."
    body["seo"] = {"title": "Ledger - Cloud Accounting", "description": "GST-ready cloud accounting."}
    res = client.put("/api/platform/site-content", json=body, headers=admin_h)
    assert res.status_code == 200, res.text

    pub = client.get("/api/public/site-content").json()
    assert pub == body


def test_legacy_document_without_new_fields_gets_defaults(client, admin_h):
    legacy = copy.deepcopy(BACKEND_DEFAULT)
    legacy["brand"] = {"badge": "Legacy badge"}
    legacy["nav"] = {"loginLabel": "Log In", "ctaLabel": "Access Rooman Books"}
    for section in ("pricing", "testimonials", "faq"):
        legacy[section].pop("description")
    legacy.pop("seo")
    with SessionLocal() as db:
        platform_settings.set_value(db, SITE_CONTENT_KEY, json.dumps(legacy))
        db.commit()

    pub = client.get("/api/public/site-content").json()
    expected = copy.deepcopy(BACKEND_DEFAULT)
    expected["brand"]["badge"] = "Legacy badge"
    assert pub == expected  # validated (not the fallback) and every new field filled from its default


@pytest.mark.parametrize(
    ("logo_url", "status"),
    [
        ("javascript:alert(1)", 422),
        ("http://x", 422),
        ("has space", 422),
        ("/has space.png", 422),
        ("//evil.example.com/l.png", 422),
        ("https://", 422),
        ("", 422),
        ("/" + "a" * 500, 422),
        ("/rooman-logo.png", 200),
        ("https://cdn.example.com/l.png", 200),
    ],
)
def test_logo_url_must_be_site_path_or_https(client, admin_h, logo_url, status):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["brand"]["logoUrl"] = logo_url
    res = client.put("/api/platform/site-content", json=body, headers=admin_h)
    assert res.status_code == status, res.text
    if status == 200:
        assert client.get("/api/public/site-content").json()["brand"]["logoUrl"] == logo_url


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["nav"].__setitem__("faqLabel", "x" * 31),
        lambda b: b["nav"].__setitem__("pricingLabel", ""),
        lambda b: b["seo"].__setitem__("title", "x" * 121),
        lambda b: b["seo"].__setitem__("description", "x" * 301),
        lambda b: b["pricing"].__setitem__("description", "x" * 501),
    ],
)
def test_new_field_limits_are_enforced(client, admin_h, mutate):
    body = copy.deepcopy(BACKEND_DEFAULT)
    mutate(body)
    assert client.put("/api/platform/site-content", json=body, headers=admin_h).status_code == 422


def test_reset_restores_defaults(client, admin_h):
    body = copy.deepcopy(BACKEND_DEFAULT)
    body["brand"]["badge"] = "Changed"
    assert client.put("/api/platform/site-content", json=body, headers=admin_h).status_code == 200
    res = client.post("/api/platform/site-content/reset", headers=admin_h)
    assert res.status_code == 200 and res.json() == BACKEND_DEFAULT
    assert client.get("/api/public/site-content").json() == BACKEND_DEFAULT


def test_corrupt_stored_content_falls_back_to_default(client, admin_h):
    with SessionLocal() as db:
        platform_settings.set_value(db, SITE_CONTENT_KEY, '{"not": "valid"}')
        db.commit()
    res = client.get("/api/public/site-content")
    assert res.status_code == 200 and res.json() == BACKEND_DEFAULT
