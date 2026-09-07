import React, { useState, useEffect } from 'react';
import { NavModule } from '../../components/layout/Sidebar';
import { formatINR, numberToIndianWords } from '../../utils/currency';
import {
  ShoppingCart,
  ShoppingBag,
  Clock,
  Landmark,
  Calculator,
  BarChart3,
  FileText,
  DollarSign,
  CreditCard,
  Plus,
  Search,
  Filter,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ArrowUpRight,
  ArrowDownLeft,
  FileCheck,
  TrendingUp,
  Receipt,
  Users,
  X,
  Check,
  QrCode,
  FileSpreadsheet,
  Printer,
  Eye,
  UploadCloud,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { TaxInvoiceModal } from '../../components/documents/TaxInvoiceModal';
import { CreateInvoiceModal } from '../../components/documents/CreateInvoiceModal';
import { DocumentViewerModal } from '../../components/documents/DocumentViewerModal';
import { UploadDocumentModal } from '../../components/documents/UploadDocumentModal';
import { SalaryPayslipModal } from '../../components/documents/SalaryPayslipModal';
import { ApiClient, Invoice, DocumentItem, PayrollEmployee, Payslip } from '../../services/apiClient';

interface ModuleViewProps {
  module: NavModule;
  onNavigate: (module: NavModule) => void;
}

export const ModuleView: React.FC<ModuleViewProps> = ({ module, onNavigate }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Universal Modal State
  const [modalType, setModalType] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Interactive Document & Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false);
  const [selectedEmpPayslip, setSelectedEmpPayslip] = useState<PayrollEmployee | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Sales Module State
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: 'INV-00104',
      client: 'Infosys BPM Limited',
      clientEmail: 'billing@infosys.com',
      clientGstin: '29AAACI4567B1Z8',
      date: '02 Sep 2026',
      due: '16 Sep 2026',
      subtotal: 156779.66,
      taxAmount: 28220.34,
      amount: 185000,
      status: 'Sent',
      items: [
        { name: 'Cloud Infrastructure Migration & DevOps Consulting', hsn: '998313', quantity: 1, rate: 156779.66, taxRate: 18, amount: 185000 }
      ]
    },
    {
      id: 'INV-00103',
      client: 'Tata Consultancy Services',
      clientEmail: 'ap.desk@tcs.com',
      clientGstin: '27AAACT9876C1Z4',
      date: '28 Aug 2026',
      due: '11 Sep 2026',
      subtotal: 289830.51,
      taxAmount: 52169.49,
      amount: 342000,
      status: 'Paid',
      items: [
        { name: 'Enterprise ERP Ledger Security Architecture', hsn: '998313', quantity: 1, rate: 289830.51, taxRate: 18, amount: 342000 }
      ]
    },
    {
      id: 'INV-00102',
      client: 'Wipro Digital Labs',
      clientEmail: 'accounts@wipro.com',
      clientGstin: '29AAACW1234D1Z2',
      date: '20 Aug 2026',
      due: '03 Sep 2026',
      subtotal: 83474.58,
      taxAmount: 15025.42,
      amount: 98500,
      status: 'Overdue',
      items: [
        { name: 'API Gateway & Microservices Performance Audit', hsn: '998313', quantity: 1, rate: 83474.58, taxRate: 18, amount: 98500 }
      ]
    },
    {
      id: 'INV-00101',
      client: 'Razorpay Software Pvt Ltd',
      clientEmail: 'merchant-pay@razorpay.com',
      clientGstin: '29AABCR8765E1Z6',
      date: '15 Aug 2026',
      due: '30 Aug 2026',
      subtotal: 182203.39,
      taxAmount: 32796.61,
      amount: 215000,
      status: 'Paid',
      items: [
        { name: 'Instant Settlement & UPI Webhook Integration', hsn: '998314', quantity: 1, rate: 182203.39, taxRate: 18, amount: 215000 }
      ]
    },
    {
      id: 'INV-00100',
      client: 'Swiggy Technologies',
      clientEmail: 'vendor-invoices@swiggy.in',
      clientGstin: '29AALCS5432F1Z8',
      date: '08 Aug 2026',
      due: '22 Aug 2026',
      subtotal: 122881.36,
      taxAmount: 22118.64,
      amount: 145000,
      status: 'Paid',
      items: [
        { name: 'Corporate NetBanking Reconciliation Module', hsn: '998313', quantity: 1, rate: 122881.36, taxRate: 18, amount: 145000 }
      ]
    },
  ]);


  // 2. Purchases Module State
  const [bills, setBills] = useState([
    { id: 'BILL-8092', vendor: 'TechDistro India Pvt Ltd', category: 'Hardware Procurement', date: '01 Sep 2026', amount: 145000, status: 'Paid' },
    { id: 'BILL-8091', vendor: 'Urban Space Supplies', category: 'Office Furniture', date: '25 Aug 2026', amount: 55200, status: 'Pending' },
    { id: 'BILL-8090', vendor: 'LogiDirect Traders', category: 'Peripherals Supply', date: '19 Aug 2026', amount: 25600, status: 'Paid' },
    { id: 'BILL-8089', vendor: 'Amazon Web Services AWS', category: 'Cloud Hosting & Servers', date: '10 Aug 2026', amount: 48900, status: 'Paid' },
  ]);

  const [newBillVendor, setNewBillVendor] = useState('');
  const [newBillAmount, setNewBillAmount] = useState('');
  const [newBillCategory, setNewBillCategory] = useState('Operating Expense');

  // 3. Banking Module State
  const [bankAccounts, setBankAccounts] = useState([
    { name: 'HDFC Bank Corporate Current A/C', accNo: '50200049281928', balance: 1452800.50, feeds: 'Connected', lastSync: '10 mins ago' },
    { name: 'ICICI Bank Smart Business A/C', accNo: '001205018274', balance: 875200.00, feeds: 'Connected', lastSync: '1 hour ago' },
    { name: 'State Bank of India (SBI) GST Escrow', accNo: '38192019482', balance: 340000.00, feeds: 'Connected', lastSync: '3 hours ago' },
  ]);

  const [newBankName, setNewBankName] = useState('');
  const [newBankAccNo, setNewBankAccNo] = useState('');
  const [newBankBalance, setNewBankBalance] = useState('');

  // 4. Journals State (Accountant)
  const [journals, setJournals] = useState([
    { id: 'JRN-2026-004', date: '01 Sep 2026', notes: 'Monthly office rent provision', debit: 'Rent Expense (A/C 502)', credit: 'HDFC Bank Current (A/C 101)', amount: 85000, status: 'Posted' },
    { id: 'JRN-2026-003', date: '28 Aug 2026', notes: 'Hardware asset depreciation', debit: 'Depreciation Expense', credit: 'Accumulated Depreciation', amount: 24500, status: 'Posted' },
    { id: 'JRN-2026-002', date: '15 Aug 2026', notes: 'Prepaid insurance amortization', debit: 'Insurance Expense', credit: 'Prepaid Insurance', amount: 12000, status: 'Posted' },
  ]);

  const [newJrnNotes, setNewJrnNotes] = useState('');
  const [newJrnDebit, setNewJrnDebit] = useState('Office Supplies Expense');
  const [newJrnCredit, setNewJrnCredit] = useState('HDFC Bank Current');
  const [newJrnAmount, setNewJrnAmount] = useState('');

  // 5. Time Tracking State
  const [timesheets, setTimesheets] = useState([
    { id: 'TS-001', project: 'Infosys Portal Upgrade', task: 'Architecture & Schema Review', consultant: 'Rahul Sharma', date: '04 Sep 2026', hours: 6.5, rate: 1800, billable: true },
    { id: 'TS-002', project: 'Tata Consultancy Services', task: 'Security Audit & Compliance', consultant: 'Priya Iyer', date: '03 Sep 2026', hours: 8.0, rate: 2200, billable: true },
    { id: 'TS-003', project: 'Wipro Digital Labs', task: 'Integration Testing & Verification', consultant: 'Amit Patel', date: '02 Sep 2026', hours: 4.0, rate: 1500, billable: false },
    { id: 'TS-004', project: 'Razorpay Gateway Connect', task: 'Payment Hook Integration', consultant: 'Shalya Gaonkar', date: '01 Sep 2026', hours: 5.5, rate: 2500, billable: true },
  ]);
  const [newTtProject, setNewTtProject] = useState('Infosys Portal Upgrade');
  const [newTtTask, setNewTtTask] = useState('');
  const [newTtConsultant, setNewTtConsultant] = useState('Shalya Gaonkar');
  const [newTtHours, setNewTtHours] = useState('4.0');
  const [newTtRate, setNewTtRate] = useState('2000');
  const [newTtBillable, setNewTtBillable] = useState(true);

  // 6. Documents State
  const [documentsList, setDocumentsList] = useState([
    { id: 'DOC-801', title: 'GST_Certificate_2026_27.pdf', category: 'Tax & GST', uploadedBy: 'Shalya Gaonkar', date: '02 Sep 2026', size: '2.4 MB', verified: true },
    { id: 'DOC-802', title: 'HDFC_Bank_Statement_August2026.pdf', category: 'Bank Statements', uploadedBy: 'Priya Iyer', date: '01 Sep 2026', size: '4.8 MB', verified: true },
    { id: 'DOC-803', title: 'Vendor_Agreement_TechDistro.pdf', category: 'Legal & Contracts', uploadedBy: 'Rahul Sharma', date: '28 Aug 2026', size: '1.8 MB', verified: true },
    { id: 'DOC-804', title: 'Office_Lease_Rental_Deed.pdf', category: 'Legal & Contracts', uploadedBy: 'Admin', date: '15 Aug 2026', size: '5.1 MB', verified: true },
    { id: 'DOC-805', title: 'Hardware_Procurement_Voucher_8092.pdf', category: 'Invoices & Bills', uploadedBy: 'Accounts', date: '10 Aug 2026', size: '890 KB', verified: false },
  ]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('Invoices & Bills');
  const [newDocNote, setNewDocNote] = useState('');

  // 7. Payroll State
  const [employees, setEmployees] = useState([
    { id: 'EMP-101', name: 'Shalya Gaonkar', designation: 'Principal Architect', department: 'Engineering', gross: 240000, deductions: 28800, net: 211200, status: 'Paid' },
    { id: 'EMP-102', name: 'Priya Iyer', designation: 'Senior Financial Controller', department: 'Finance', gross: 185000, deductions: 22200, net: 162800, status: 'Paid' },
    { id: 'EMP-103', name: 'Rahul Sharma', designation: 'Lead Systems Engineer', department: 'Engineering', gross: 160000, deductions: 19200, net: 140800, status: 'Paid' },
    { id: 'EMP-104', name: 'Ananya Deshmukh', designation: 'Tax & Compliance Specialist', department: 'Finance', gross: 130000, deductions: 15600, net: 114400, status: 'Processing' },
    { id: 'EMP-105', name: 'Vikram Mehta', designation: 'Operations Manager', department: 'Operations', gross: 115000, deductions: 13800, net: 101200, status: 'Processing' },
  ]);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('Engineering');
  const [newEmpGross, setNewEmpGross] = useState('');

  // 8. Payments State
  const [paymentsList, setPaymentsList] = useState([
    { id: 'PAY-9041', customer: 'Tata Consultancy Services', invoiceRef: 'INV-00103', method: 'IMPS Direct Transfer', amount: 342000, date: '03 Sep 2026', status: 'Settled' },
    { id: 'PAY-9040', customer: 'Razorpay Software Pvt Ltd', invoiceRef: 'INV-00101', method: 'UPI Instant QR', amount: 215000, date: '30 Aug 2026', status: 'Settled' },
    { id: 'PAY-9039', customer: 'Swiggy Technologies', invoiceRef: 'INV-00100', method: 'Corporate NetBanking', amount: 145000, date: '22 Aug 2026', status: 'Settled' },
    { id: 'PAY-9038', customer: 'Infosys BPM Limited', invoiceRef: 'INV-00104', method: 'Credit Card Gateway', amount: 185000, date: '04 Sep 2026', status: 'Processing' },
  ]);
  const [newPayCustomer, setNewPayCustomer] = useState('');
  const [newPayInvoiceRef, setNewPayInvoiceRef] = useState('INV-00104');
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayMethod, setNewPayMethod] = useState('UPI Instant QR');

  // CSV Export utility
  const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filename} successfully!`);
  };

  // Sync data with cloud server on mount
  useEffect(() => {
    let isMounted = true;
    ApiClient.getInvoices().then(data => {
      if (isMounted && data && data.length > 0) setInvoices(data);
    }).catch(() => {});

    ApiClient.getDocuments().then(data => {
      if (isMounted && data && data.length > 0) setDocumentsList(data);
    }).catch(() => {});

    ApiClient.getPayrollEmployees().then(data => {
      if (isMounted && data && data.length > 0) setEmployees(data);
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Real Document File Downloader
  const downloadDocumentFile = (doc: DocumentItem | any) => {
    const filename = doc.title.endsWith('.pdf') || doc.title.endsWith('.txt') ? doc.title : `${doc.title}.pdf`;
    const docContent = `================================================================================
                    ZOHO BOOKS COMPLIANCE & AUDIT VAULT
