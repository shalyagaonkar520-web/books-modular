import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, Optional

from backend.config import get_settings


class SmtpNotConfigured(RuntimeError):
    """Raised when an email is requested but no SMTP credentials are set."""


def _smtp():
    """Current SMTP settings. Read at call time so tests can override them."""
    return get_settings()


def smtp_configured() -> bool:
    return _smtp().smtp_configured


def sender_identity() -> tuple[str, str]:
    """(sender name, sender address) for the From header. Never the password."""
    settings = _smtp()
    return settings.smtp_sender_name, settings.smtp_user


def get_smtp_connection():
    settings = _smtp()
    if not settings.smtp_configured:
        raise SmtpNotConfigured(
            "Email is not configured. Set SMTP_USER and SMTP_PASSWORD in the server environment."
        )
    server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30)
    server.starttls()
    server.login(settings.smtp_user, settings.smtp_password)
    return server


def send_due_reminder_email(
    to_email: str,
    customer_name: str,
    invoice_id: str,
    amount: float,
    due_date: str,
    days_overdue: int = 4,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Send an official, professional overdue payment reminder email to customer with optional PDF attachment."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Payment Reminder: Invoice {invoice_id} is Overdue - Rooman Technologies"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"
        note_block = f"""<div style="background:#f1f5f9; border-left:4px solid #64748b; padding:12px; margin:16px 0; font-size:13.5px; color:#334155;">
        <strong>Special Note from Accounts:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: #0f172a; padding: 28px 32px; text-align: left; }}
    .header h1 {{ color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; }}
    .header p {{ color: #94a3b8; margin: 4px 0 0 0; font-size: 13px; }}
    .content {{ padding: 32px; }}
    .salutation {{ font-size: 16px; font-weight: 600; margin-bottom: 16px; }}
    .notice-box {{ background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin: 20px 0; }}
    .notice-box p {{ margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5; }}
    .table-details {{ width: 100%; border-collapse: collapse; margin: 24px 0; }}
    .table-details th {{ text-align: left; padding: 10px 12px; background: #f1f5f9; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }}
    .table-details td {{ padding: 12px; font-size: 14px; border-bottom: 1px solid #e2e8f0; }}
    .amount-highlight {{ font-size: 18px; font-weight: 700; color: #b91c1c; }}
    .bank-box {{ background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 24px 0; }}
    .bank-box h3 {{ margin: 0 0 10px 0; font-size: 14px; color: #0f172a; }}
    .bank-box p {{ margin: 4px 0; font-size: 13px; color: #475569; font-family: monospace; }}
    .footer {{ background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rooman Technologies Pvt Ltd</h1>
      <p>Enterprise Financial Cloud & Accounting</p>
    </div>
    <div class="content">
      <div class="salutation">Dear Accounts Payable Team ({customer_name}),</div>
      <p>This is a formal communication from Rooman Technologies Accounts Department regarding the pending settlement of the invoice outlined below.</p>

      <div class="notice-box">
        <p><strong>Notice:</strong> This invoice was due on <strong>{due_date}</strong> ({days_overdue} days past due). Kindly arrange for the remittance at the earliest to prevent any service interruptions.</p>
      </div>

      {note_block}

      <table class="table-details">
        <tr>
          <th>Invoice #</th>
          <th>Due Date</th>
          <th>Status</th>
          <th>Outstanding Balance</th>
        </tr>
        <tr>
          <td><strong>{invoice_id}</strong></td>
          <td>{due_date}</td>
          <td><span style="color:#ef4444; font-weight:600;">Overdue</span></td>
          <td class="amount-highlight">{formatted_amount}</td>
        </tr>
      </table>

      <div class="bank-box">
        <h3>Direct Settlement Account Details</h3>
        <p>Beneficiary: <strong>Rooman Technologies Pvt Ltd</strong></p>
        <p>Bank: <strong>HDFC Bank Ltd</strong></p>
        <p>A/C Number: <strong>50200088921473</strong></p>
        <p>IFSC Code: <strong>HDFC0000240</strong></p>
        <p>UPI VPA: <strong>rooman.tech@hdfcbank</strong></p>
      </div>

      <p style="font-size:13.5px; color:#475569;">If the payment has already been initiated, please reply to this email with the transaction UTR number so our finance desk can update your ledger.</p>

      <p style="margin-top:24px; font-size:14px;">Warm regards,<br><strong>Finance & Accounts Desk</strong><br>Rooman Technologies Pvt Ltd</p>
    </div>
    <div class="footer">
      Rooman House, #12 Rajajinagar, Bengaluru, Karnataka 560010<br>
      Email: shalya@rooman.com • Tel: +91 80 4123 4567
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Invoice_{invoice_id}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Overdue reminder email sent successfully to {to_email}",
            "invoice_id": invoice_id,
            "amount": amount,
            "recipient": to_email,
            "pdf_attached": bool(pdf_bytes)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def send_invoice_email(
    to_email: str,
    customer_name: str,
    invoice_id: str,
    amount: float,
    due_date: str,
    items_summary: Optional[str] = None,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Send an official GST Tax Invoice dispatch email to customer with optional PDF attachment."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Tax Invoice {invoice_id} from Rooman Technologies Pvt Ltd"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"
        note_block = f"""<div style="background:#f1f5f9; border-left:4px solid #2563eb; padding:12px; margin:16px 0; font-size:13.5px; color:#334155;">
        <strong>Special Instructions:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }}
    .header {{ background: #0066cc; padding: 28px 32px; color: #fff; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .content {{ padding: 32px; }}
    .amount-box {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }}
    .amount-title {{ font-size: 13px; color: #1e40af; text-transform: uppercase; font-weight: 600; }}
    .amount-val {{ font-size: 28px; font-weight: 800; color: #1d4ed8; margin-top: 4px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rooman Technologies Pvt Ltd</h1>
      <p style="margin:4px 0 0 0; opacity:0.85; font-size:13px;">Official GST Tax Invoice Dispatch</p>
    </div>
    <div class="content">
      <p>Dear <strong>{customer_name}</strong>,</p>
      <p>Please find details of Tax Invoice <strong>{invoice_id}</strong> issued on your account.</p>

      <div class="amount-box">
        <div class="amount-title">Total Invoice Amount (Incl. GST)</div>
        <div class="amount-val">{formatted_amount}</div>
        <div style="font-size:13px; color:#64748b; margin-top:6px;">Payment Due: <strong>{due_date}</strong></div>
      </div>

      {note_block}

      <p style="font-size:13.5px; color:#475569;">Description / Service: {items_summary or 'Enterprise IT & Accounting Solutions'}</p>

      <p style="margin-top:28px; font-size:14px;">Regards,<br><strong>Rooman Technologies Billing Team</strong></p>
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Invoice_{invoice_id}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Tax Invoice {invoice_id} emailed successfully to {to_email}",
            "invoice_id": invoice_id,
            "pdf_attached": bool(pdf_bytes)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def send_custom_message_email(
    to_email: str,
    subject: str,
    message: str,
    recipient_name: Optional[str] = None
) -> Dict[str, Any]:
    """Send a custom communication email to a customer, client, or other recipient via Gmail SMTP."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_msg = message.replace("\n", "<br/>")
        salutation = f"Dear {recipient_name}," if recipient_name else "Hello,"

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: #0f172a; padding: 28px 32px; color: #fff; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .header p {{ color: #94a3b8; margin: 4px 0 0 0; font-size: 13px; }}
    .content {{ padding: 32px; line-height: 1.6; font-size: 15px; color: #334155; }}
    .msg-box {{ background: #f8fafc; border-left: 4px solid #2563eb; padding: 18px 20px; border-radius: 4px; margin: 20px 0; font-size: 14.5px; color: #1e293b; }}
    .footer {{ background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rooman Technologies Pvt Ltd</h1>
      <p>Enterprise Financial Cloud & Client Communication</p>
    </div>
    <div class="content">
      <p><strong>{salutation}</strong></p>
      <div class="msg-box">
        {formatted_msg}
      </div>
      <p style="margin-top:28px; font-size:14px;">Best regards,<br><strong>Accounts & Client Relations Team</strong><br>Rooman Technologies Pvt Ltd</p>
    </div>
    <div class="footer">
      Rooman House, #12 Rajajinagar, Bengaluru, Karnataka 560010<br>
      Email: shalya@rooman.com • Tel: +91 80 4123 4567
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Email successfully dispatched to {to_email}",
            "recipient": to_email,
            "subject": subject
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def send_payment_confirmation_request_email(
    to_email: str,
    payment_id: str,
    platform: str,
    amount: float,
    currency: str,
    external_transaction_id: str,
    approval_token: str,
    payer_name: Optional[str] = None,
    payer_email: Optional[str] = None,
    invoice_number: Optional[str] = None,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """Send an urgent external payment approval request email via Gmail SMTP with YES/NO 1-click action buttons."""
    try:
        msg = MIMEMultipart("alternative")
        formatted_amount = f"₹{amount:,.2f}" if currency.upper() == "INR" else f"{currency.upper()} {amount:,.2f}"
        display_platform = platform.upper()

        msg["Subject"] = f"⚡ ACTION REQUIRED: Confirm {display_platform} Payment of {formatted_amount} from {payer_name or 'Customer'}"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        yes_url = f"{base_url}/api/payments/external/confirm?token={approval_token}&decision=yes"
        no_url = f"{base_url}/api/payments/external/confirm?token={approval_token}&decision=no"

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); }}
    .header {{ background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 28px 32px; text-align: left; border-bottom: 3px solid #2563eb; }}
    .header h1 {{ color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }}
    .header p {{ color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; }}
    .content {{ padding: 32px; background: #ffffff; }}
    .alert-banner {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 6px; margin-bottom: 24px; }}
    .alert-banner p {{ margin: 0; color: #1e40af; font-size: 14px; font-weight: 600; }}
    .amount-hero {{ background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }}
    .amount-hero .lbl {{ font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em; }}
    .amount-hero .val {{ font-size: 32px; font-weight: 800; color: #0f172a; margin-top: 4px; }}
    .details-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .details-table th {{ text-align: left; padding: 10px 12px; background: #f1f5f9; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }}
    .details-table td {{ padding: 12px; font-size: 14px; border-bottom: 1px solid #e2e8f0; color: #334155; }}
    .actions-card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-top: 28px; text-align: center; }}
    .actions-card h3 {{ margin: 0 0 8px 0; font-size: 16px; color: #0f172a; font-weight: 700; }}
    .actions-card p {{ margin: 0 0 20px 0; font-size: 13px; color: #64748b; }}
    .btn-yes {{ background-color: #16a34a; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 6px 8px; }}
    .btn-no {{ background-color: #dc2626; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 6px 8px; }}
    .footer {{ background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rooman Technologies Pvt Ltd</h1>
      <p>Automated Financial Cloud & Gateway Ingestion</p>
    </div>
    <div class="content">
      <div class="alert-banner">
        <p>⚡ External Payment Ingestion Alert: Pending Verification</p>
      </div>

      <div class="amount-hero">
        <div class="lbl">Detected Remittance Amount</div>
        <div class="val">{formatted_amount}</div>
      </div>

      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        A payment notification has arrived from <strong>{display_platform}</strong>. Please confirm whether this payment should be recorded into Rooman Books and applied to the accounts.
      </p>

      <table class="details-table">
        <tr>
          <th>Platform / Gateway</th>
          <td><strong>{display_platform}</strong></td>
        </tr>
        <tr>
          <th>Transaction / UTR #</th>
          <td><code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:13px;">{external_transaction_id}</code></td>
        </tr>
        <tr>
          <th>Payer Name</th>
          <td>{payer_name or 'N/A'}</td>
        </tr>
        <tr>
          <th>Payer Email</th>
          <td>{payer_email or 'N/A'}</td>
        </tr>
        <tr>
          <th>Matched Invoice</th>
          <td>{invoice_number or 'Unassigned Customer Advance'}</td>
        </tr>
      </table>

      <div class="actions-card">
        <h3>Confirmation Required (Gmail YES / NO)</h3>
        <p>Choose an action below to process this payment in your books:</p>

        <a href="{yes_url}" class="btn-yes" target="_blank">✅ YES &mdash; APPROVE & RECORD</a>
        <a href="{no_url}" class="btn-no" target="_blank">❌ NO &mdash; REJECT & DISCARD</a>
      </div>

      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
        Clicking <strong>YES</strong> will instantly post general ledger entries, credit Accounts Receivable, and update bank balances. Clicking <strong>NO</strong> will discard this transaction without touching books.
      </p>
    </div>
    <div class="footer">
      Rooman House, #12 Rajajinagar, Bengaluru, Karnataka 560010<br>
      Automated via Gmail SMTP &bull; Rooman Books Finance Operations Desk
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Confirmation request email sent successfully to {to_email}",
            "payment_id": payment_id,
            "recipient": to_email,
            "approval_token": approval_token,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def send_customer_payment_email(
    to_email: str,
    customer_name: str,
    payment_number: str,
    amount: float,
    payment_date: str,
    payment_mode: str = "bank_transfer",
    reference: Optional[str] = None,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Send official customer payment receipt via Gmail SMTP."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Official Payment Receipt: {payment_number} - Rooman Technologies"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"
        note_block = f"""<div style="background:#f1f5f9; border-left:4px solid #16a34a; padding:12px; margin:16px 0; font-size:13.5px; color:#334155;">
        <strong>Notes from Rooman Accounts:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #16a34a; padding: 26px 32px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px;">Rooman Technologies Pvt Ltd</h1>
      <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Official Payment Receipt & Acknowledgment</p>
    </div>
    <div style="padding: 30px;">
      <p style="font-size: 15px;">Dear <strong>{customer_name}</strong>,</p>
      <p style="font-size: 14px; color: #475569;">Thank you for your payment. We are pleased to acknowledge receipt of the funds detailed below:</p>

      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; color: #047857; text-transform: uppercase; font-weight: 700;">Amount Received</div>
        <div style="font-size: 28px; font-weight: 800; color: #065f46; margin-top: 4px;">{formatted_amount}</div>
        <div style="font-size: 13px; color: #047857; margin-top: 6px;">Receipt #: <strong>{payment_number}</strong> &bull; Date: <strong>{payment_date}</strong></div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px;">
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Payment Mode</td><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; text-align: right;">{payment_mode.upper()}</td></tr>
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Reference / UTR</td><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-family: monospace; text-align: right;">{reference or 'N/A'}</td></tr>
      </table>

      {note_block}

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">The formal stamped receipt PDF is attached to this email for your accounting records.</p>
      <p style="margin-top: 28px; font-size: 14px;">Warm regards,<br><strong>Finance & Billing Department</strong><br>Rooman Technologies Pvt Ltd</p>
    </div>
  </div>
</body>
</html>"""
        msg.attach(MIMEText(html, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Receipt_{payment_number}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()
        return {"success": True, "message": f"Payment receipt {payment_number} emailed to {to_email}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_vendor_payment_email(
    to_email: str,
    vendor_name: str,
    payment_number: str,
    amount: float,
    payment_date: str,
    payment_mode: str = "bank_transfer",
    reference: Optional[str] = None,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Send vendor remittance advice via Gmail SMTP."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Payment Remittance Advice: Voucher {payment_number} - Rooman Technologies"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"
        note_block = f"""<div style="background:#f1f5f9; border-left:4px solid #2563eb; padding:12px; margin:16px 0; font-size:13.5px; color:#334155;">
        <strong>Remittance Note:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #2563eb; padding: 26px 32px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px;">Rooman Technologies Pvt Ltd</h1>
      <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Payment Remittance Advice</p>
    </div>
    <div style="padding: 30px;">
      <p style="font-size: 15px;">Dear <strong>{vendor_name}</strong>,</p>
      <p style="font-size: 14px; color: #475569;">We have initiated a payment disbursement towards your pending bills/statements as follows:</p>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; color: #1d4ed8; text-transform: uppercase; font-weight: 700;">Amount Disbursed</div>
        <div style="font-size: 28px; font-weight: 800; color: #1e40af; margin-top: 4px;">{formatted_amount}</div>
        <div style="font-size: 13px; color: #1d4ed8; margin-top: 6px;">Voucher #: <strong>{payment_number}</strong> &bull; Date: <strong>{payment_date}</strong></div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px;">
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Transfer Mode</td><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; text-align: right;">{payment_mode.upper()}</td></tr>
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">UTR / Cheque Ref</td><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-family: monospace; text-align: right;">{reference or 'N/A'}</td></tr>
      </table>

      {note_block}

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Please find the attached remittance voucher PDF for your records.</p>
      <p style="margin-top: 28px; font-size: 14px;">Best regards,<br><strong>Accounts Payable Team</strong><br>Rooman Technologies Pvt Ltd</p>
    </div>
  </div>
</body>
</html>"""
        msg.attach(MIMEText(html, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Remittance_{payment_number}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()
        return {"success": True, "message": f"Remittance advice {payment_number} emailed to {to_email}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_expense_email(
    to_email: str,
    recipient_name: str,
    expense_number: str,
    category: str,
    payee: str,
    amount: float,
    expense_date: str,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Send expense record/voucher via Gmail SMTP."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Expense Voucher: {expense_number} ({category}) - Rooman Technologies"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"
        note_block = f"""<div style="background:#f1f5f9; border-left:4px solid #d97706; padding:12px; margin:16px 0; font-size:13.5px; color:#334155;">
        <strong>Expense Details:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #d97706; padding: 26px 32px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px;">Rooman Technologies Pvt Ltd</h1>
      <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Operating Expense Notification</p>
    </div>
    <div style="padding: 30px;">
      <p style="font-size: 15px;">Hello <strong>{recipient_name}</strong>,</p>
      <p style="font-size: 14px; color: #475569;">Here are the details for Expense Voucher <strong>{expense_number}</strong> recorded in Rooman Books:</p>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; color: #b45309; text-transform: uppercase; font-weight: 700;">Expense Amount</div>
        <div style="font-size: 28px; font-weight: 800; color: #92400e; margin-top: 4px;">{formatted_amount}</div>
        <div style="font-size: 13px; color: #b45309; margin-top: 6px;">Category: <strong>{category}</strong> &bull; Date: <strong>{expense_date}</strong></div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px;">
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Payee</td><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; text-align: right;">{payee}</td></tr>
      </table>

      {note_block}

      <p style="margin-top: 28px; font-size: 14px;">Regards,<br><strong>Accounting Operations Desk</strong><br>Rooman Technologies Pvt Ltd</p>
    </div>
  </div>
</body>
</html>"""
        msg.attach(MIMEText(html, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Expense_{expense_number}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()
        return {"success": True, "message": f"Expense notification {expense_number} emailed to {to_email}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_overall_report_email(
    to_email: str,
    recipient_name: Optional[str] = "Finance & Management Team",
    organization_name: str = "Rooman Technologies Pvt Ltd",
    period_label: str = "This Fiscal Year",
    total_cash: float = 0.0,
    receivables_total: float = 0.0,
    receivables_overdue: float = 0.0,
    payables_total: float = 0.0,
    payables_overdue: float = 0.0,
    total_income: float = 0.0,
    total_expense: float = 0.0,
    net_profit: float = 0.0,
    inventory_valuation: float = 0.0,
    custom_notes: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Dispatch an Executive Overall Financial & Operations Report via Gmail SMTP."""
    try:
        msg = MIMEMultipart("mixed") if pdf_bytes else MIMEMultipart("alternative")
        msg["Subject"] = f"Executive Overall Financial Report ({period_label}) - {organization_name}"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        net_tone = "#059669" if net_profit >= 0 else "#dc2626"
        net_bg = "#ecfdf5" if net_profit >= 0 else "#fef2f2"
        net_border = "#a7f3d0" if net_profit >= 0 else "#fecaca"
        net_label = "Net Operating Profit" if net_profit >= 0 else "Net Operating Loss"

        note_block = f"""<div style="background:#f8fafc; border-left:4px solid #3b82f6; padding:12px 16px; margin:20px 0; border-radius:4px; font-size:13.5px; color:#334155;">
        <strong style="color:#1e293b;">Executive Notes:</strong><br/>{custom_notes}
        </div>""" if custom_notes else ""

        pdf_badge = f"""<div style="margin:16px 0; padding:10px 14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:13px; color:#1e40af;">
        📎 <strong>Attached:</strong> Complete Executive Financial &amp; Operations PDF Report ({pdf_filename or 'Overall_Report.pdf'})
        </div>""" if pdf_bytes else ""

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; color: #ffffff;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #38bdf8; font-weight: 700;">Executive Financial Dispatch</div>
      <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700;">{organization_name}</h1>
      <p style="margin: 6px 0 0 0; opacity: 0.85; font-size: 13.5px;">Overall Performance Report &bull; <strong>{period_label}</strong></p>
    </div>

    <div style="padding: 28px 32px;">
      <p style="font-size: 15px; margin-top: 0;">Hello <strong>{recipient_name or 'Team'}</strong>,</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.5;">
        Here is the live executive summary report derived from posted accounting transactions for <strong>{period_label}</strong> in Rooman Books.
      </p>

      <!-- Highlight Net Profit Card -->
      <div style="background: {net_bg}; border: 1px solid {net_border}; border-radius: 8px; padding: 18px 22px; text-align: center; margin: 20px 0;">
        <div style="font-size: 11px; color: {net_tone}; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">{net_label}</div>
        <div style="font-size: 30px; font-weight: 800; color: {net_tone}; margin-top: 4px;">₹{abs(net_profit):,.2f}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Revenue: <strong>₹{total_income:,.2f}</strong> &bull; Expenses: <strong>₹{total_expense:,.2f}</strong></div>
      </div>

      <!-- Financial Metric Grid -->
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13.5px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569;">Financial Area</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #475569;">Live Position</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; color: #334155;"><strong>Cash on Hand</strong> (Liquid Bank &amp; Cash)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹{total_cash:,.2f}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; color: #334155;">
              <strong>Accounts Receivable</strong>
              <div style="font-size: 12px; color: #ef4444;">Overdue: ₹{receivables_overdue:,.2f}</div>
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹{receivables_total:,.2f}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; color: #334155;">
              <strong>Accounts Payable</strong>
              <div style="font-size: 12px; color: #f59e0b;">Overdue: ₹{payables_overdue:,.2f}</div>
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹{payables_total:,.2f}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; color: #334155;"><strong>Total Inventory Valuation</strong></td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹{inventory_valuation:,.2f}</td>
          </tr>
        </tbody>
      </table>

      {note_block}
      {pdf_badge}

      <div style="margin-top: 30px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
        <p style="margin: 0 0 4px 0;">Dispatched directly from <strong>Rooman Books Cloud Accounting</strong> via Gmail SMTP.</p>
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">Email: shalya@rooman.com &bull; Accounts Operations</p>
      </div>
    </div>
  </div>
</body>
</html>"""
        msg.attach(MIMEText(html, "html"))

        if pdf_bytes:
            filename = pdf_filename or f"Executive_Report_{period_label.replace(' ', '_')}.pdf"
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()
        return {
            "success": True,
            "message": f"Overall executive report ({period_label}) emailed successfully to {to_email}",
            "recipient": to_email,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}






def send_invite_email(
    to_email: str,
    name: str,
    organization_name: str,
    role: str,
    inviter_name: str,
    accept_url: str,
) -> Dict[str, Any]:
    """Invite a new user by email with a link to set their own password via Gmail SMTP."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"You're invited to {organization_name} on Rooman Books"
        msg["From"] = f"{_smtp().smtp_sender_name} <{_smtp().smtp_user}>"
        msg["To"] = to_email

        role_label = {"admin": "Administrator", "staff": "Staff", "viewer": "Viewer"}.get(role, role.title())

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: #0f172a; padding: 28px 32px; color: #fff; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .header p {{ color: #94a3b8; margin: 4px 0 0 0; font-size: 13px; }}
    .content {{ padding: 32px; line-height: 1.6; font-size: 15px; color: #334155; }}
    .role-badge {{ display: inline-block; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 999px; padding: 4px 14px; font-size: 12.5px; font-weight: 600; margin: 4px 0 20px 0; }}
    .cta {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 14.5px; margin: 12px 0; }}
    .link-fallback {{ word-break: break-all; font-size: 12.5px; color: #64748b; margin-top: 18px; }}
    .footer {{ background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{organization_name}</h1>
      <p>You've been invited to Rooman Books</p>
    </div>
    <div class="content">
      <p><strong>Hello {name},</strong></p>
      <p>{inviter_name} has invited you to join <strong>{organization_name}</strong> on Rooman Books.</p>
      <div><span class="role-badge">Role: {role_label}</span></div>
      <p>Click the button below to create your password. You'll then return here and sign in with your email and new password.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="{accept_url}" class="cta">Set your password</a>
      </p>
      <p class="link-fallback">Or paste this link into your browser:<br>{accept_url}</p>
      <p style="margin-top:24px; font-size:13px; color:#64748b;">This link expires in 7 days. If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      Rooman House, #12 Rajajinagar, Bengaluru, Karnataka 560010
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        server = get_smtp_connection()
        server.sendmail(_smtp().smtp_user, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Invite email sent to {to_email}",
            "recipient": to_email,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def verify_smtp_credentials(host: str, port: int, username: str, password: str) -> None:
    """Log in to the mail server with these details. Raises if they are rejected."""
    server = smtplib.SMTP(host, port, timeout=20)
    try:
        server.starttls()
        server.login(username, password)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def send_test_email(to_email: str, organization_name: str) -> Dict[str, Any]:
    """Confirmation message an admin sends to themselves after configuring SMTP."""
    try:
        settings = _smtp()
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Rooman Books — outbound email is working"
        msg["From"] = f"{settings.smtp_sender_name} <{settings.smtp_user}>"
        msg["To"] = to_email

        html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; margin:0; padding:24px; color:#1e293b;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
    <div style="background:#0f172a; padding:24px 28px; color:#fff;">
      <h1 style="margin:0; font-size:18px;">{organization_name}</h1>
      <p style="margin:4px 0 0; color:#94a3b8; font-size:13px;">Rooman Books</p>
    </div>
    <div style="padding:28px; font-size:15px; line-height:1.6; color:#334155;">
      <p style="margin-top:0;"><strong>Outbound email is configured correctly.</strong></p>
      <p>This test was sent from <strong>{settings.smtp_user}</strong> via {settings.smtp_host}.
         Invites, invoices and payment reminders will be delivered from this address.</p>
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))
        server = get_smtp_connection()
        server.sendmail(settings.smtp_user, to_email, msg.as_string())
        server.quit()
        return {"success": True, "message": f"Test email sent to {to_email}", "recipient": to_email}
    except Exception as e:
        return {"success": False, "error": str(e)}
