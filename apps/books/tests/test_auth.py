import re
from unittest.mock import MagicMock, patch

from tests.conftest import auth, register_org


def _extract_invite_token(mock_server) -> str:
    """Pulls the invite token out of the accept-invite link in the mocked email body."""
    _, _, msg_string = mock_server.sendmail.call_args[0]
    match = re.search(r"token=([\w\-]+)", msg_string)
    assert match, "invite email did not contain an accept-invite link"
    return match.group(1)


def test_register_creates_org_admin_and_bootstrap(client):
    ctx = register_org(client, "Bootstrap")
    assert ctx["user"]["role"] == "admin"
    h = auth(ctx["token"])
    accounts = client.get("/api/accounting/accounts", headers=h).json()
    codes = {a["code"] for a in accounts}
    assert {"1000", "1100", "1200", "2000", "2100", "4000", "5000"} <= codes
    banks = client.get("/api/banking/accounts", headers=h).json()
    assert [b["name"] for b in banks] == ["Petty Cash"]
    # No demo business data is seeded
    assert client.get("/api/items", headers=h).json()["total"] == 0
    assert client.get("/api/contacts", headers=h).json()["total"] == 0
    assert client.get("/api/invoices", headers=h).json()["total"] == 0


def test_register_rejects_duplicate_email_and_weak_password(client):
    ctx = register_org(client, "Dup")
    res = client.post("/api/auth/register", json={"name": "Someone Else", "email": ctx["email"], "password": "Str0ngPass!", "organizationName": "Another"})
    assert res.status_code == 409
    res = client.post("/api/auth/register", json={"name": "Someone Else", "email": "weak@x.example.com", "password": "weak", "organizationName": "Another"})
    assert res.status_code == 422


def test_password_longer_than_bcrypt_limit_is_rejected(client):
    """bcrypt ignores bytes past 72, so an over-long password must not be accepted."""
    long_password = "Aa1" + "x" * 90
    res = client.post(
        "/api/auth/register",
        json={"name": "Long Password", "email": "long@pw.example.com", "password": long_password, "organizationName": "Long Pw Org"},
    )
    assert res.status_code == 422
    assert "72 bytes" in res.text


def test_login_refresh_logout_cycle(client):
    ctx = register_org(client, "Login")
    bad = client.post("/api/auth/login", json={"email": ctx["email"], "password": "WrongPass1"})
    assert bad.status_code == 401
    good = client.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]})
    assert good.status_code == 200
    assert "rb_refresh" in good.cookies
    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["accessToken"]
    me = client.get("/api/auth/me", headers=auth(refreshed.json()["accessToken"]))
    assert me.status_code == 200
    assert me.json()["user"]["email"] == ctx["email"]
    assert client.post("/api/auth/logout").status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401


