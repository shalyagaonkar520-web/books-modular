"""Organization admin panel: dashboard summary and the org's own app content."""

import copy
import json
import uuid
from pathlib import Path

import pytest

from tests.conftest import auth, create_panel_admin, invite_and_accept, platform_admin_headers, register_org

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = json.loads((ROOT / "backend" / "content" / "app_content_default.json").read_text(encoding="utf-8"))
FIRST_TEXT = next(iter(DEFAULT["texts"]))
FIRST_MODULE = next(iter(DEFAULT["modules"]))


@pytest.fixture
def tenant(client):
    admin = register_org(client, "OrgAdmin")
    h = auth(admin["token"])
    tag = uuid.uuid4().hex[:6]
    invite_and_accept(client, h, "Vera Viewer", f"viewer-{tag}@orgadmin.example.com", "viewer", "Str0ngPass!")
    staff = invite_and_accept(client, h, "Sam Staff", f"staff-{tag}@orgadmin.example.com", "staff", "Str0ngPass!")
    login = client.post("/api/auth/login", json={"email": staff["email"], "password": "Str0ngPass!"})
    assert login.status_code == 200, login.text
    panel = create_panel_admin(client, platform_admin_headers(client), admin["org"]["id"])
    return {"admin": admin, "h": h, "staff_h": auth(login.json()["accessToken"]), "panel_h": panel["h"]}


def test_dashboard_summarizes_only_the_callers_organization(client, tenant):
    other = register_org(client, "OtherOrg")
    res = client.get("/api/org-admin/dashboard", headers=tenant["panel_h"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["organization"]["id"] == tenant["admin"]["org"]["id"]
    assert body["users"]["total"] == 3
    assert body["users"]["byRole"] == {"admin": 1, "viewer": 1, "staff": 1}
    assert body["users"]["active"] == 3 and body["users"]["inactive"] == 0
    emails = {u["email"] for u in body["recentUsers"]}
    assert other["email"] not in emails and tenant["admin"]["email"] in emails
    assert body["appContent"] == {"customizedFields": 0, "disabledModules": []}
    assert isinstance(body["recentActivity"], list) and body["activityLast7Days"] >= 1


def test_only_panel_logins_can_use_the_panel(client, tenant):
    assert client.get("/api/org-admin/dashboard").status_code == 401
    # Tenant sessions - even the organization's own tenant admin - are rejected.
    for h in (tenant["h"], tenant["staff_h"]):
        for path in ("/api/org-admin/dashboard", "/api/org-admin/app-content"):
            assert client.get(path, headers=h).status_code == 401
        assert client.put("/api/org-admin/app-content", json=DEFAULT, headers=h).status_code == 401


def test_org_admin_customizes_only_their_own_organization(client, tenant):
    other = register_org(client, "OtherOrg")
    body = copy.deepcopy(DEFAULT)
    body["branding"]["appName"] = "My Org Books"
    body["modules"][FIRST_MODULE] = False
    body["texts"][FIRST_TEXT] = "Ours"
    res = client.put("/api/org-admin/app-content", json=body, headers=tenant["panel_h"])
    assert res.status_code == 200, res.text
    assert res.json()["overridden"] == {"branding": ["appName"], "modules": [FIRST_MODULE], "texts": [FIRST_TEXT]}

    # Every user of the organization sees it, including non-admins...
    mine = client.get("/api/app-content", headers=tenant["staff_h"]).json()
    assert mine["branding"]["appName"] == "My Org Books" and mine["texts"][FIRST_TEXT] == "Ours"
    # ...other organizations and the public copy do not.
    assert client.get("/api/app-content", headers=auth(other["token"])).json() == DEFAULT
    assert client.get("/api/public/app-content").json() == DEFAULT

    dash = client.get("/api/org-admin/dashboard", headers=tenant["panel_h"]).json()
    assert dash["appContent"] == {"customizedFields": 3, "disabledModules": [FIRST_MODULE]}

    reset = client.post("/api/org-admin/app-content/reset", headers=tenant["panel_h"])
    assert reset.status_code == 200 and reset.json()["content"] == DEFAULT
    assert client.get("/api/app-content", headers=tenant["staff_h"]).json() == DEFAULT


def test_org_admin_app_content_is_validated(client, tenant):
    body = copy.deepcopy(DEFAULT)
    body["texts"]["no.such.key"] = "x"
    assert client.put("/api/org-admin/app-content", json=body, headers=tenant["panel_h"]).status_code == 422
    body = copy.deepcopy(DEFAULT)
    body["branding"]["logoUrl"] = "javascript:alert(1)"
    assert client.put("/api/org-admin/app-content", json=body, headers=tenant["panel_h"]).status_code == 422
