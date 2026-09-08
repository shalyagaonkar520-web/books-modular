import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "shalya@rooman.com"
SMTP_PASSWORD = "***REMOVED***"
SENDER_NAME = "Rooman Technologies Accounts"


def get_smtp_connection():
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    server.starttls()
    server.login(SMTP_USER, SMTP_PASSWORD)
    return server


def send_due_reminder_email(
    to_email: str,
    customer_name: str,
    invoice_id: str,
    amount: float,
    due_date: str,
    days_overdue: int = 4
) -> Dict[str, Any]:
    """Send an official, professional overdue payment reminder email to customer."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Payment Reminder: Invoice {invoice_id} is Overdue - Rooman Technologies"
        msg["From"] = f"{SENDER_NAME} <{SMTP_USER}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"

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

        server = get_smtp_connection()
        server.sendmail(SMTP_USER, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Overdue reminder email sent successfully to {to_email}",
            "invoice_id": invoice_id,
            "amount": amount,
            "recipient": to_email
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
    items_summary: Optional[str] = None
) -> Dict[str, Any]:
    """Send an official GST Tax Invoice dispatch email to customer."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Tax Invoice {invoice_id} from Rooman Technologies Pvt Ltd"
        msg["From"] = f"{SENDER_NAME} <{SMTP_USER}>"
        msg["To"] = to_email

        formatted_amount = f"₹{amount:,.2f}"

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

      <p style="font-size:13.5px; color:#475569;">Description / Service: {items_summary or 'Enterprise IT & Accounting Solutions'}</p>

      <p style="margin-top:28px; font-size:14px;">Regards,<br><strong>Rooman Technologies Billing Team</strong></p>
    </div>
  </div>
</body>
</html>
"""
        msg.attach(MIMEText(html_body, "html"))

        server = get_smtp_connection()
        server.sendmail(SMTP_USER, to_email, msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Tax Invoice {invoice_id} emailed successfully to {to_email}",
            "invoice_id": invoice_id
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
