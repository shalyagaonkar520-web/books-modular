"""Create an organization on Rooman One (self-service sign-up).

The organization, its first admin and the apps it may open are created once,
here, in the central database. Each app then sets the organization up for
itself the first time someone from it signs in with Rooman One (Books does
that in routers/rooman_one_login.py), so nobody registers twice.

Two steps, so the email address is proven before anything is created:

1. ``start``: checks the details, emails a 6-digit code and returns a *ticket*:
   the details (with the password already hashed) and a hash of the code,
   encrypted with KEY_ENCRYPTION_KEYS and valid for 15 minutes. Nothing is
   stored until the code comes back, so abandoned sign-ups leave no trace.
2. ``confirm``: the ticket and the code. Wrong codes are counted per email
   address; the email is checked again (a ticket cannot create a second
   account), then the organization, user, membership and apps are created.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import smtplib
import ssl
from email.message import EmailMessage

import bcrypt
from cryptography.fernet import InvalidToken
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core_api import keys
from core_api.config import get_settings
from core_api.models import App, AuditLog, Membership, Organization, OrgApp, User
from core_api.ratelimit import FailureLimiter

logger = logging.getLogger("core_api.signup")

TICKET_MINUTES = 15
CODE_TRIES = 5
_code_failures = FailureLimiter(limit=CODE_TRIES, window_seconds=TICKET_MINUTES * 60)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #
def _clean(name: str, email: str, password: str, organization: str) -> tuple[str, str, str]:
    name, email, organization = name.strip(), email.strip().lower(), organization.strip()
    if not (2 <= len(name) <= 120):
        raise SignupError("bad_name", "Enter your full name.")
    if not _EMAIL.match(email) or len(email) > 255:
        raise SignupError("bad_email", "Enter a valid work email address.")
    if not (2 <= len(organization) <= 200):
        raise SignupError("bad_organization", "Enter your organization's name.")
    # The same rules as Rooman Books' own sign-up.
    if len(password) < 8 or len(password.encode()) > 72:
        raise SignupError("weak_password", "The password must be 8 to 72 characters long.")
    if password == password.lower() or password == password.upper() or not re.search(r"\d", password):
        raise SignupError("weak_password", "The password needs upper- and lower-case letters and a number.")
    return name, email, organization


def _email_taken(db: Session, email: str) -> bool:
    return db.scalar(select(User.id).where(func.lower(User.email) == email)) is not None


def _code_hash(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{code}".encode()).hexdigest()


# --------------------------------------------------------------------------- #
# Email
# --------------------------------------------------------------------------- #
def send_code(email: str, name: str, code: str) -> None:
    settings = get_settings()
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        if settings.is_production:
            raise SignupError("email_unavailable", "Sign-up is not available right now. Please try again later.", 503)
        logger.warning("SMTP is not set up; the sign-up code for %s is %s (development only)", email, code)
        return
    message = EmailMessage()
    message["Subject"] = f"{code} is your Rooman One code"
    message["From"] = f"{settings.smtp_sender_name} <{settings.smtp_from or settings.smtp_user}>"
    message["To"] = email
    message.set_content(
        f"Hello {name},\n\n"
        f"Your Rooman One verification code is {code}.\n"
        f"It expires in {TICKET_MINUTES} minutes.\n\n"
        "If you did not try to create an organization on Rooman One, you can ignore this email.\n"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Could not send the sign-up code to %s: %s", email, exc)
        raise SignupError("email_failed", "We couldn't send the verification email. Check the address and try again.", 502) from exc


# --------------------------------------------------------------------------- #
# The two steps
# --------------------------------------------------------------------------- #
def start(db: Session, name: str, email: str, password: str, organization: str) -> str:
    """Check the details, email a code; returns the ticket for ``confirm``."""
    name, email, organization = _clean(name, email, password, organization)
    if _email_taken(db, email):
        raise SignupError("email_taken", "An account with this email already exists. Sign in instead.", 409)
    code = f"{secrets.randbelow(10**6):06d}"
    payload = {
        "name": name,
        "email": email,
        "organization": organization,
        "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode(),
        "code_hash": _code_hash(email, code),
    }
    ticket = keys._fernet().encrypt(json.dumps(payload).encode()).decode()
    send_code(email, name, code)
    return ticket


def _org_code(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:30] or "org"
    while True:
        code = f"{base}-{secrets.token_hex(2)}"
        if db.scalar(select(Organization.id).where(Organization.code == code)) is None:
            return code


def confirm(db: Session, ticket: str, code: str, ip: str | None = None) -> User:
    """Create the organization, its admin and its apps (commits). Raises SignupError."""
    try:
        payload = json.loads(keys._fernet().decrypt(ticket.encode(), ttl=TICKET_MINUTES * 60))
    except (InvalidToken, ValueError, TypeError) as exc:
        raise SignupError("ticket_expired", "This sign-up has expired. Please start again.", 400) from exc
    email = payload["email"]
    if _code_failures.blocked(email):
        raise SignupError("slow_down", "Too many wrong codes. Please start the sign-up again in a few minutes.", 429)
    if not hmac.compare_digest(_code_hash(email, code.strip()), payload["code_hash"]):
        _code_failures.record(email)
        raise SignupError("wrong_code", "That code isn't right. Check the email and try again.", 400)
    if _email_taken(db, email):
        raise SignupError("email_taken", "An account with this email already exists. Sign in instead.", 409)

    org = Organization(code=_org_code(db, payload["organization"]), name=payload["organization"], email=email, status="active")
    user = User(email=email, name=payload["name"], password_hash=payload["password_hash"], status="active")
    db.add_all([org, user])
    db.flush()
    db.add(Membership(user_id=user.id, org_id=org.id, role="admin"))
    for key in get_settings().signup_apps:
        app = db.get(App, key)
        if app is not None and app.status == "active":
            db.add(OrgApp(org_id=org.id, app_key=key))
    db.add(AuditLog(org_id=org.id, actor_type="user", actor_id=str(user.id), action="organization.created", target=org.name, ip=ip))
    db.commit()
    return user
