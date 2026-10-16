"""Outbound email (SMTP) settings: platform-wide, so only a platform admin manages them.

Every organization's invites, password-reset codes and invoice emails go
through this one account. An organization's admin must never be able to
change it: pointing it at their own server would let them read every other
organization's reset codes, and the stored password would be sent to them.
"""

from __future__ import annotations

import logging
import smtplib
import socket

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_superuser
from backend.models import PlatformAdmin
from backend.schemas.auth import SmtpSettingsOut, SmtpSettingsUpdate, SmtpTestRequest
from backend.schemas.common import Message
from backend.services import audit
from backend.services.email_service import send_test_email, smtp_configured, verify_smtp_credentials
from backend.services.env_config import update_env_values

logger = logging.getLogger("roomanbooks.platform.email")

router = APIRouter(prefix="/api/platform/settings/smtp", tags=["Platform: email"])


def _out() -> SmtpSettingsOut:
    current = get_settings()
    return SmtpSettingsOut(
        host=current.smtp_host,
        port=current.smtp_port,
        username=current.smtp_user,
        sender_name=current.smtp_sender_name,
        configured=current.smtp_configured,
    )


def _rejection(exc: Exception, host: str, port: int) -> str:
    """A readable reason, without echoing the mail server's raw reply."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "The mail server rejected the username or app password."
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return f"The mail server at {host}:{port} did not answer in time."
    if isinstance(exc, (socket.gaierror, ConnectionError, OSError)) and not isinstance(exc, smtplib.SMTPException):
        return f"Could not reach a mail server at {host}:{port}."
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return "The mail server does not support a secure (STARTTLS) connection."
    return "The mail server did not accept these details."


@router.get("", response_model=SmtpSettingsOut)
def get_smtp_settings(_admin: PlatformAdmin = Depends(get_current_superuser)):
    """Current outbound-email configuration. Never returns the password."""
    return _out()


@router.put("", response_model=SmtpSettingsOut)
def update_smtp_settings(payload: SmtpSettingsUpdate, admin: PlatformAdmin = Depends(get_current_superuser), db: Session = Depends(get_db)):
    """Save the sender account, after checking the details with the mail server."""
    current = get_settings()
    host = payload.host.strip()
    username = str(payload.username).strip()
    password = (payload.password or "").strip()
    if not password:
        # The stored password may only be kept for the same account on the same
        # server; it is never sent anywhere new.
        if host.lower() != (current.smtp_host or "").lower() or username.lower() != (current.smtp_user or "").lower():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the password (Gmail app password) for this server and account.")
        password = current.smtp_password
    if not password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A password (Gmail app password) is required the first time you configure this.")

    try:
        verify_smtp_credentials(host, payload.port, username, password)
    except Exception as exc:
        logger.warning("SMTP verification failed for %s@%s:%s: %r", username, host, payload.port, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _rejection(exc, host, payload.port)) from exc

    update_env_values(
        {
            "SMTP_HOST": host,
            "SMTP_PORT": str(payload.port),
            "SMTP_USER": username,
            "SMTP_PASSWORD": password,
            "SMTP_SENDER_NAME": payload.sender_name.strip(),
        }
    )
    audit.record(
        db,
        admin,
        "update",
        "platform_setting",
        "smtp",
        f"Outbound email sender set to {username} via {host} by platform admin {admin.email}",
    )
    db.commit()
    return _out()


@router.post("/test", response_model=Message)
def send_smtp_test(payload: SmtpTestRequest, _admin: PlatformAdmin = Depends(get_current_superuser)):
    """Send a test message to confirm delivery works."""
    if not smtp_configured():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Configure the sender account first.")
    result = send_test_email(str(payload.to_email), "Rooman Books")
    if not result.get("success"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the test email. Check the sender account and try again.")
    return Message(message=f"Test email sent to {payload.to_email}.")