def test_protected_routes_require_valid_token(client):
    assert client.get("/api/items").status_code == 401
    assert client.get("/api/items", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_change_password_revokes_other_sessions(client):
    ctx = register_org(client, "Pw")
    h = auth(ctx["token"])
    res = client.post("/api/auth/change-password", headers=h, json={"currentPassword": "nope", "newPassword": "NewStr0ngPass!"})
    assert res.status_code == 400
    res = client.post("/api/auth/change-password", headers=h, json={"currentPassword": ctx["password"], "newPassword": "NewStr0ngPass!"})
    assert res.status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401
    assert client.post("/api/auth/login", json={"email": ctx["email"], "password": "NewStr0ngPass!"}).status_code == 200


@patch("backend.services.email_service.smtplib.SMTP")
def test_user_management_and_roles(mock_smtp, client):
    mock_server = MagicMock()
    mock_smtp.return_value = mock_server

    ctx = register_org(client, "Roles")
    h = auth(ctx["token"])
    viewer = client.post("/api/users", headers=h, json={"name": "View Only", "email": "viewer@roles.example.com", "role": "viewer"})
    assert viewer.status_code == 201
    # An invited user has no password yet - they must accept the emailed invite first.
    assert client.post("/api/auth/login", json={"email": "viewer@roles.example.com", "password": "whatever"}).status_code == 401
    invite_token = _extract_invite_token(mock_server)
    assert client.get(f"/api/auth/invite/{invite_token}").json()["email"] == "viewer@roles.example.com"
    accepted = client.post("/api/auth/accept-invite", json={"token": invite_token, "password": "Viewer1234"})
    assert accepted.status_code == 200
    # The link is single-use.
    assert client.post("/api/auth/accept-invite", json={"token": invite_token, "password": "Viewer1234"}).status_code == 404

    login = client.post("/api/auth/login", json={"email": "viewer@roles.example.com", "password": "Viewer1234"}).json()
    vh = auth(login["accessToken"])
    assert client.get("/api/items", headers=vh).status_code == 200
    denied = client.post("/api/contacts", headers=vh, json={"type": "customer", "displayName": "Nope"})
    assert denied.status_code == 403
    assert client.post("/api/users", headers=vh, json={"name": "X", "email": "x@roles.example.com", "role": "staff"}).status_code == 403
    # promote to staff -> can write
    promoted = client.patch(f"/api/users/{viewer.json()['id']}", headers=h, json={"role": "staff"})
    assert promoted.status_code == 200
    login = client.post("/api/auth/login", json={"email": "viewer@roles.example.com", "password": "Viewer1234"}).json()
    assert client.post("/api/contacts", headers=auth(login["accessToken"]), json={"type": "customer", "displayName": "Ok"}).status_code == 201
    # cannot demote the last admin
    assert client.patch(f"/api/users/{ctx['user']['id']}", headers=h, json={"role": "staff"}).status_code == 400
    # deactivated users cannot log in
    client.patch(f"/api/users/{viewer.json()['id']}", headers=h, json={"isActive": False})
    assert client.post("/api/auth/login", json={"email": "viewer@roles.example.com", "password": "Viewer1234"}).status_code == 403


def test_tenant_isolation(client):
    a = register_org(client, "TenantA")
    b = register_org(client, "TenantB")
    ha, hb = auth(a["token"]), auth(b["token"])
    item = client.post("/api/items", headers=ha, json={"name": "Secret", "sku": "SEC-1", "sellingPrice": 1}).json()
    assert client.get(f"/api/items/{item['id']}", headers=hb).status_code == 404
    assert client.get("/api/items", headers=hb).json()["total"] == 0
    assert client.put(f"/api/items/{item['id']}", headers=hb, json={"name": "Hacked"}).status_code == 404
    assert client.get(f"/api/items/{item['id']}", headers=ha).json()["name"] == "Secret"


def test_organization_profile_update(client):
    ctx = register_org(client, "Profile")
    h = auth(ctx["token"])
    res = client.put("/api/organization", headers=h, json={"gstin": "29ABCDE1234F1Z5", "city": "Bengaluru", "fiscalYearStartMonth": 4})
    assert res.status_code == 200
    assert res.json()["gstin"] == "29ABCDE1234F1Z5"
    logs = client.get("/api/audit-logs", headers=h).json()
    assert any(entry["entityType"] == "organization" for entry in logs["items"])


def test_organization_profile_rejects_malformed_contact_and_tax_fields(client):
    ctx = register_org(client, "ProfileValidation")
    h = auth(ctx["token"])

    assert client.put("/api/organization", headers=h, json={"postalCode": "56002A"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"postalCode": "5600"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"phone": "98765abcde"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"phone": "987654321"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"gstin": "not-a-gstin"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"pan": "12345ABCDE"}).status_code == 422

    ok = client.put(
        "/api/organization", headers=h,
        json={"postalCode": "560001", "phone": "9876543210", "gstin": "29ABCDE1234F1Z5", "pan": "ABCDE1234F"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["postalCode"] == "560001" and body["phone"] == "9876543210" and body["pan"] == "ABCDE1234F"


def test_user_dashboard_and_pdf(client):
    ctx = register_org(client, "UserDashboardTest")
    h = auth(ctx["token"])
    user_id = ctx["user"]["id"]

    # 1. Admin gets user dashboard summary
    res = client.get(f"/api/users/{user_id}/dashboard", headers=h)
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["id"] == user_id
    assert "stats" in data
    assert "auditLogs" in data

    # 2. Admin downloads user dashboard PDF
    pdf_res = client.get(f"/api/users/{user_id}/pdf", headers=h)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")
