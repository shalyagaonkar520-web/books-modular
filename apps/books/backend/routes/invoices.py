from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse
from backend.models import InvoiceResponse, InvoiceCreate, InvoiceUpdateStatus
from backend.database import (
    get_all_invoices,
    get_invoice_by_id,
    create_invoice,
    update_invoice_status,
    number_to_indian_words,
)

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


@router.get("", response_model=List[InvoiceResponse])
def list_invoices():
    """Retrieve all sales invoices from the ledger repository."""
    return get_all_invoices()


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str):
    """Retrieve a single invoice with full line item details."""
    inv = get_invoice_by_id(invoice_id)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice with ID '{invoice_id}' not found"
        )
    return inv


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def add_invoice(data: InvoiceCreate):
    """Generate and store a new GST-compliant sales invoice."""
    created = create_invoice(data.model_dump(by_alias=True))
    return created


@router.put("/{invoice_id}/status", response_model=InvoiceResponse)
def set_status(invoice_id: str, body: InvoiceUpdateStatus):
    """Update invoice settlement or delivery status."""
    updated = update_invoice_status(invoice_id, body.status)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice with ID '{invoice_id}' not found"
        )
    return updated


@router.get("/{invoice_id}/html", response_class=HTMLResponse)
def get_invoice_html(invoice_id: str):
    """Generate a print-ready, GST-compliant Tax Invoice document."""
    inv = get_invoice_by_id(invoice_id)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice with ID '{invoice_id}' not found"
        )

    items_html = ""
    for idx, itm in enumerate(inv.get("items", []), start=1):
        rate = itm.get("rate", 0)
        qty = itm.get("quantity", 1)
        tax = itm.get("taxRate", 18)
        line_total = rate * qty
        items_html += f"""
        <tr>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">{idx}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0;">
                <strong>{itm.get('name', '')}</strong>
                <div style="font-size:12px; color:#64748b;">{itm.get('description', '')}</div>
            </td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">{itm.get('hsn', '998313')}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">{qty}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">₹{rate:,.2f}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">{tax}%</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:600;">₹{line_total:,.2f}</td>
        </tr>
        """

    subtotal = inv.get("subtotal", 0)
    cgst = inv.get("taxAmount", 0) / 2.0
    sgst = cgst
    total = inv.get("amount", 0)
    words = number_to_indian_words(total)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Tax Invoice - {inv['id']}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: #fff; }}
        .invoice-card {{ max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
        .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }}
        .company-title {{ font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; }}
        .tax-invoice-badge {{ font-size: 24px; font-weight: 800; color: #2563eb; text-align: right; text-transform: uppercase; letter-spacing: 1px; }}
        .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; font-size: 14px; line-height: 1.6; }}
        .meta-box {{ background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; }}
        .meta-title {{ font-weight: 700; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 8px; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }}
        th {{ background: #f1f5f9; padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left; font-weight: 600; color: #334155; }}
        .totals {{ display: flex; justify-content: flex-end; margin-bottom: 24px; }}
        .totals-table {{ width: 340px; font-size: 14px; }}
        .totals-table td {{ padding: 6px 10px; }}
        .grand-total {{ font-size: 18px; font-weight: 700; color: #0f172a; border-top: 2px solid #2563eb; border-bottom: 2px solid #2563eb; }}
        .words-box {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #166534; font-weight: 600; margin-bottom: 24px; }}
        .bank-details {{ background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 6px; padding: 14px; font-size: 12px; line-height: 1.5; color: #475569; }}
        .footer {{ margin-top: 36px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #64748b; }}
        .seal {{ text-align: center; border-top: 1px solid #94a3b8; width: 200px; padding-top: 6px; }}
        @media print {{
            body {{ padding: 0; }}
            .invoice-card {{ border: none; box-shadow: none; padding: 0; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="max-width: 800px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 10px;">
        <button onclick="window.print()" style="padding: 8px 18px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
    </div>
    <div class="invoice-card">
        <div class="header">
            <div>
                <h1 class="company-title">Zylker Electronics India Pvt Ltd</h1>
                <div style="font-size: 13px; color: #475569;">Tech Park Plaza, Outer Ring Road, Bengaluru 560103</div>
                <div style="font-size: 13px; color: #475569;"><strong>GSTIN:</strong> 29AABCU9603R1ZM | <strong>State:</strong> 29-Karnataka</div>
            </div>
            <div>
                <div class="tax-invoice-badge">TAX INVOICE</div>
                <div style="font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; margin-top: 4px;">{inv['id']}</div>
                <div style="font-size: 12px; color: #64748b; text-align: right;">Date: {inv['date']}</div>
                <div style="font-size: 12px; color: #64748b; text-align: right;">Due Date: {inv['due']}</div>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-box">
                <div class="meta-title">BILLED TO (CUSTOMER)</div>
                <div style="font-weight: 700; font-size: 15px; color: #0f172a;">{inv['client']}</div>
                <div>GSTIN: {inv['clientGstin']}</div>
                <div>Email: {inv.get('clientEmail') or 'accounts@' + inv['client'].lower().replace(' ', '') + '.com'}</div>
                <div>Place of Supply: 29-Karnataka</div>
            </div>
            <div class="meta-box">
                <div class="meta-title">PAYMENT & INVOICE STATUS</div>
                <div><strong>Status:</strong> <span style="display:inline-block; padding:2px 10px; border-radius:12px; font-weight:600; font-size:12px; background:{'#dcfce7' if inv['status'] == 'Paid' else '#fef3c7'}; color:{'#166534' if inv['status'] == 'Paid' else '#92400e'};">{inv['status']}</span></div>
                <div><strong>Terms:</strong> Net 15 Days</div>
                <div><strong>Payment Mode:</strong> NEFT / RTGS / IMPS / UPI</div>
                <div><strong>Bank A/C:</strong> 50200049281928 (HDFC Bank)</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 30px; text-align: center;">#</th>
                    <th>Item Description</th>
                    <th style="width: 70px; text-align: center;">HSN/SAC</th>
                    <th style="width: 50px; text-align: center;">Qty</th>
                    <th style="width: 100px; text-align: right;">Rate (₹)</th>
                    <th style="width: 60px; text-align: center;">GST</th>
                    <th style="width: 110px; text-align: right;">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                {items_html if items_html else f'''
                <tr>
                    <td style="padding:10px; text-align:center;">1</td>
                    <td style="padding:10px;"><strong>Professional Enterprise Consulting & Software Services</strong></td>
                    <td style="padding:10px; text-align:center;">998313</td>
                    <td style="padding:10px; text-align:center;">1</td>
                    <td style="padding:10px; text-align:right;">₹{subtotal:,.2f}</td>
                    <td style="padding:10px; text-align:center;">18%</td>
                    <td style="padding:10px; text-align:right; font-weight:600;">₹{subtotal:,.2f}</td>
                </tr>
                '''}
            </tbody>
        </table>

        <div class="totals">
            <table class="totals-table">
                <tr>
                    <td>Subtotal (Taxable Value):</td>
                    <td style="text-align: right; font-weight: 600;">₹{subtotal:,.2f}</td>
                </tr>
                <tr>
                    <td>Central Tax (CGST 9%):</td>
                    <td style="text-align: right;">₹{cgst:,.2f}</td>
                </tr>
                <tr>
                    <td>State Tax (SGST 9%):</td>
                    <td style="text-align: right;">₹{sgst:,.2f}</td>
                </tr>
                <tr class="grand-total">
                    <td>Total Invoice Value:</td>
                    <td style="text-align: right;">₹{total:,.2f}</td>
                </tr>
            </table>
        </div>

        <div class="words-box">
            Amount in Words: {words}
        </div>

        <div class="bank-details">
            <strong>Bank Account Details for Remittance:</strong><br>
            Bank Name: HDFC Bank Corporate Banking | Account Name: Zylker Electronics India Pvt Ltd<br>
            Current Account No: 50200049281928 | IFSC Code: HDFC0000053 | Branch: Richmond Circle, Bengaluru
        </div>

        <div class="footer">
            <div>
                <em>Note: This is a computer-generated tax invoice and requires no physical signature under IT Act 2000.</em>
            </div>
            <div class="seal">
                <strong>For Zylker Electronics India Pvt Ltd</strong><br><br>
                <span>Authorized Signatory</span>
            </div>
        </div>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html)
