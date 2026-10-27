"""scripts/set_password.py: giving people who signed in with Rooman One a Books password."""

import pytest

from scripts.set_password import list_users, set_password
from tests.conftest import register_org


def test_sets_a_password_that_signs_in(client):
    email = register_org(client, "PwScript")["user"]["email"]
    from backend.db import SessionLocal
    from backend.models import User

    # As a Rooman One sign-in left it: no Books password.
    with SessionLocal() as db:
        db.query(User).filter(User.email == email).one().password_hash = None
        db.commit()
    assert any(email in line and "NO PASSWORD" in line for line in list_users())
    assert client.post("/api/auth/login", json={"email": email, "password": "New-Pass-2026"}).status_code == 401

    assert "Password set" in set_password(email.upper(), "New-Pass-2026")
    assert client.post("/api/auth/login", json={"email": email, "password": "New-Pass-2026"}).status_code == 200


def test_refuses_short_passwords_and_unknown_people():
    with pytest.raises(SystemExit, match="at least 8"):
        set_password("anyone@example.com", "short")
    with pytest.raises(SystemExit, match="No user"):
        set_password("nobody-here@example.com", "Long-Enough-1")
