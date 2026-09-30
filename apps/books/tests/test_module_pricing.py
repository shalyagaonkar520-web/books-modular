"""Module pricing catalog: prices, requires, monthly/yearly quotes and the
app-content module switches a plan applies (plans themselves: test_subscription)."""

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.db import SessionLocal
from backend.main import app
from backend.schemas.app_content import default_document
from backend.services import module_pricing


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #
def test_catalog_keys_match_app_content_modules():
    assert module_pricing.module_keys() == list(default_document()["modules"].keys())
    known = set(module_pricing.module_keys())
    for m in module_pricing.catalog()["modules"]:
        assert set(m["requires"]) <= known and m["price"] > 0 and m["label"] and m["description"]


def test_resolve_and_quote():
    assert module_pricing.resolve(["paymentsMade"]) == ["vendors", "bills", "paymentsMade"]
    assert module_pricing.resolve(["receivablesPayables"]) == ["customers", "invoices", "vendors", "bills", "receivablesPayables"]
    q = module_pricing.quote(["invoices"])
    assert q == {
        "modules": ["customers", "invoices"],
        "basePrice": 499,
        "modulesTotal": 398,
        "monthlyPrice": 897,
        "billingCycle": "monthly",
        "planPrice": 897,
    }
    yearly = module_pricing.quote(["invoices"], "yearly")
    assert yearly["billingCycle"] == "yearly" and yearly["monthlyPrice"] == 897 and yearly["planPrice"] == 8970
    with pytest.raises(ValueError):
        module_pricing.quote(["invoices"], "weekly")
    with pytest.raises(ValueError):
        module_pricing.resolve(["nope"])


def test_public_pricing_needs_no_auth():
    res = TestClient(app).get("/api/public/module-pricing")
    assert res.status_code == 200
    body = res.json()
    assert body["currency"] == "INR" and body["period"] == "month" and body["basePrice"] == 499
    assert body["yearlyMultiplier"] == 10 and body["trialDays"] == 3
    assert body["baseIncludes"] == ["Dashboard", "Settings"]
    assert [m["key"] for m in body["modules"]] == module_pricing.module_keys()
    first = body["modules"][0]
    assert set(first) == {"key", "label", "description", "price", "requires"}


def test_set_org_modules_keeps_branding_and_text_overrides(client):
    from backend.services.app_content import get_org_overrides, org_key, set_org_modules
    from backend.services.platform_settings import set_value

    org_id = uuid.uuid4().hex
    text_key = next(iter(default_document()["texts"]))
    with SessionLocal() as db:
        set_value(
            db,
            org_key(org_id),
            json.dumps({"branding": {"appName": "Acme"}, "modules": {"items": False}, "texts": {text_key: "Custom"}}),
        )
        db.flush()
        set_org_modules(db, org_id, ["items", "reports"])
        db.flush()
        overrides = get_org_overrides(db, org_id)
        db.rollback()
    assert overrides["branding"] == {"appName": "Acme"} and overrides["texts"] == {text_key: "Custom"}
    assert "items" not in overrides["modules"] and "reports" not in overrides["modules"]
    assert overrides["modules"]["payroll"] is False and len(overrides["modules"]) == len(default_document()["modules"]) - 2