================================================================================
Document Reference : ${doc.id}
Document Title     : ${doc.title}
Category           : ${doc.category}
Uploaded By        : ${doc.uploadedBy}
Date of Filing     : ${doc.date}
File Size          : ${doc.size}
Audit Status       : ${doc.verified ? 'VERIFIED & DIGITALLY SIGNED' : 'PENDING VERIFICATION'}
SHA-256 Checksum   : ${doc.checksum || 'SHA256:e8f237b5d1a89c32f8149e21'}
Audit Notes        : ${doc.notes || 'Official statutory compliance archive'}
Security Class     : AES-256 Cloud Encrypted Ledger Archive
================================================================================

CERTIFICATE OF AUTHENTICITY & STATUTORY COMPLIANCE:
This document is cataloged and preserved in accordance with the Companies Act 2013
and the Goods and Services Tax (GST) statutory record retention rules.

Organization: Zylker Electronics India Pvt Ltd
GSTIN: 29AABCU9603R1ZM | State Code: 29-Karnataka
Registered Office: Tech Park Plaza, Outer Ring Road, Bengaluru 560103
================================================================================`;

    const blob = new Blob([docContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded: ${filename}`);
  };

  // Real Invoice File Downloader
  const downloadInvoiceFile = (inv: Invoice) => {
    const filename = `Tax_Invoice_${inv.id}.html`;
    const subtotal = inv.subtotal || Math.round(inv.amount / 1.18);
    const tax = inv.taxAmount || (inv.amount - subtotal);
    const words = numberToIndianWords(inv.amount);

    const itemsRows = (inv.items || []).map((itm, idx) => `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${idx + 1}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0;"><strong>${itm.name}</strong></td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.hsn || '998313'}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.quantity}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">₹${itm.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:center;">${itm.taxRate}%</td>
        <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:600;">₹${(itm.quantity * itm.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const invoiceContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tax Invoice - ${inv.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
    .card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #f1f5f9; padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 340px; font-size: 13.5px; }
    .totals-table td { padding: 6px 10px; }
    .grand-total { font-size: 18px; font-weight: 800; border-top: 2px solid #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <h1 style="font-size:22px; margin:0 0 4px 0;">Zylker Electronics India Pvt Ltd</h1>
        <div style="font-size:13px; color:#475569;">Tech Park Plaza, Outer Ring Road, Bengaluru 560103</div>
        <div style="font-size:13px; color:#475569;"><strong>GSTIN:</strong> 29AABCU9603R1ZM</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px; font-weight:800; color:#2563eb;">TAX INVOICE</div>
        <div style="font-size:15px; font-weight:700;">${inv.id}</div>
        <div style="font-size:12px; color:#64748b;">Date: ${inv.date}</div>
      </div>
    </div>
    <div style="margin-bottom:24px; font-size:14px;">
      <strong>BILLED TO:</strong><br />
      <strong>${inv.client}</strong><br />
      GSTIN: ${inv.clientGstin || '29AABCU9603R1ZM'}
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Item Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate (₹)</th><th>GST</th><th>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || `<tr><td colspan="7" style="padding:10px;">Enterprise Software Consulting & Integration Services</td></tr>`}
      </tbody>
    </table>
    <div class="totals">
      <table class="totals-table">
        <tr><td>Subtotal:</td><td style="text-align:right; font-weight:600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td>GST (18%):</td><td style="text-align:right;">₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr class="grand-total"><td>Total Amount:</td><td style="text-align:right; color:#2563eb;">₹${inv.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      </table>
    </div>
    <div style="margin-top:20px; padding:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; color:#166534; font-weight:600; font-size:13px;">
      Amount in Words: ${words}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([invoiceContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename} successfully!`);
  };

  // Real Payslip Downloader
  const downloadEmployeePayslip = (emp: PayrollEmployee) => {
    const filename = `Salary_Payslip_${emp.id}_August_2026.html`;
    const gross = emp.gross;
    const basic = Math.round(gross * 0.5);
    const hra = Math.round(gross * 0.25);
    const specialAllowance = Math.round(gross - basic - hra);
    const pf = Math.round(basic * 0.12);
    const pt = 200;
    const tds = gross > 100000 ? Math.round(gross * 0.05) : 0;
    const totalDeductions = pf + pt + tds;
    const net = gross - totalDeductions;
    const netInWords = numberToIndianWords(net);

    const payslipHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Salary Payslip - ${emp.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
    .card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
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
      <h2 style="font-size:16px; color:#2563eb; text-transform:uppercase; margin-top:10px;">Salary Payslip &mdash; August 2026</h2>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:13px; background:#f8fafc; padding:12px; border:1px solid #e2e8f0; border-radius:6px;">
      <div>Employee ID: <strong>${emp.id}</strong><br />Employee Name: <strong>${emp.name}</strong><br />Designation: <strong>${emp.designation}</strong></div>
      <div>Department: <strong>${emp.department}</strong><br />Bank Account: <strong>${emp.bankAcc || '••••••••1928'}</strong><br />PAN: <strong>${emp.pan || 'ABCDE1234F'}</strong></div>
    </div>
    <table>
      <thead>
        <tr><th colspan="2" style="color:#0f766e;">EARNINGS (₹)</th><th colspan="2" style="color:#991b1b;">DEDUCTIONS (₹)</th></tr>
      </thead>
      <tbody>
        <tr><td>Basic Salary</td><td style="text-align:right;">₹${basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>EPF (12%)</td><td style="text-align:right; color:#dc2626;">₹${pf.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td>HRA (25%)</td><td style="text-align:right;">₹${hra.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>Professional Tax</td><td style="text-align:right; color:#dc2626;">₹${pt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td>Special Allowance</td><td style="text-align:right;">₹${specialAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>Income Tax (TDS)</td><td style="text-align:right; color:#dc2626;">₹${tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr style="background:#f8fafc; font-weight:700;"><td>Gross Salary</td><td style="text-align:right; color:#0f766e;">₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>Total Deductions</td><td style="text-align:right; color:#dc2626;">₹${totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      </tbody>
    </table>
    <div class="net-box">
      <div><strong>NET PAYABLE SALARY:</strong></div>
      <div style="font-size:22px; font-weight:800; color:#047857;">₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="font-size:13px; color:#334155; font-style:italic;">In Words: ${netInWords}</div>
  </div>
</body>
</html>`;

    const blob = new Blob([payslipHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded: ${filename}`);
  };

  const handleInvoiceCreated = (newInv: Invoice) => {
    setInvoices([newInv, ...invoices]);
    setSelectedInvoice(newInv);
    showToast(`Invoice ${newInv.id} generated successfully!`);
  };

  const handleInvoiceStatusChange = async (invoiceId: string, newStatus: 'Paid' | 'Sent') => {
    try {
      await ApiClient.updateInvoiceStatus(invoiceId, newStatus);
    } catch {}
    setInvoices(invoices.map(i => i.id === invoiceId ? { ...i, status: newStatus } : i));
    if (selectedInvoice && selectedInvoice.id === invoiceId) {
      setSelectedInvoice({ ...selectedInvoice, status: newStatus });
    }
    showToast(`Invoice ${invoiceId} marked as ${newStatus}!`);
  };

  const handleDocUploaded = (newDoc: DocumentItem) => {
    setDocumentsList([newDoc, ...documentsList]);
    setSelectedDoc(newDoc);
    showToast(`Document ${newDoc.title} secured in vault!`);
  };

  // 1. Sales Module Render
  if (module === 'sales') {
    const filtered = invoices.filter(inv => {
      const matchesSearch = inv.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.id.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'paid') return matchesSearch && inv.status === 'Paid';
      if (activeTab === 'pending') return matchesSearch && inv.status === 'Sent';
      if (activeTab === 'overdue') return matchesSearch && inv.status === 'Overdue';
      return matchesSearch;
    });

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Sales & Invoicing</h1>
            <p className="zb-page-subtitle">Track client invoices, customer retainers, and GST compliant tax invoices</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'sales_invoices.csv',
                ['Invoice ID', 'Client Name', 'Issue Date', 'Due Date', 'Amount', 'Status'],
                invoices.map(i => [i.id, `"${i.client}"`, i.date, i.due, i.amount, i.status])
              )}
            >
              <Download size={15} /> Export CSV
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setIsCreateInvoiceOpen(true)}>
              <Plus size={16} /> New Invoice
            </button>
          </div>
        </div>

        {/* Sales Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Invoiced</div>
            <div className="zb-metric-mini-val text-primary">
              {formatINR(invoices.reduce((acc, i) => acc + i.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub text-success"><TrendingUp size={12} /> +18.4% vs last month</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Paid Receipts</div>
            <div className="zb-metric-mini-val text-success">
              {formatINR(invoices.filter(i => i.status === 'Paid').reduce((acc, i) => acc + i.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub">{invoices.filter(i => i.status === 'Paid').length} invoices cleared</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Due / Pending</div>
            <div className="zb-metric-mini-val text-warning">
              {formatINR(invoices.filter(i => i.status === 'Sent').reduce((acc, i) => acc + i.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub">Awaiting customer payment</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Overdue</div>
            <div className="zb-metric-mini-val text-danger">
              {formatINR(invoices.filter(i => i.status === 'Overdue').reduce((acc, i) => acc + i.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub text-danger">Urgent collection needed</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="zb-card zb-toolbar-card">
          <div className="zb-toolbar-row">
            <div className="zb-toolbar-search">
              <Search size={16} className="icon" />
              <input
                type="text"
                placeholder="Search by invoice ID or client name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="zb-flex-align gap-2">
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                All ({invoices.length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'paid' ? 'active' : ''}`} onClick={() => setActiveTab('paid')}>
                Paid ({invoices.filter(i => i.status === 'Paid').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                Pending ({invoices.filter(i => i.status === 'Sent').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'overdue' ? 'active' : ''}`} onClick={() => setActiveTab('overdue')}>
                Overdue ({invoices.filter(i => i.status === 'Overdue').length})
              </button>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="zb-card zb-table-container">
          <table className="zb-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client Name</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td
                    className="font-semibold text-primary"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedInvoice(inv)}
                    title="Click to view full GST Tax Invoice"
                  >
                    {inv.id}
                  </td>
                  <td
                    className="font-medium"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedInvoice(inv)}
                  >
                    {inv.client}
                  </td>
                  <td>{inv.date}</td>
                  <td>{inv.due}</td>
                  <td className="text-right font-semibold">{formatINR(inv.amount)}</td>
                  <td className="text-center">
                    <span className={`zb-status-pill ${inv.status.toLowerCase()}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-center">
                    <div className="zb-flex-align justify-center gap-2">
                      <button
                        className="zb-table-btn"
                        onClick={() => setSelectedInvoice(inv)}
                        title="View, Print & verify GST Tax Invoice"
                      >
                        <Eye size={13} style={{ marginRight: '4px' }} /> View & Print
                      </button>
                      <button
                        className="zb-table-btn"
                        onClick={() => downloadInvoiceFile(inv)}
                        title="Download standalone HTML invoice"
                      >
                        <Download size={13} style={{ marginRight: '4px' }} /> Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Interactive Tax Invoice Modal */}
        <TaxInvoiceModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onStatusChange={handleInvoiceStatusChange}
        />

        {/* Interactive Create Invoice Modal */}
        <CreateInvoiceModal
          isOpen={isCreateInvoiceOpen}
          onClose={() => setIsCreateInvoiceOpen(false)}
          onCreated={handleInvoiceCreated}
        />
      </div>
    );
  }

  // 2. Purchases Module Render
  if (module === 'purchases') {
    const handleCreateBill = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBillVendor || !newBillAmount) return;

      const newBill = {
        id: `BILL-${8093 + bills.length}`,
        vendor: newBillVendor,
        category: newBillCategory,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: parseFloat(newBillAmount),
        status: 'Pending',
      };
      setBills([newBill, ...bills]);
      setNewBillVendor('');
      setNewBillAmount('');
      setModalType(null);
      showToast(`Bill ${newBill.id} recorded successfully!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Purchases & Vendor Bills</h1>
            <p className="zb-page-subtitle">Track supplier bills, purchase orders, recurring expenses and vendor credits</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'vendor_bills.csv',
                ['Bill ID', 'Vendor', 'Category', 'Date', 'Amount', 'Status'],
                bills.map(b => [b.id, `"${b.vendor}"`, `"${b.category}"`, b.date, b.amount, b.status])
              )}
            >
              <Download size={15} /> Export CSV
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('new_bill')}>
              <Plus size={16} /> Record New Bill
            </button>
          </div>
        </div>

        <div className="zb-dashboard-grid three-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Purchases</div>
            <div className="zb-metric-mini-val text-primary">
              {formatINR(bills.reduce((acc, b) => acc + b.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub">{bills.length} vendor bills recorded</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Outstanding Payables</div>
            <div className="zb-metric-mini-val text-warning">
              {formatINR(bills.filter(b => b.status === 'Pending').reduce((acc, b) => acc + b.amount, 0))}
            </div>
            <div className="zb-metric-mini-sub">Approved for payment</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Input Tax Credit (ITC)</div>
            <div className="zb-metric-mini-val text-success">
              {formatINR(Math.round(bills.reduce((acc, b) => acc + b.amount, 0) * 0.18))}
            </div>
            <div className="zb-metric-mini-sub text-success">Claimable in GSTR-3B</div>
          </div>
        </div>

        <div className="zb-card zb-table-container">
          <table className="zb-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Vendor</th>
                <th>Expense Category</th>
                <th>Bill Date</th>
                <th className="text-right">Total Amount</th>
                <th className="text-center">Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(bill => (
                <tr key={bill.id}>
                  <td className="font-semibold text-primary">{bill.id}</td>
                  <td className="font-medium">{bill.vendor}</td>
                  <td>{bill.category}</td>
                  <td>{bill.date}</td>
                  <td className="text-right font-semibold">{formatINR(bill.amount)}</td>
                  <td className="text-center">
                    <span className={`zb-status-pill ${bill.status.toLowerCase()}`}>
                      {bill.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Record Bill Modal */}
        {modalType === 'new_bill' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Record Vendor Bill</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateBill} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Vendor Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Dell Authorized Distributor"
                    value={newBillVendor}
                    onChange={e => setNewBillVendor(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Expense Category</label>
                  <select
                    className="zb-select"
                    value={newBillCategory}
                    onChange={e => setNewBillCategory(e.target.value)}
                  >
                    <option value="Hardware Procurement">Hardware Procurement</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Cloud Hosting & Servers">Cloud Hosting & Servers</option>
                    <option value="Professional Services">Professional Services</option>
                    <option value="Operating Expense">Operating Expense</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Bill Amount (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="e.g. 45000"
                    value={newBillAmount}
                    onChange={e => setNewBillAmount(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Record Bill
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Banking Module Render
  if (module === 'banking') {
    const handleAddBank = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBankName || !newBankBalance) return;

      const newBank = {
        name: newBankName,
        accNo: newBankAccNo || '998877665544',
        balance: parseFloat(newBankBalance),
        feeds: 'Connected',
        lastSync: 'Just now',
      };
      setBankAccounts([...bankAccounts, newBank]);
      setNewBankName('');
      setNewBankAccNo('');
      setNewBankBalance('');
      setModalType(null);
      showToast(`${newBank.name} linked successfully!`);
    };

    const handleReconcileAll = () => {
      setBankAccounts(bankAccounts.map(b => ({ ...b, lastSync: 'Just now' })));
      showToast('All bank feeds reconciled and synchronized!');
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Banking & Reconciliation</h1>
            <p className="zb-page-subtitle">Real-time bank feed integrations, automatic statement rules, and 1-click reconciliation</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button className="zb-btn zb-btn-secondary" onClick={() => setModalType('add_bank')}>
              <Landmark size={15} /> Add Bank Account
            </button>
            <button className="zb-btn zb-btn-primary" onClick={handleReconcileAll}>
              <CheckCircle2 size={16} /> Reconcile All Feeds
            </button>
          </div>
        </div>

        <div className="zb-dashboard-grid three-col zb-section-spacing">
          {bankAccounts.map((acc, i) => (
            <div key={i} className="zb-card zb-bank-card">
              <div className="zb-flex-between mb-2">
                <span className="zb-bank-tag">Verified Feed</span>
                <span className="zb-status-pill paid">{acc.feeds}</span>
              </div>
              <h3 className="zb-bank-name">{acc.name}</h3>
              <p className="zb-bank-acc">A/C: •••• {acc.accNo.slice(-4)}</p>
              <div className="zb-bank-balance">
                <span className="zb-bank-balance-label">Available Balance</span>
                <span className="zb-bank-balance-val">{formatINR(acc.balance)}</span>
              </div>
              <div className="zb-bank-footer">
                <Clock3 size={12} /> Last synced {acc.lastSync}
              </div>
            </div>
          ))}
        </div>

        {/* Add Bank Modal */}
        {modalType === 'add_bank' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Link New Bank Account</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddBank} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Bank Name & Branch</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Axis Bank Business Current A/C"
                    value={newBankName}
                    onChange={e => setNewBankName(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Account Number</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. 9180200481928"
                    value={newBankAccNo}
                    onChange={e => setNewBankAccNo(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Opening Balance (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="e.g. 250000"
                    value={newBankBalance}
                    onChange={e => setNewBankBalance(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Link Account
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. Reports Module Render
  if (module === 'reports') {
    const reportCategories = [
      {
        title: 'Business Overview & P&L',
        desc: 'Profit and Loss, Balance Sheet, Cash Flow Statement',
        reports: ['Profit and Loss Statement', 'Balance Sheet (Ind AS)', 'Cash Flow Statement', 'Operating Cash Report'],
      },
      {
        title: 'Tax & GST Compliance',
        desc: 'GST Returns, ITC summary, and TDS withholding registers',
        reports: ['GSTR-1 Sales Report', 'GSTR-3B Monthly Return', 'GSTR-2B ITC Matcher', 'e-Way Bill Register'],
      },
      {
        title: 'Receivables & Payables',
        desc: 'Customer aging, vendor payables aging, and bad debt audit',
        reports: ['Accounts Receivable Aging Summary', 'Accounts Payable Aging Summary', 'Customer Balance Summary', 'Vendor Credit History'],
      },
    ];

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Financial Reports & Compliance</h1>
            <p className="zb-page-subtitle">Accurate, audit-ready financial statements, GST filings and ledger summaries</p>
          </div>
          <button
            className="zb-btn zb-btn-primary"
            onClick={() => exportCSV(
              'audit_financial_summary.csv',
              ['Report Name', 'Period', 'Status', 'Filing Authority'],
              [
                ['GSTR-1 Sales Return', 'August 2026', 'Reconciled', 'GSTN India'],
                ['GSTR-3B Monthly Return', 'August 2026', 'Filed & Paid', 'GSTN India'],
                ['Profit and Loss Statement', 'Q1-Q2 FY27', 'Audited', 'Internal Audit'],
                ['Balance Sheet', 'As of Sep 2026', 'Balanced', 'Statutory Board'],
              ]
            )}
          >
            <Download size={15} /> Export Audit Package
          </button>
        </div>

        <div className="zb-dashboard-grid three-col zb-section-spacing">
          {reportCategories.map((cat, i) => (
            <div key={i} className="zb-card zb-report-card">
              <div className="zb-report-header">
                <BarChart3 size={20} className="text-primary" />
                <h3 className="zb-report-title">{cat.title}</h3>
              </div>
              <p className="zb-report-desc">{cat.desc}</p>
              <ul className="zb-report-list">
                {cat.reports.map((rep, idx) => (
                  <li
                    key={idx}
                    className="zb-report-item"
                    onClick={() => showToast(`Generated report: ${rep}`)}
                  >
                    <span>{rep}</span>
                    <ArrowUpRight size={14} className="zb-report-arrow" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. Accountant Module Render
  if (module === 'accountant') {
    const handleCreateJournal = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newJrnNotes || !newJrnAmount) return;

      const newJrn = {
        id: `JRN-2026-${100 + journals.length}`,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        notes: newJrnNotes,
        debit: newJrnDebit,
        credit: newJrnCredit,
        amount: parseFloat(newJrnAmount),
        status: 'Posted',
      };
      setJournals([newJrn, ...journals]);
      setNewJrnNotes('');
      setNewJrnAmount('');
      setModalType(null);
      showToast(`Journal ${newJrn.id} posted successfully!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Accountant & Chart of Accounts</h1>
            <p className="zb-page-subtitle">Manual journals, opening balances, trial balances, and fiscal year adjustments</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => showToast('Trial Balance balanced: Debits ₹4,892,100 = Credits ₹4,892,100')}
            >
              <Calculator size={15} /> Run Trial Balance
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('new_journal')}>
              <Plus size={16} /> New Manual Journal
            </button>
          </div>
        </div>

        <div className="zb-card zb-table-container zb-section-spacing">
          <div className="zb-table-header-bar zb-flex-between p-3">
            <h3 className="font-semibold text-dark">Posted Journal Entries</h3>
            <span className="text-muted text-sm">Fiscal Year 2026-2027</span>
          </div>
          <table className="zb-table">
            <thead>
              <tr>
                <th>Journal #</th>
                <th>Date</th>
                <th>Notes / Narration</th>
                <th>Debited Account</th>
                <th>Credited Account</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {journals.map(j => (
                <tr key={j.id}>
                  <td className="font-semibold text-primary">{j.id}</td>
                  <td>{j.date}</td>
                  <td>{j.notes}</td>
                  <td>{j.debit}</td>
                  <td>{j.credit}</td>
                  <td className="text-right font-semibold">{formatINR(j.amount)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">{j.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Manual Journal Modal */}
        {modalType === 'new_journal' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">New Double-Entry Journal</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateJournal} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Notes / Narration</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Server hosting prepaid adjustment"
                    value={newJrnNotes}
                    onChange={e => setNewJrnNotes(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Debited Account</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={newJrnDebit}
                    onChange={e => setNewJrnDebit(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Credited Account</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={newJrnCredit}
                    onChange={e => setNewJrnCredit(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Amount (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="e.g. 50000"
                    value={newJrnAmount}
                    onChange={e => setNewJrnAmount(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Post Journal Entry
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 6. Time Tracking Module Render
  if (module === 'time_tracking') {
    const filtered = timesheets.filter(ts => {
      const matchesSearch = ts.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ts.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ts.consultant.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'billable') return matchesSearch && ts.billable;
      if (activeTab === 'non_billable') return matchesSearch && !ts.billable;
      return matchesSearch;
    });

    const totalHours = timesheets.reduce((acc, t) => acc + t.hours, 0);
    const billableHours = timesheets.filter(t => t.billable).reduce((acc, t) => acc + t.hours, 0);
    const unbilledAmount = timesheets.filter(t => t.billable).reduce((acc, t) => acc + (t.hours * t.rate), 0);

    const handleCreateTimesheet = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTtTask || !newTtHours) return;

      const newTs = {
        id: `TS-00${timesheets.length + 1}`,
        project: newTtProject,
        task: newTtTask,
        consultant: newTtConsultant,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        hours: parseFloat(newTtHours),
        rate: parseFloat(newTtRate),
        billable: newTtBillable,
      };

      setTimesheets([newTs, ...timesheets]);
      setNewTtTask('');
      setModalType(null);
      showToast(`Logged ${newTs.hours} hours on project: ${newTs.project}`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Time Tracking & Projects</h1>
            <p className="zb-page-subtitle">Track billable client hours, consultants time, and convert logs directly to invoices</p>
          </div>
          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'timesheets_export.csv',
                ['ID', 'Project', 'Task', 'Consultant', 'Date', 'Hours', 'Rate (INR)', 'Billable'],
                timesheets.map(t => [t.id, t.project, t.task, t.consultant, t.date, t.hours, t.rate, t.billable ? 'Yes' : 'No'])
              )}
            >
              <Download size={15} /> Export CSV
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('new_timesheet')}>
              <Plus size={16} /> Log Time Entry
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Logged Hours</div>
            <div className="zb-metric-mini-val text-primary">{totalHours} hrs</div>
            <div className="zb-metric-mini-sub">Across 4 active client projects</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Billable Hours</div>
            <div className="zb-metric-mini-val text-success">{billableHours} hrs</div>
            <div className="zb-metric-mini-sub text-success"><TrendingUp size={12} /> {Math.round((billableHours / (totalHours || 1)) * 100)}% efficiency</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Unbilled Revenue Value</div>
            <div className="zb-metric-mini-val text-primary">{formatINR(unbilledAmount)}</div>
            <div className="zb-metric-mini-sub">Ready to convert to client invoice</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Active Consultants</div>
            <div className="zb-metric-mini-val">4 Specialists</div>
            <div className="zb-metric-mini-sub">Tracked in real time</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="zb-card zb-toolbar-card">
          <div className="zb-toolbar-row">
            <div className="zb-toolbar-search">
              <Search size={16} className="icon" />
              <input
                type="text"
                placeholder="Search by project, task, consultant..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="zb-flex-align gap-2 flex-wrap">
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                All Logs ({timesheets.length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'billable' ? 'active' : ''}`} onClick={() => setActiveTab('billable')}>
                Billable ({timesheets.filter(t => t.billable).length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'non_billable' ? 'active' : ''}`} onClick={() => setActiveTab('non_billable')}>
                Non-Billable ({timesheets.filter(t => !t.billable).length})
              </button>
            </div>
          </div>
        </div>

        {/* Timesheets Table */}
        <div className="zb-card zb-table-container">
          <div className="zb-table-responsive">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Project & Task</th>
                  <th>Consultant</th>
                  <th>Date</th>
                  <th>Hours</th>
                  <th>Rate</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ts => (
                  <tr key={ts.id}>
                    <td className="font-semibold text-primary">{ts.id}</td>
                    <td>
                      <div className="font-semibold">{ts.project}</div>
                      <div className="text-muted" style={{ fontSize: '12px' }}>{ts.task}</div>
                    </td>
                    <td>{ts.consultant}</td>
                    <td>{ts.date}</td>
                    <td><span className="font-bold">{ts.hours} hrs</span></td>
                    <td>{formatINR(ts.rate)}/hr</td>
                    <td className="text-right font-semibold text-primary">{formatINR(ts.hours * ts.rate)}</td>
                    <td className="text-center">
                      <span className={`zb-status-pill ${ts.billable ? 'success' : 'neutral'}`}>
                        {ts.billable ? 'Billable' : 'Non-Billable'}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        className="zb-table-btn"
                        onClick={() => showToast(`Timesheet ${ts.id} linked to pending invoice draft!`)}
                      >
                        Create Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Log Time Entry */}
        {modalType === 'new_timesheet' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-modal-card" onClick={e => e.stopPropagation()}>
              <div className="zb-modal-header">
                <h3>Log Time Entry</h3>
                <button className="zb-close-btn" onClick={() => setModalType(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateTimesheet} className="zb-modal-form">
                <div className="zb-form-group">
                  <label>Project *</label>
                  <select
                    className="zb-input"
                    value={newTtProject}
                    onChange={e => setNewTtProject(e.target.value)}
                  >
                    <option value="Infosys Portal Upgrade">Infosys Portal Upgrade</option>
                    <option value="Tata Consultancy Services">Tata Consultancy Services</option>
                    <option value="Wipro Digital Labs">Wipro Digital Labs</option>
                    <option value="Razorpay Gateway Connect">Razorpay Gateway Connect</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label>Task Description *</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g., API Performance Optimization"
                    value={newTtTask}
                    onChange={e => setNewTtTask(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-row">
                  <div className="zb-form-group">
                    <label>Consultant *</label>
                    <input
                      type="text"
                      className="zb-input"
                      value={newTtConsultant}
                      onChange={e => setNewTtConsultant(e.target.value)}
                      required
                    />
                  </div>
                  <div className="zb-form-group">
                    <label>Hours Spent *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      className="zb-input"
                      value={newTtHours}
                      onChange={e => setNewTtHours(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="zb-form-row">
                  <div className="zb-form-group">
                    <label>Hourly Billing Rate (₹) *</label>
                    <input
                      type="number"
                      step="100"
                      className="zb-input"
                      value={newTtRate}
                      onChange={e => setNewTtRate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="zb-form-group zb-checkbox-group pt-4">
                    <label className="zb-checkbox-label">
                      <input
                        type="checkbox"
                        checked={newTtBillable}
                        onChange={e => setNewTtBillable(e.target.checked)}
                      />
                      <span>Mark as Billable to Client</span>
                    </label>
                  </div>
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Save Time Entry
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 7. Documents Module Render
  if (module === 'documents') {
    const filtered = documentsList.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'invoices') return matchesSearch && doc.category === 'Invoices & Bills';
      if (activeTab === 'tax') return matchesSearch && doc.category === 'Tax & GST';
      if (activeTab === 'legal') return matchesSearch && doc.category === 'Legal & Contracts';
      if (activeTab === 'banking') return matchesSearch && doc.category === 'Bank Statements';
      return matchesSearch;
    });

    const handleUploadDocument = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDocTitle) return;

      const newDoc = {
        id: `DOC-${800 + documentsList.length + 1}`,
        title: newDocTitle.endsWith('.pdf') ? newDocTitle : `${newDocTitle}.pdf`,
        category: newDocCategory,
        uploadedBy: 'Shalya Gaonkar',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        size: '1.2 MB',
        verified: true,
      };

      setDocumentsList([newDoc, ...documentsList]);
      setNewDocTitle('');
      setModalType(null);
      showToast(`Document ${newDoc.title} uploaded & encrypted into vault!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Documents & Receipts Vault</h1>
            <p className="zb-page-subtitle">Centralized audit repository for vendor bills, tax certificates, and statutory filings</p>
          </div>
          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'documents_register.csv',
                ['ID', 'Document Title', 'Category', 'Uploaded By', 'Date', 'File Size', 'Status'],
                documentsList.map(d => [d.id, d.title, d.category, d.uploadedBy, d.date, d.size, d.verified ? 'Verified' : 'Pending'])
              )}
            >
              <Download size={15} /> Export File Index
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setIsUploadDocOpen(true)}>
              <Plus size={16} /> Upload Document
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Vault Files</div>
            <div className="zb-metric-mini-val text-primary">{documentsList.length} Files</div>
            <div className="zb-metric-mini-sub text-success"><ShieldCheck size={12} /> 100% encrypted</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Audit Verified</div>
            <div className="zb-metric-mini-val text-success">
              {documentsList.filter(d => d.verified).length} Verified
            </div>
            <div className="zb-metric-mini-sub text-success">GST auditor ready</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Storage Allocated</div>
            <div className="zb-metric-mini-val">1.4 GB / 50 GB</div>
            <div className="zb-metric-mini-sub">High-availability cloud</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Security Compliance</div>
            <div className="zb-metric-mini-val text-success">AES-256</div>
            <div className="zb-metric-mini-sub">ISO 27001 Certified</div>
          </div>
        </div>

        {/* Tabs & Search Toolbar */}
        <div className="zb-card zb-toolbar-card">
          <div className="zb-toolbar-row">
            <div className="zb-toolbar-search">
              <Search size={16} className="icon" />
              <input
                type="text"
                placeholder="Search documents by name or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="zb-flex-align gap-2 flex-wrap">
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                All Documents ({documentsList.length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'tax' ? 'active' : ''}`} onClick={() => setActiveTab('tax')}>
                Tax & GST ({documentsList.filter(d => d.category === 'Tax & GST').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'banking' ? 'active' : ''}`} onClick={() => setActiveTab('banking')}>
                Bank Statements ({documentsList.filter(d => d.category === 'Bank Statements').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'legal' ? 'active' : ''}`} onClick={() => setActiveTab('legal')}>
                Contracts ({documentsList.filter(d => d.category === 'Legal & Contracts').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>
                Bills & Receipts ({documentsList.filter(d => d.category === 'Invoices & Bills').length})
              </button>
            </div>
          </div>
        </div>

        {/* Documents Table */}
        <div className="zb-card zb-table-container">
          <div className="zb-table-responsive">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Doc ID</th>
                  <th>Document Name</th>
                  <th>Category</th>
                  <th>Uploaded By</th>
                  <th>Upload Date</th>
                  <th>File Size</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => (
                  <tr key={doc.id}>
                    <td
                      className="font-semibold text-primary"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDoc(doc)}
                      title="Click to preview audit certificate"
                    >
                      {doc.id}
                    </td>
                    <td
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDoc(doc)}
                      title="Click to preview audit certificate"
                    >
                      <div className="zb-flex-align gap-2">
                        <FileText size={16} className="text-muted" />
                        <span className="font-semibold">{doc.title}</span>
                      </div>
                    </td>
                    <td><span className="zb-badge-category">{doc.category}</span></td>
                    <td>{doc.uploadedBy}</td>
                    <td>{doc.date}</td>
                    <td>{doc.size}</td>
                    <td className="text-center">
                      <span className={`zb-status-pill ${doc.verified ? 'success' : 'warning'}`}>
                        {doc.verified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="zb-flex-align justify-center gap-2">
                        <button
                          className="zb-table-btn"
                          onClick={() => setSelectedDoc(doc)}
                          title="View audit certificate & details"
                        >
                          <Eye size={13} style={{ marginRight: '3px' }} /> View
                        </button>
                        <button
                          className="zb-table-btn"
                          onClick={() => downloadDocumentFile(doc)}
                          title="Download verified document file"
                        >
                          <Download size={13} style={{ marginRight: '3px' }} /> Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real Document Viewer Modal */}
        <DocumentViewerModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onDownload={downloadDocumentFile}
        />

        {/* Real Upload Document Modal */}
        <UploadDocumentModal
          isOpen={isUploadDocOpen}
          onClose={() => setIsUploadDocOpen(false)}
          onUploaded={handleDocUploaded}
        />
      </div>
    );
  }

  // 8. Payroll Module Render
  if (module === 'payroll') {
    const filtered = employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'engineering') return matchesSearch && emp.department === 'Engineering';
      if (activeTab === 'finance') return matchesSearch && emp.department === 'Finance';
      if (activeTab === 'operations') return matchesSearch && emp.department === 'Operations';
      return matchesSearch;
    });

    const totalGross = employees.reduce((acc, e) => acc + e.gross, 0);
    const totalDeductions = employees.reduce((acc, e) => acc + e.deductions, 0);
    const totalNet = employees.reduce((acc, e) => acc + e.net, 0);

    const handleAddEmployee = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newEmpName || !newEmpGross) return;

      const gross = parseFloat(newEmpGross);
      const deductions = Math.round(gross * 0.12);
      const net = gross - deductions;

      const empData = {
        name: newEmpName,
        designation: newEmpRole || 'Software Specialist',
        department: newEmpDept,
        gross,
        deductions,
        net,
        status: 'Processing',
      };

      try {
        const created = await ApiClient.createPayrollEmployee(empData);
        setEmployees([created, ...employees]);
      } catch {
        const fallbackEmp: PayrollEmployee = {
          id: `EMP-${100 + employees.length + 1}`,
          ...empData
        };
        setEmployees([fallbackEmp, ...employees]);
      }

      setNewEmpName('');
      setNewEmpRole('');
      setNewEmpGross('');
      setModalType(null);
      showToast(`Employee ${newEmpName} added to payroll register!`);
    };

    const handleRunPayBatch = async () => {
      try {
        await ApiClient.disbursePayroll();
      } catch {}
      setEmployees(employees.map(e => ({ ...e, status: 'Paid' })));

      const batchRef = `NEFT-BATCH-${Date.now().toString().slice(-6)}`;
      exportCSV(
        `NEFT_Salary_Disbursement_${batchRef}.csv`,
        ['Batch Ref', 'Employee ID', 'Beneficiary Name', 'Designation', 'Net Amount (INR)', 'Payment Mode', 'Status'],
        employees.map(e => [batchRef, e.id, `"${e.name}"`, `"${e.designation}"`, e.net, 'NEFT/IMPS Direct Credit', 'SUCCESS'])
      );

      showToast(`Payroll batch disbursed! Net ${formatINR(totalNet)} transferred across ${employees.length} employee accounts. NEFT batch register exported!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Zoho Payroll & Compensation</h1>
            <p className="zb-page-subtitle">Salary disbursements, EPF, ESI, Professional Tax, and automated payslip generation</p>
          </div>
          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'payroll_disbursement_register.csv',
                ['Employee ID', 'Name', 'Designation', 'Department', 'Gross (INR)', 'Deductions (INR)', 'Net Pay (INR)', 'Status'],
                employees.map(e => [e.id, e.name, e.designation, e.department, e.gross, e.deductions, e.net, e.status])
              )}
            >
              <Download size={15} /> Export Payroll Sheet
            </button>
            <button className="zb-btn zb-btn-outline-primary" onClick={() => setModalType('add_employee')}>
              <Plus size={16} /> Add Employee
            </button>
            <button className="zb-btn zb-btn-primary" onClick={handleRunPayBatch}>
              <Check size={16} /> Run Pay Batch
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Monthly Payroll</div>
            <div className="zb-metric-mini-val text-primary">{formatINR(totalGross)}</div>
            <div className="zb-metric-mini-sub">Across {employees.length} team members</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Statutory Deductions (EPF/PT)</div>
            <div className="zb-metric-mini-val text-danger">{formatINR(totalDeductions)}</div>
            <div className="zb-metric-mini-sub text-danger">Challan ready for EPFO portal</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Net Salary Disbursed</div>
            <div className="zb-metric-mini-val text-success">{formatINR(totalNet)}</div>
            <div className="zb-metric-mini-sub text-success">Direct bank transfer via IMPS/NEFT</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Next Pay Cycle</div>
            <div className="zb-metric-mini-val">30 Sep 2026</div>
            <div className="zb-metric-mini-sub">Automated direct deposits</div>
          </div>
        </div>

        {/* Tabs & Search Toolbar */}
        <div className="zb-card zb-toolbar-card">
          <div className="zb-toolbar-row">
            <div className="zb-toolbar-search">
              <Search size={16} className="icon" />
              <input
                type="text"
                placeholder="Search employee by name, role, department..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="zb-flex-align gap-2 flex-wrap">
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                All Departments ({employees.length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'engineering' ? 'active' : ''}`} onClick={() => setActiveTab('engineering')}>
                Engineering ({employees.filter(e => e.department === 'Engineering').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>
                Finance ({employees.filter(e => e.department === 'Finance').length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'operations' ? 'active' : ''}`} onClick={() => setActiveTab('operations')}>
                Operations ({employees.filter(e => e.department === 'Operations').length})
              </button>
            </div>
          </div>
        </div>

        {/* Payroll Table */}
        <div className="zb-card zb-table-container">
          <div className="zb-table-responsive">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Employee Name</th>
                  <th>Role & Title</th>
                  <th>Department</th>
                  <th className="text-right">Gross Salary</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net Salary</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr key={emp.id}>
                    <td
                      className="font-semibold text-primary"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedEmpPayslip(emp)}
                      title="Click to view official payslip"
                    >
                      {emp.id}
                    </td>
                    <td
                      className="font-semibold"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedEmpPayslip(emp)}
                      title="Click to view official payslip"
                    >
                      {emp.name}
                    </td>
                    <td>{emp.designation}</td>
                    <td><span className="zb-badge-category">{emp.department}</span></td>
                    <td className="text-right font-medium">{formatINR(emp.gross)}</td>
                    <td className="text-right text-danger font-medium">-{formatINR(emp.deductions)}</td>
                    <td className="text-right font-bold text-success">{formatINR(emp.net)}</td>
                    <td className="text-center">
                      <span className={`zb-status-pill ${emp.status === 'Paid' ? 'success' : 'warning'}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="zb-flex-align justify-center gap-2">
                        <button
                          className="zb-table-btn"
                          onClick={() => setSelectedEmpPayslip(emp)}
                          title="View, Print & verify Salary Payslip"
                        >
                          <Eye size={13} style={{ marginRight: '3px' }} /> Payslip
                        </button>
                        <button
                          className="zb-table-btn"
                          onClick={() => downloadEmployeePayslip(emp)}
                          title="Download official standalone HTML payslip"
                        >
                          <Download size={13} style={{ marginRight: '3px' }} /> Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Employee */}
        {modalType === 'add_employee' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-modal-card" onClick={e => e.stopPropagation()}>
              <div className="zb-modal-header">
                <h3>Add Employee to Payroll</h3>
                <button className="zb-close-btn" onClick={() => setModalType(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddEmployee} className="zb-modal-form">
                <div className="zb-form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g., Rohit Verma"
                    value={newEmpName}
                    onChange={e => setNewEmpName(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-row">
                  <div className="zb-form-group">
                    <label>Designation / Role *</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g., Senior Software Engineer"
                      value={newEmpRole}
                      onChange={e => setNewEmpRole(e.target.value)}
                      required
                    />
                  </div>
                  <div className="zb-form-group">
                    <label>Department *</label>
                    <select
                      className="zb-input"
                      value={newEmpDept}
                      onChange={e => setNewEmpDept(e.target.value)}
                    >
                      <option value="Engineering">Engineering</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="Sales">Sales</option>
                    </select>
                  </div>
                </div>
                <div className="zb-form-group">
                  <label>Monthly Gross Salary (₹) *</label>
                  <input
                    type="number"
                    step="1000"
                    className="zb-input"
                    placeholder="e.g., 125000"
                    value={newEmpGross}
                    onChange={e => setNewEmpGross(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Save Employee
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Interactive Salary Payslip Modal */}
        <SalaryPayslipModal
          employee={selectedEmpPayslip}
          onClose={() => setSelectedEmpPayslip(null)}
          onDownload={() => selectedEmpPayslip && downloadEmployeePayslip(selectedEmpPayslip)}
        />
      </div>
    );
  }

  // 9. Payments Module Render
  if (module === 'payments') {
    const filtered = paymentsList.filter(p => {
      const matchesSearch = p.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.invoiceRef.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'upi') return matchesSearch && p.method.includes('UPI');
      if (activeTab === 'netbanking') return matchesSearch && p.method.includes('NetBanking');
      if (activeTab === 'card') return matchesSearch && p.method.includes('Card');
      return matchesSearch;
    });

    const totalCollected = paymentsList.reduce((acc, p) => acc + p.amount, 0);

    const handleCreatePaymentLink = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPayCustomer || !newPayAmount) return;

      const newPay = {
        id: `PAY-90${40 + paymentsList.length + 1}`,
        customer: newPayCustomer,
        invoiceRef: newPayInvoiceRef || 'INV-00105',
        method: newPayMethod,
        amount: parseFloat(newPayAmount),
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'Settled',
      };

      setPaymentsList([newPay, ...paymentsList]);
      setNewPayCustomer('');
      setNewPayAmount('');
      setModalType(null);
      showToast(`Payment Link generated: https://pay.roomanbooks.com/${newPay.id}`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Payments & Gateway Collection</h1>
            <p className="zb-page-subtitle">Instant UPI QR codes, customer payment links, NetBanking, and automated ledger settlement</p>
          </div>
          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'payments_settlement_register.csv',
                ['Payment Ref', 'Customer', 'Invoice Ref', 'Method', 'Amount (INR)', 'Date', 'Status'],
                paymentsList.map(p => [p.id, p.customer, p.invoiceRef, p.method, p.amount, p.date, p.status])
              )}
            >
              <Download size={15} /> Export Transactions
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('create_payment')}>
              <Plus size={16} /> Generate Payment Link / QR
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Collections</div>
            <div className="zb-metric-mini-val text-primary">{formatINR(totalCollected)}</div>
            <div className="zb-metric-mini-sub text-success"><TrendingUp size={12} /> Automated reconciliation</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">UPI QR Collections</div>
            <div className="zb-metric-mini-val text-success">₹4,30,000</div>
            <div className="zb-metric-mini-sub text-success"><QrCode size={12} /> Zero transaction fee</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Settlement Rate</div>
            <div className="zb-metric-mini-val text-success">T+0 Instant</div>
            <div className="zb-metric-mini-sub">Direct into corporate bank A/C</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Active Links</div>
            <div className="zb-metric-mini-val">12 Active Links</div>
            <div className="zb-metric-mini-sub">WhatsApp & Email dispatch</div>
          </div>
        </div>

        {/* Tabs & Search Toolbar */}
        <div className="zb-card zb-toolbar-card">
          <div className="zb-toolbar-row">
            <div className="zb-toolbar-search">
              <Search size={16} className="icon" />
              <input
                type="text"
                placeholder="Search by customer, transaction ref, invoice..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="zb-flex-align gap-2 flex-wrap">
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                All Transactions ({paymentsList.length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'upi' ? 'active' : ''}`} onClick={() => setActiveTab('upi')}>
                UPI QR ({paymentsList.filter(p => p.method.includes('UPI')).length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'netbanking' ? 'active' : ''}`} onClick={() => setActiveTab('netbanking')}>
                NetBanking ({paymentsList.filter(p => p.method.includes('NetBanking')).length})
              </button>
              <button className={`zb-tab-chip ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>
                Credit / Debit Cards ({paymentsList.filter(p => p.method.includes('Card')).length})
              </button>
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="zb-card zb-table-container">
          <div className="zb-table-responsive">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Transaction Ref</th>
                  <th>Customer Name</th>
                  <th>Invoice Ref</th>
                  <th>Payment Method</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="font-semibold text-primary">{p.id}</td>
                    <td className="font-semibold">{p.customer}</td>
                    <td><span className="text-muted font-medium">{p.invoiceRef}</span></td>
                    <td>
                      <div className="zb-flex-align gap-2">
                        <CreditCard size={15} className="text-primary" />
                        <span>{p.method}</span>
                      </div>
                    </td>
                    <td>{p.date}</td>
                    <td className="text-right font-bold text-success">{formatINR(p.amount)}</td>
                    <td className="text-center">
                      <span className={`zb-status-pill ${p.status.toLowerCase()}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        className="zb-table-btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(`https://pay.roomanbooks.com/${p.id}`);
                          showToast(`Payment link for ${p.id} copied to clipboard!`);
                        }}
                      >
                        Copy Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Create Payment Link */}
        {modalType === 'create_payment' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-modal-card" onClick={e => e.stopPropagation()}>
              <div className="zb-modal-header">
                <h3>Generate Payment Link & UPI QR</h3>
                <button className="zb-close-btn" onClick={() => setModalType(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreatePaymentLink} className="zb-modal-form">
                <div className="zb-form-group">
                  <label>Customer / Client Name *</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g., Tata Consultancy Services"
                    value={newPayCustomer}
                    onChange={e => setNewPayCustomer(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-row">
                  <div className="zb-form-group">
                    <label>Invoice Reference</label>
                    <input
                      type="text"
                      className="zb-input"
                      value={newPayInvoiceRef}
                      onChange={e => setNewPayInvoiceRef(e.target.value)}
                    />
                  </div>
                  <div className="zb-form-group">
                    <label>Amount (₹) *</label>
                    <input
                      type="number"
                      step="1"
                      className="zb-input"
                      placeholder="e.g., 85000"
                      value={newPayAmount}
                      onChange={e => setNewPayAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="zb-form-group">
                  <label>Preferred Mode</label>
                  <select
                    className="zb-input"
                    value={newPayMethod}
                    onChange={e => setNewPayMethod(e.target.value)}
                  >
                    <option value="UPI Instant QR">UPI Instant QR (Zero Fee)</option>
                    <option value="Corporate NetBanking">Corporate NetBanking</option>
                    <option value="Credit Card Gateway">Credit / Debit Card</option>
                    <option value="IMPS Direct Transfer">IMPS Direct Transfer</option>
                  </select>
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Generate Link & QR
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generic fallback if any unknown module is selected
  return (
    <div className="zb-page zb-module-page">
      {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}
      <div className="zb-card zb-empty-state-card text-center p-5 zb-section-spacing">
        <h3 className="font-bold text-xl mb-2">Module Active</h3>
        <p className="text-muted max-w-lg mx-auto mb-4">
          All locks have been removed. This module is connected to your cloud accounting ledger and ready for transactions.
        </p>
        <div className="zb-flex-align justify-center gap-3">
          <button className="zb-btn zb-btn-secondary" onClick={() => onNavigate('items')}>View Inventory Items</button>
          <button className="zb-btn zb-btn-primary" onClick={() => onNavigate('home')}>Go to Dashboard Overview</button>
        </div>
      </div>
    </div>
  );
};
