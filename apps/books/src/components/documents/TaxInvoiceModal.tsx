import React from 'react';
import { Invoice } from '../../services/apiClient';
import { formatINR, numberToIndianWords } from '../../utils/currency';
import { Printer, Download, ExternalLink, Check, X, ShieldCheck } from 'lucide-react';

interface TaxInvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onStatusChange?: (invoiceId: string, newStatus: 'Paid' | 'Sent') => void;
}

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  invoice,
  onClose,
  onStatusChange,
}) => {
  if (!invoice) return null;

  const subtotal = invoice.subtotal || Math.round(invoice.amount / 1.18);
  const taxAmount = invoice.taxAmount || Math.round(invoice.amount - subtotal);
  const cgst = Math.round((taxAmount / 2) * 100) / 100;
  const sgst = Math.round((taxAmount / 2) * 100) / 100;
  const amountInWords = numberToIndianWords(invoice.amount);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHTML = () => {
    const filename = `Tax_Invoice_${invoice.id}.html`;
    const itemsRows = (invoice.items || []).map((itm, idx) => `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${idx + 1}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0;">
          <strong>${itm.name}</strong>
          ${itm.description ? `<div style="font-size:12px; color:#64748b;">${itm.description}</div>` : ''}
        </td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.hsn || '998313'}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.quantity}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">₹${itm.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.taxRate}%</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:600;">₹${(itm.quantity * itm.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tax Invoice - ${invoice.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
    .card { max-width: 820px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; font-size: 13.5px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #f1f5f9; padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 340px; font-size: 13.5px; }
    .totals-table td { padding: 6px 10px; }
    .grand-total { font-size: 17px; font-weight: 800; border-top: 2px solid #2563eb; border-bottom: 2px solid #2563eb; }
    .words-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; font-weight: 600; color: #166534; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <h1 style="font-size:22px; margin:0 0 4px 0;">Zylker Electronics India Pvt Ltd</h1>
        <div style="color:#475569; font-size:13px;">Tech Park Plaza, Outer Ring Road, Bengaluru 560103</div>
        <div style="color:#475569; font-size:13px;"><strong>GSTIN:</strong> 29AABCU9603R1ZM | <strong>State:</strong> 29-Karnataka</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px; font-weight:800; color:#2563eb;">TAX INVOICE</div>
        <div style="font-weight:700; font-size:15px; margin-top:4px;">${invoice.id}</div>
        <div style="color:#64748b; font-size:12px;">Date: ${invoice.date}</div>
        <div style="color:#64748b; font-size:12px;">Due Date: ${invoice.due}</div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-box">
        <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:6px;">BILLED TO (CUSTOMER)</div>
        <div style="font-size:15px; font-weight:700;">${invoice.client}</div>
        <div>GSTIN: ${invoice.clientGstin || '29AABCU9603R1ZM'}</div>
        <div>Email: ${invoice.clientEmail || 'finance@' + invoice.client.toLowerCase().replace(/[^a-z]/g, '') + '.com'}</div>
        <div>Place of Supply: 29-Karnataka</div>
      </div>
      <div class="meta-box">
        <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:6px;">STATUS & REMITTANCE</div>
        <div>Status: <strong>${invoice.status}</strong></div>
        <div>Payment Mode: NEFT / RTGS / IMPS / UPI</div>
        <div>HDFC Bank Current A/C: 50200049281928</div>
        <div>IFSC Code: HDFC0000053</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:30px; text-align:center;">#</th>
          <th>Item Description</th>
          <th style="width:70px; text-align:center;">HSN/SAC</th>
          <th style="width:50px; text-align:center;">Qty</th>
          <th style="width:100px; text-align:right;">Rate (₹)</th>
          <th style="width:60px; text-align:center;">GST</th>
          <th style="width:110px; text-align:right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || `
          <tr>
            <td style="padding:10px; text-align:center;">1</td>
            <td style="padding:10px;"><strong>Professional Enterprise Consulting & Software Services</strong></td>
            <td style="padding:10px; text-align:center;">998313</td>
            <td style="padding:10px; text-align:center;">1</td>
            <td style="padding:10px; text-align:right;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding:10px; text-align:center;">18%</td>
            <td style="padding:10px; text-align:right; font-weight:600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        `}
      </tbody>
    </table>
    <div class="totals">
      <table class="totals-table">
        <tr><td>Subtotal (Taxable Value):</td><td style="text-align:right; font-weight:600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td>Central Tax (CGST 9%):</td><td style="text-align:right;">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td>State Tax (SGST 9%):</td><td style="text-align:right;">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr class="grand-total"><td>Total Invoice Amount:</td><td style="text-align:right;">₹${invoice.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      </table>
    </div>
    <div class="words-box">
      Amount in Words: ${amountInWords}
    </div>
    <div style="font-size:12px; color:#64748b; margin-top:24px; text-align:center;">
      This is an official computer-generated GST tax invoice from Rooman Books.
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openServerHtml = () => {
    window.open(`/api/invoices/${invoice.id}/html`, '_blank');
  };

  return (
    <div className="zb-doc-modal-overlay" onClick={onClose}>
      <div className="zb-doc-modal-container" onClick={e => e.stopPropagation()}>
        {/* Modal Header Toolbar */}
        <div className="zb-doc-modal-header zb-no-print">
          <div className="zb-flex-align gap-2">
            <ShieldCheck size={20} className="text-success" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Tax Invoice Document &mdash; {invoice.id}
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                GST Compliant &bull; Digital Signature Ready &bull; Status: {invoice.status}
              </span>
            </div>
          </div>

          <div className="zb-doc-modal-actions">
            {invoice.status !== 'Paid' && onStatusChange && (
              <button
                className="zb-btn zb-btn-sm zb-btn-outline-primary"
                onClick={() => onStatusChange(invoice.id, 'Paid')}
                title="Mark this invoice as Paid"
              >
                <Check size={14} /> Mark as Paid
              </button>
            )}
            <button
              className="zb-btn zb-btn-sm zb-btn-secondary"
              onClick={openServerHtml}
              title="Open full page HTML view in new tab"
            >
              <ExternalLink size={14} /> Full View
            </button>
            <button
              className="zb-btn zb-btn-sm zb-btn-secondary"
              onClick={handleDownloadHTML}
              title="Download standalone HTML invoice file"
            >
              <Download size={14} /> Download
            </button>
            <button
              className="zb-btn zb-btn-sm zb-btn-primary"
              onClick={handlePrint}
              title="Print or Save as PDF"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
            <button
              className="zb-close-btn"
              onClick={onClose}
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body - Official Tax Invoice Paper Sheet */}
        <div className="zb-doc-modal-body">
          <div className="zb-paper-sheet">
            {/* Paper Header */}
            <div className="zb-paper-header">
              <div>
                <h1 className="zb-paper-title">Zylker Electronics India Pvt Ltd</h1>
                <div style={{ fontSize: '13px', color: '#475569' }}>Tech Park Plaza, Outer Ring Road, Bengaluru 560103</div>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  <strong>GSTIN:</strong> 29AABCU9603R1ZM &bull; <strong>State Code:</strong> 29-Karnataka
                </div>
              </div>
              <div className="zb-paper-badge">
                <div className="zb-paper-badge-title">TAX INVOICE</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                  {invoice.id}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Issue Date: {invoice.date}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Due Date: {invoice.due}</div>
              </div>
            </div>

            {/* Customer & Remittance Info Grid */}
            <div className="zb-paper-grid">
              <div className="zb-paper-box">
                <div className="zb-paper-box-title">BILLED TO (CUSTOMER)</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  {invoice.client}
                </div>
                <div><strong>GSTIN:</strong> {invoice.clientGstin || '29AAACI4567B1Z8'}</div>
                <div><strong>Email:</strong> {invoice.clientEmail || 'billing@' + invoice.client.toLowerCase().replace(/[^a-z]/g, '') + '.com'}</div>
                <div><strong>Place of Supply:</strong> 29-Karnataka</div>
              </div>

              <div className="zb-paper-box">
                <div className="zb-paper-box-title">PAYMENT TERMS & STATUS</div>
                <div className="zb-flex-align gap-2" style={{ marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Payment Status:</span>
                  <span className={`zb-status-pill ${invoice.status === 'Paid' ? 'success' : invoice.status === 'Overdue' ? 'danger' : 'warning'}`}>
                    {invoice.status}
                  </span>
                </div>
                <div><strong>Payment Terms:</strong> Net 15 Days</div>
                <div><strong>Bank A/C:</strong> 50200049281928 (HDFC Bank Corporate)</div>
                <div><strong>IFSC Code:</strong> HDFC0000053 | Branch: Richmond Circle</div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="zb-paper-table">
              <thead>
                <tr>
                  <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                  <th>Item Description</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>HSN/SAC</th>
                  <th style={{ width: '50px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Rate</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>GST</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((itm, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <strong>{itm.name}</strong>
                        {itm.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {itm.description}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{itm.hsn || '998313'}</td>
                      <td style={{ textAlign: 'center' }}>{itm.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatINR(itm.rate)}</td>
                      <td style={{ textAlign: 'center' }}>{itm.taxRate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(itm.quantity * itm.rate)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={{ textAlign: 'center' }}>1</td>
                    <td>
                      <strong>Professional Consulting & Enterprise Software Services</strong>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Enterprise cloud architecture, compliance automation, and financial audit setup
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>998313</td>
                    <td style={{ textAlign: 'center' }}>1</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(subtotal)}</td>
                    <td style={{ textAlign: 'center' }}>18%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(subtotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals Summary */}
            <div className="zb-paper-totals-wrap">
              <table className="zb-paper-totals-table">
                <tbody>
                  <tr>
                    <td>Subtotal (Taxable Value):</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(subtotal)}</td>
                  </tr>
                  <tr>
                    <td>Central Tax (CGST 9%):</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(cgst)}</td>
                  </tr>
                  <tr>
                    <td>State Tax (SGST 9%):</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(sgst)}</td>
                  </tr>
                  <tr className="zb-paper-grand-total">
                    <td>Total Invoice Value:</td>
                    <td style={{ textAlign: 'right', color: '#2563eb' }}>{formatINR(invoice.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Amount in words */}
            <div className="zb-paper-words">
              <strong>Amount in Words:</strong> {amountInWords}
            </div>

            {/* Remittance & Bank Box */}
            <div className="zb-paper-box" style={{ marginBottom: '24px', fontSize: '12.5px', color: '#475569' }}>
              <strong>Bank Remittance Instructions:</strong><br />
              Please transfer funds via NEFT/RTGS to Account: <strong>50200049281928</strong> &bull; Bank: <strong>HDFC Bank</strong> &bull; IFSC: <strong>HDFC0000053</strong>.<br />
              Quoting invoice number <strong>{invoice.id}</strong> on transaction narration ensures automated reconciliation.
            </div>

            {/* Footer & Signature Seal */}
            <div className="zb-paper-footer">
              <div>
                <em>Note: This is a system-generated GST Tax Invoice under the Information Technology Act 2000.</em>
              </div>
              <div className="zb-paper-seal">
                <strong>For Zylker Electronics India Pvt Ltd</strong>
                <div style={{ height: '38px' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
