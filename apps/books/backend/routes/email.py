from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from backend.services.email_service import send_custom_message_email, send_due_reminder_email, send_invoice_email

router = APIRouter(prefix="/api/email", tags=["Email Operations"])


class DueReminderRequest(BaseModel):
    to_email: str
    customer_name: str
    invoice_id: str
    amount: float
    due_date: str
    days_overdue: Optional[int] = 4


class InvoiceEmailRequest(BaseModel):
    to_email: str
    customer_name: str
    invoice_id: str
    amount: float
    due_date: str
    items_summary: Optional[str] = None


class CustomEmailRequest(BaseModel):
    to_email: str
    subject: str
    message: str
    recipient_name: Optional[str] = None


@router.post("/send-due-reminder")
def handle_send_due_reminder(payload: DueReminderRequest):
    """Trigger an overdue payment reminder email to customer using Gmail SMTP."""
    result = send_due_reminder_email(
        to_email=payload.to_email,
        customer_name=payload.customer_name,
        invoice_id=payload.invoice_id,
        amount=payload.amount,
        due_date=payload.due_date,
        days_overdue=payload.days_overdue or 4
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to dispatch reminder email via SMTP")
        )
    return result


@router.post("/send-invoice")
def handle_send_invoice(payload: InvoiceEmailRequest):
    """Email official Tax Invoice dispatch directly to customer."""
    result = send_invoice_email(
        to_email=payload.to_email,
        customer_name=payload.customer_name,
        invoice_id=payload.invoice_id,
        amount=payload.amount,
        due_date=payload.due_date,
        items_summary=payload.items_summary
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to send invoice email via SMTP")
        )
    return result


@router.post("/send-message")
def handle_send_custom_message(payload: CustomEmailRequest):
    """Dispatch custom communication email to customer, client, or others via Gmail SMTP."""
    result = send_custom_message_email(
        to_email=payload.to_email,
        subject=payload.subject,
        message=payload.message,
        recipient_name=payload.recipient_name
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to dispatch email via SMTP")
        )
    return result



@router.get("/status")
def get_email_service_status():
    """Verify SMTP configuration and sender status."""
    return {
        "status": "operational",
        "sender": "shalya@rooman.com",
        "smtp_server": "smtp.gmail.com:587 (TLS)",
        "features": ["Customer Overdue Reminders", "Tax Invoice Dispatches"]
    }
