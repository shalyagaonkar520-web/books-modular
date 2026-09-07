import React from 'react';
import { PayrollEmployee, Payslip } from '../../services/apiClient';
import { formatINR, numberToIndianWords } from '../../utils/currency';
import { Printer, Download, ExternalLink, X, ShieldCheck } from 'lucide-react';

interface SalaryPayslipModalProps {
  employee: PayrollEmployee | null;
  onClose: () => void;
  onDownload?: (payslip: Payslip) => void;
}

export const SalaryPayslipModal: React.FC<SalaryPayslipModalProps> = ({
  employee,
  onClose,
}) => {
  if (!employee) return null;

  const month = 'August 2026';
  const gross = employee.gross;
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.25);
  const specialAllowance = Math.round(gross - basic - hra);

  const pf = Math.round(basic * 0.12);
  const pt = 200;
  const tds = gross > 100000 ? Math.round(gross * 0.05) : 0;
  const totalDeductions = pf + pt + tds;
  const net = gross - totalDeductions;
  const netInWords = numberToIndianWords(net);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHTML = () => {
    const filename = `Salary_Payslip_${employee.id}_${month.replace(' ', '_')}.html`;
    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Salary Payslip - ${employee.name} - ${month}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
    .card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
    .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #f1f5f9; padding: 10px; border: 1px solid #cbd5e1; }
    td { padding: 8px 12px; border: 1px solid #cbd5e1; }
    .net-box { background: #ecfdf5; border: 2px solid #10b981; border-radius: 6px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 style="margin:0 0 4px 0; font-size:22px;">Zylker Electronics India Pvt Ltd</h1>
      <div style="font-size:13px; color:#475569;">Tech Park Plaza, Outer Ring Road, Bengaluru, Karnataka 560103</div>
      <div style="font-size:13px; color:#475569;">CIN: U72200KA2015PTC081290 | GSTIN: 29AABCU9603R1ZM</div>
      <h2 style="font-size:16px; color:#2563eb; text-transform:uppercase; margin-top:10px;">Salary Payslip &mdash; ${month}</h2>
    </div>

    <div class="emp-grid">
      <div>
        <div>Employee ID: <strong>${employee.id}</strong></div>
        <div>Employee Name: <strong>${employee.name}</strong></div>
        <div>Designation: <strong>${employee.designation}</strong></div>
        <div>Department: <strong>${employee.department}</strong></div>
      </div>
      <div>
        <div>Bank Account: <strong>${employee.bankAcc || '••••••••1928'}</strong></div>
        <div>PAN Number: <strong>${employee.pan || 'ABCDE1234F'}</strong></div>
        <div>PF UAN: <strong>${employee.uan || '101294819201'}</strong></div>
        <div>Status: <strong style="color:#059669;">${employee.status}</strong></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th colspan="2" style="width:50%; color:#0f766e;">EARNINGS (₹)</th>
          <th colspan="2" style="width:50%; color:#991b1b;">DEDUCTIONS (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Basic Salary</td>
          <td style="text-align:right; font-weight:600;">₹${basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>Employee Provident Fund (EPF 12%)</td>
          <td style="text-align:right; font-weight:600; color:#dc2626;">₹${pf.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>House Rent Allowance (HRA)</td>
          <td style="text-align:right; font-weight:600;">₹${hra.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>Professional Tax (PT)</td>
          <td style="text-align:right; font-weight:600; color:#dc2626;">₹${pt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>Special Allowance</td>
          <td style="text-align:right; font-weight:600;">₹${specialAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>Income Tax (TDS / IT)</td>
          <td style="text-align:right; font-weight:600; color:#dc2626;">₹${tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="background:#f8fafc; font-weight:700;">
          <td>Total Gross Earnings</td>
          <td style="text-align:right; color:#0f766e;">₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>Total Deductions</td>
          <td style="text-align:right; color:#dc2626;">₹${totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>

    <div class="net-box">
      <div>
        <div style="font-weight:700; color:#065f46;">NET SALARY PAYABLE</div>
        <div style="font-size:12px; color:#047857;">Transferred directly via Corporate IMPS/NEFT</div>
      </div>
      <div style="font-size:22px; font-weight:800; color:#047857;">₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    </div>

    <div style="font-size:13px; color:#334155; margin-bottom:20px; font-style:italic; background:#f8fafc; padding:10px;">
      <strong>In Words:</strong> ${netInWords}
    </div>

    <div style="margin-top:30px; font-size:12px; color:#64748b; text-align:center;">
      This is a computer-generated payslip under the Rooman Books Payroll Engine and requires no signature.
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
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
    window.open(`/api/payroll/payslip/${employee.id}/html`, '_blank');
  };

  return (
    <div className="zb-doc-modal-overlay" onClick={onClose}>
      <div className="zb-doc-modal-container" onClick={e => e.stopPropagation()}>
        <div className="zb-doc-modal-header zb-no-print">
          <div className="zb-flex-align gap-2">
            <ShieldCheck size={20} className="text-success" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Salary Payslip &mdash; {employee.name}
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Ref: PS-{employee.id} &bull; Cycle: {month} &bull; Status: {employee.status}
              </span>
            </div>
          </div>

          <div className="zb-doc-modal-actions">
            <button
              className="zb-btn zb-btn-sm zb-btn-secondary"
              onClick={openServerHtml}
              title="Open print view in new tab"
            >
              <ExternalLink size={14} /> Full View
            </button>
            <button
              className="zb-btn zb-btn-sm zb-btn-secondary"
              onClick={handleDownloadHTML}
              title="Download formatted payslip file"
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
            <button className="zb-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="zb-doc-modal-body">
          <div className="zb-paper-sheet">
            <div style={{ textAlign: 'center', borderBottom: '2px solid #2563eb', paddingBottom: '16px', marginBottom: '20px' }}>
              <h1 className="zb-paper-title">Zylker Electronics India Pvt Ltd</h1>
              <div style={{ fontSize: '13px', color: '#475569' }}>Tech Park Plaza, Outer Ring Road, Bengaluru, Karnataka 560103</div>
              <div style={{ fontSize: '13px', color: '#475569' }}>
                <strong>CIN:</strong> U72200KA2015PTC081290 &bull; <strong>GSTIN:</strong> 29AABCU9603R1ZM
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '10px' }}>
                Salary Payslip &mdash; {month}
              </div>
            </div>

            <div className="zb-paper-grid" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                <div><span style={{ color: '#64748b' }}>Employee ID:</span> <strong>{employee.id}</strong></div>
                <div><span style={{ color: '#64748b' }}>Employee Name:</span> <strong>{employee.name}</strong></div>
                <div><span style={{ color: '#64748b' }}>Designation:</span> <strong>{employee.designation}</strong></div>
                <div><span style={{ color: '#64748b' }}>Department:</span> <strong>{employee.department}</strong></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                <div><span style={{ color: '#64748b' }}>Bank Account:</span> <strong>{employee.bankAcc || '••••••••1928'}</strong></div>
                <div><span style={{ color: '#64748b' }}>PAN Number:</span> <strong>{employee.pan || 'ABCDE1234F'}</strong></div>
                <div><span style={{ color: '#64748b' }}>PF UAN:</span> <strong>{employee.uan || '101294819201'}</strong></div>
                <div><span style={{ color: '#64748b' }}>Pay Status:</span> <strong className="text-success">{employee.status}</strong></div>
              </div>
            </div>

            <table className="zb-paper-table" style={{ border: '1px solid #cbd5e1' }}>
              <thead>
                <tr>
                  <th colSpan={2} style={{ width: '50%', color: '#0f766e', borderRight: '1px solid #cbd5e1' }}>EARNINGS</th>
                  <th colSpan={2} style={{ width: '50%', color: '#991b1b' }}>STATUTORY DEDUCTIONS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Basic Salary (50%)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{formatINR(basic)}</td>
                  <td>Employee Provident Fund (EPF 12%)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{formatINR(pf)}</td>
                </tr>
                <tr>
                  <td>House Rent Allowance (HRA 25%)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{formatINR(hra)}</td>
                  <td>Professional Tax (PT)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{formatINR(pt)}</td>
                </tr>
                <tr>
                  <td>Special & Conveyance Allowance</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>{formatINR(specialAllowance)}</td>
                  <td>Income Tax (TDS / IT)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{formatINR(tds)}</td>
                </tr>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td>Total Gross Salary</td>
                  <td style={{ textAlign: 'right', color: '#0f766e', borderRight: '1px solid #cbd5e1' }}>{formatINR(gross)}</td>
                  <td>Total Statutory Deductions</td>
                  <td style={{ textAlign: 'right', color: '#dc2626' }}>{formatINR(totalDeductions)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ background: '#ecfdf5', border: '2px solid #10b981', borderRadius: '8px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>NET PAYABLE SALARY</div>
                <div style={{ fontSize: '12px', color: '#047857' }}>Direct credit via Corporate Banking IMPS / NEFT</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#047857' }}>
                {formatINR(net)}
              </div>
            </div>

            <div className="zb-paper-words">
              <strong>Net Pay in Words:</strong> {netInWords}
            </div>

            <div className="zb-paper-footer">
              <div>
                <em>Note: This is a system-generated salary payslip under the Rooman Books Payroll Engine.</em>
              </div>
              <div className="zb-paper-seal">
                <strong>Zylker Electronics India Pvt Ltd</strong>
                <div style={{ height: '36px' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Authorized HR Signatory</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
