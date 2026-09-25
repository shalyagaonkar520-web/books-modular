from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from backend.config import get_settings
from backend.deps import require_full_app_access, require_write
from backend.models import User
from backend.schemas.common import APIModel
from backend.services.email_service import (
    GENERIC_SEND_ERROR,
    send_custom_message_email,
    send_due_reminder_email,
    send_invoice_email,
)

# Every endpoint needs a signed-in member of the main app; the send endpoints
# additionally need a write role (admin/staff), checked per endpoint below.
router = APIRouter(prefix="/api/email", tags=["Email Operations"], dependencies=[Depends(require_full_app_access)])


# APIModel accepts both camelCase (the rest of the API) and snake_case (what
# existing callers of these endpoints send) request bodies.
class DueReminderRequest(APIModel):
    to_email: str
    customer_name: str
    invoice_id: str
    amount: float
    due_date: str
    days_overdue: Optional[int] = 4


class InvoiceEmailRequest(APIModel):
    to_email: str
    customer_name: str
    invoice_id: str
    amount: float
    due_date: str
    items_summary: Optional[str] = None


class CustomEmailRequest(APIModel):
    to_email: str
    subject: str
    message: str
    recipient_name: Optional[str] = None


def _org_name(user: User) -> Optional[str]:
    return user.organization.name if user.organization else None


def _raise_if_failed(result: dict) -> dict:
    if not result.get("success"):
        # email_service already logged the underlying exception and only
        # returns a client-safe message here.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error") or GENERIC_SEND_ERROR)
    return result


@router.post("/send-due-reminder")
def handle_send_due_reminder(payload: DueReminderRequest, user: User = Depends(require_write)):
    """Trigger an overdue payment reminder email to customer using Gmail SMTP."""
    result = send_due_reminder_email(
        to_email=payload.to_email,
        customer_name=payload.customer_name,
        invoice_id=payload.invoice_id,
        amount=payload.amount,
        due_date=payload.due_date,
        days_overdue=payload.days_overdue or 4,
        company_name=_org_name(user),
    )
    return _raise_if_failed(result)


@router.post("/send-invoice")
def handle_send_invoice(payload: InvoiceEmailRequest, user: User = Depends(require_write)):
    """Email official Tax Invoice dispatch directly to customer."""
    result = send_invoice_email(
        to_email=payload.to_email,
        customer_name=payload.customer_name,
        invoice_id=payload.invoice_id,
        amount=payload.amount,
        due_date=payload.due_date,
        items_summary=payload.items_summary,
        company_name=_org_name(user),
    )
    return _raise_if_failed(result)


@router.post("/send-message")
def handle_send_custom_message(payload: CustomEmailRequest, user: User = Depends(require_write)):
    """Dispatch custom communication email to customer, client, or others via Gmail SMTP."""
    result = send_custom_message_email(
        to_email=payload.to_email,
        subject=payload.subject,
        message=payload.message,
        recipient_name=payload.recipient_name,
        company_name=_org_name(user),
    )
    return _raise_if_failed(result)


@router.get("/status")
def get_email_service_status():
    """Verify SMTP configuration and sender status."""
    settings = get_settings()
    return {
        "status": "operational" if settings.smtp_configured else "not_configured",
        # The address these endpoints actually send From (see email_service).
        "sender": settings.smtp_user,
        "sender_name": settings.smtp_sender_name,
        "smtp_server": f"{settings.smtp_host}:{settings.smtp_port} (TLS)",
        "features": ["Customer Overdue Reminders", "Tax Invoice Dispatches"],
    }
