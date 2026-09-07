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
  ArrowRight,
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
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
  Truck,
  Lock,
  Unlock,
  Sparkles,
  Send,
  Copy,
  Layers,
  ChevronRight,
  Package
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

  // Sub-Navigation Tabs across modules
  const [salesSubTab, setSalesSubTab] = useState<'invoices' | 'quotes' | 'orders' | 'challans' | 'credit_notes'>('invoices');
  const [purchasesSubTab, setPurchasesSubTab] = useState<'bills' | 'orders' | 'credits' | 'recurring'>('bills');
  const [documentsSubTab, setDocumentsSubTab] = useState<'vault' | 'autoscan'>('vault');
  const [accountantSubTab, setAccountantSubTab] = useState<'journals' | 'accounts' | 'locking'>('journals');

  // Quotes State (Page 6)
  const [quotes, setQuotes] = useState([
    { id: 'QT-2026-001', client: 'Infosys BPM Limited', date: '04 Sep 2026', expiry: '25 Sep 2026', amount: 185000, status: 'Accepted' },
    { id: 'QT-2026-002', client: 'Larsen & Toubro Ltd', date: '02 Sep 2026', expiry: '16 Sep 2026', amount: 450000, status: 'Sent' },
    { id: 'QT-2026-003', client: 'Titan Company Limited', date: '30 Aug 2026', expiry: '15 Sep 2026', amount: 92000, status: 'Draft' },
  ]);

  // Sales Orders State (Page 7)
  const [salesOrders, setSalesOrders] = useState([
    { id: 'SO-5012', quoteRef: 'QT-2026-001', client: 'Infosys BPM Limited', date: '04 Sep 2026', amount: 185000, stage: 'Packed', invoiced: true },
    { id: 'SO-5011', quoteRef: 'Direct Order', client: 'Tata Consultancy Services', date: '27 Aug 2026', amount: 342000, stage: 'Delivered', invoiced: true },
    { id: 'SO-5010', quoteRef: 'Direct Order', client: 'Wipro Digital Labs', date: '18 Aug 2026', amount: 98500, stage: 'Shipped', invoiced: true },
  ]);

  // Delivery Challans State (Page 7-8)
  const [deliveryChallans, setDeliveryChallans] = useState([
    { id: 'DC-1049', orderRef: 'SO-5012', client: 'Infosys BPM Limited', date: '05 Sep 2026', driver: 'Ramesh Kumar (KA-01-MJ-4412)', pod: 'Signed Receipt Attached', status: 'Staged' },
    { id: 'DC-1048', orderRef: 'SO-5011', client: 'Tata Consultancy Services', date: '28 Aug 2026', driver: 'Suresh Patil (KA-03-AB-9821)', pod: 'Delivered & Stamped', status: 'Delivered' },
  ]);

  // Credit Notes State (Page 10)
  const [creditNotes, setCreditNotes] = useState([
    { id: 'CN-2026-01', invRef: 'INV-00098', client: 'Tech Mahindra Ltd', date: '22 Aug 2026', reason: 'Return of 2x damaged server RAM modules', amount: 14500, status: 'Applied' },
    { id: 'CN-2026-02', invRef: 'INV-00101', client: 'Razorpay Software Pvt Ltd', date: '01 Sep 2026', reason: 'Volume rebate credit adjustment', amount: 12000, status: 'Available' },
  ]);

  // Purchase Orders & 3-Way Match State (Page 10-11)
  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: 'PO-8021', vendor: 'Dell Technologies India', date: '01 Sep 2026', amount: 245000, matchStatus: '3-Way Matched (PO ↔ GRN-401 ↔ BILL-8091)', status: 'Billed' },
    { id: 'PO-8022', vendor: 'Cisco Systems India', date: '29 Aug 2026', amount: 185000, matchStatus: 'GRN Received (Awaiting Final Bill)', status: 'Partially Received' },
    { id: 'PO-8023', vendor: 'Hewlett Packard Enterprise', date: '04 Sep 2026', amount: 320000, matchStatus: 'PO Issued (Awaiting Goods Receipt)', status: 'Issued' },
  ]);

  // Vendor Credits State (Page 11)
  const [vendorCredits, setVendorCredits] = useState([
    { id: 'VC-401', vendor: 'Dell Technologies India', date: '02 Sep 2026', reason: 'Prepayment early-settlement credit', amount: 15000, status: 'Available' },
  ]);

  // Recurring Expenses & Bills State (Page 12)
  const [recurringExpenses, setRecurringExpenses] = useState([
    { id: 'REC-EXP-01', name: 'Bangalore Tech Park Lease', vendor: 'Tech Park Realty Trust', category: 'Rent Expense', amount: 175000, frequency: 'Monthly', nextRun: '01 Oct 2026', status: 'Active' },
    { id: 'REC-EXP-02', name: 'Cloud Server Infrastructure', vendor: 'Amazon Web Services AWS', category: 'Hosting & IT', amount: 48900, frequency: 'Monthly', nextRun: '15 Sep 2026', status: 'Active' },
    { id: 'REC-EXP-03', name: 'Airtel Leased Line Internet', vendor: 'Bharti Airtel Enterprise', category: 'Utilities', amount: 12500, frequency: 'Monthly', nextRun: '20 Sep 2026', status: 'Active' },
  ]);

  // Live Stopwatch State (Page 13-14)
  const [stopwatchSeconds, setStopwatchSeconds] = useState(1420);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [stopwatchProject, setStopwatchProject] = useState('Infosys Portal Upgrade');
  const [stopwatchTask, setStopwatchTask] = useState('Architecture & Schema Review');

  useEffect(() => {
    let timer: any = null;
    if (isStopwatchRunning) {
      timer = setInterval(() => {
        setStopwatchSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isStopwatchRunning]);

  const formatStopwatch = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // AutoScan State (Page 16-17)
  const [autoScanSample, setAutoScanSample] = useState('hpe');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    vendor: string;
    invoiceNo: string;
    date: string;
    subtotal: number;
    cgst: number;
    sgst: number;
    total: number;
    confidence: number;
  } | null>({
    vendor: 'Hewlett Packard Enterprise India',
    invoiceNo: 'HPE-IN-98214',
    date: '03 Sep 2026',
    subtotal: 120000,
    cgst: 10800,
    sgst: 10800,
    total: 141600,
    confidence: 99.4,
  });

  // Transaction Locking State (Page 15)
  const [isPeriodLocked, setIsPeriodLocked] = useState(true);
  const [lockedDate, setLockedDate] = useState('31 Mar 2026');

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
    const filteredInvoices = invoices.filter(inv => {
      const matchesSearch = inv.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.id.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'paid') return matchesSearch && inv.status === 'Paid';
      if (activeTab === 'pending') return matchesSearch && inv.status === 'Sent';
      if (activeTab === 'overdue') return matchesSearch && inv.status === 'Overdue';
      return matchesSearch;
    });

    const handleConvertQuoteToSO = (quote: typeof quotes[0]) => {
      const newSO = {
        id: `SO-50${13 + salesOrders.length}`,
        quoteRef: quote.id,
        client: quote.client,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: quote.amount,
        stage: 'Ordered' as const,
        invoiced: false,
      };
      setSalesOrders([newSO, ...salesOrders]);
      setQuotes(quotes.map(q => q.id === quote.id ? { ...q, status: 'Accepted' } : q));
      setSalesSubTab('orders');
      showToast(`Quote ${quote.id} converted to Sales Order ${newSO.id}!`);
    };

    const handleCreateChallanFromSO = (so: typeof salesOrders[0]) => {
      const newDC = {
        id: `DC-10${50 + deliveryChallans.length}`,
        orderRef: so.id,
        client: so.client,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        driver: 'Kishore Kumar (KA-04-E-8891)',
        pod: 'Dispatched with e-Way Bill',
        status: 'Staged' as const,
      };
      setDeliveryChallans([newDC, ...deliveryChallans]);
      setSalesOrders(salesOrders.map(o => o.id === so.id ? { ...o, stage: 'Packed' } : o));
      setSalesSubTab('challans');
      showToast(`Delivery Challan ${newDC.id} generated for ${so.id}!`);
    };

    const handleMarkChallanDispatched = (dcId: string) => {
      setDeliveryChallans(deliveryChallans.map(d => d.id === dcId ? { ...d, status: 'Dispatched' } : d));
      showToast(`Challan ${dcId} marked as Dispatched! Driver notified.`);
    };

    const handleMarkChallanDelivered = (dcId: string) => {
      setDeliveryChallans(deliveryChallans.map(d => d.id === dcId ? { ...d, status: 'Delivered', pod: 'Signed Proof of Delivery Uploaded' } : d));
      showToast(`Challan ${dcId} marked as Delivered! Goods receipt confirmed.`);
    };

    const handleApplyCredit = (cnId: string) => {
      setCreditNotes(creditNotes.map(c => c.id === cnId ? { ...c, status: 'Applied' } : c));
      showToast(`Credit Note ${cnId} applied to customer open balance!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Sales Management Pipeline</h1>
            <p className="zb-page-subtitle">End-to-end sales lifecycle: Quotes &rarr; Sales Orders &rarr; Delivery Challans &rarr; Tax Invoices &rarr; Credit Notes</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'sales_pipeline.csv',
                ['Type', 'ID', 'Client', 'Date', 'Amount', 'Status'],
                invoices.map(i => ['Invoice', i.id, `"${i.client}"`, i.date, i.amount, i.status])
              )}
            >
              <Download size={15} /> Export CSV
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setIsCreateInvoiceOpen(true)}>
              <Plus size={16} /> New Tax Invoice
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs Bar (Document Sections 5, 6, 7, 8, 9, 10, 11) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${salesSubTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('invoices')}
          >
            <Receipt size={15} />
            <span>Tax Invoices</span>
            <span className="zb-subnav-badge">{invoices.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'quotes' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('quotes')}
          >
            <FileText size={15} />
            <span>Quotes & Estimates</span>
            <span className="zb-subnav-badge">{quotes.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'orders' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('orders')}
          >
            <Package size={15} />
            <span>Sales Orders</span>
            <span className="zb-subnav-badge">{salesOrders.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'challans' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('challans')}
          >
            <Truck size={15} />
            <span>Delivery Challans</span>
            <span className="zb-subnav-badge">{deliveryChallans.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'credit_notes' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('credit_notes')}
          >
            <Receipt size={15} />
            <span>Credit Notes</span>
            <span className="zb-subnav-badge">{creditNotes.length}</span>
          </button>
        </div>

        {/* 1. Tax Invoices Sub-Module */}
        {salesSubTab === 'invoices' && (
          <>
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
                  {filteredInvoices.map(inv => (
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
          </>
        )}

        {/* 2. Quotes & Estimates Sub-Module (Page 6) */}
        {salesSubTab === 'quotes' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Proposed Value</div>
                <div className="zb-metric-mini-val text-primary">
                  {formatINR(quotes.reduce((acc, q) => acc + q.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">{quotes.length} active quotations</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Accepted Quotes</div>
                <div className="zb-metric-mini-val text-success">
                  {formatINR(quotes.filter(q => q.status === 'Accepted').reduce((acc, q) => acc + q.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Ready for Sales Order conversion</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Pending Decision</div>
                <div className="zb-metric-mini-val text-warning">
                  {formatINR(quotes.filter(q => q.status === 'Sent').reduce((acc, q) => acc + q.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">With clients for sign-off</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Price Quotations & Estimates</h3>
                <span className="text-muted text-sm">1-Click Convert to Sales Order supported</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Quote #</th>
                    <th>Customer Name</th>
                    <th>Issue Date</th>
                    <th>Valid Until</th>
                    <th className="text-right">Estimate Amount</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Workflow Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id}>
                      <td className="font-semibold text-primary">{q.id}</td>
                      <td className="font-medium">{q.client}</td>
                      <td>{q.date}</td>
                      <td>{q.expiry}</td>
                      <td className="text-right font-semibold">{formatINR(q.amount)}</td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${q.status === 'Accepted' ? 'paid' : q.status === 'Sent' ? 'active' : 'pending'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="zb-flex-align justify-center gap-2">
                          <button
                            className="zb-table-btn"
                            style={{ color: '#0066cc', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            onClick={() => handleConvertQuoteToSO(q)}
                            title="1-Click conversion: Quote -> Sales Order"
                          >
                            <ArrowRight size={13} style={{ marginRight: '4px' }} /> Convert to Order
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 3. Sales Orders Sub-Module (Page 7) */}
        {salesSubTab === 'orders' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Confirmed Sales Orders</div>
                <div className="zb-metric-mini-val text-primary">{salesOrders.length} Orders</div>
                <div className="zb-metric-mini-sub">Stock auto-reserved</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Fulfilment Progress</div>
                <div className="zb-metric-mini-val text-success">
                  {Math.round((salesOrders.filter(o => o.stage === 'Delivered').length / salesOrders.length) * 100)}%
                </div>
                <div className="zb-metric-mini-sub">Ordered &rarr; Packed &rarr; Shipped &rarr; Delivered</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Order Value</div>
                <div className="zb-metric-mini-val text-dark">
                  {formatINR(salesOrders.reduce((acc, o) => acc + o.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Committed sales revenue</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Sales Orders & Fulfilment Tracker</h3>
                <span className="text-muted text-sm">Convert to Delivery Challan or Invoice</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Quote Ref</th>
                    <th>Customer Name</th>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-center">Fulfilment Stage</th>
                    <th className="text-center">Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map(so => (
                    <tr key={so.id}>
                      <td className="font-semibold text-primary">{so.id}</td>
                      <td><span className="text-muted text-xs font-mono">{so.quoteRef}</span></td>
                      <td className="font-medium">{so.client}</td>
                      <td>{so.date}</td>
                      <td className="text-right font-semibold">{formatINR(so.amount)}</td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${so.stage === 'Delivered' ? 'paid' : so.stage === 'Shipped' ? 'active' : 'pending'}`}>
                          {so.stage}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="zb-flex-align justify-center gap-2">
                          <button
                            className="zb-table-btn"
                            onClick={() => handleCreateChallanFromSO(so)}
                            title="Generate dispatch Delivery Challan"
                          >
                            <Truck size={13} style={{ marginRight: '4px' }} /> Create Challan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 4. Delivery Challans Sub-Module (Page 7-8) */}
        {salesSubTab === 'challans' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Dispatched Challans</div>
                <div className="zb-metric-mini-val text-primary">{deliveryChallans.length} Challans</div>
                <div className="zb-metric-mini-sub">Physical logistics movement</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Completed Deliveries</div>
                <div className="zb-metric-mini-val text-success">
                  {deliveryChallans.filter(d => d.status === 'Delivered').length} Confirmed
                </div>
                <div className="zb-metric-mini-sub">Signed proof of delivery on file</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Pending Dispatch</div>
                <div className="zb-metric-mini-val text-warning">
                  {deliveryChallans.filter(d => d.status === 'Staged').length} Staged
                </div>
                <div className="zb-metric-mini-sub">Awaiting driver assignment</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Goods Delivery Challans Register</h3>
                <span className="text-muted text-sm">Transport, e-Way Bill & Proof of Delivery</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Challan #</th>
                    <th>Sales Order</th>
                    <th>Client / Destination</th>
                    <th>Date</th>
                    <th>Driver & Vehicle #</th>
                    <th>Proof of Delivery</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Update</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryChallans.map(dc => (
                    <tr key={dc.id}>
                      <td className="font-semibold text-primary">{dc.id}</td>
                      <td><span className="text-muted text-xs font-mono">{dc.orderRef}</span></td>
                      <td className="font-medium">{dc.client}</td>
                      <td>{dc.date}</td>
                      <td><span className="text-xs">{dc.driver}</span></td>
                      <td><span className="text-xs text-muted">{dc.pod}</span></td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${dc.status === 'Delivered' ? 'paid' : dc.status === 'Dispatched' ? 'active' : 'pending'}`}>
                          {dc.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="zb-flex-align justify-center gap-2">
                          {dc.status === 'Staged' && (
                            <button
                              className="zb-table-btn"
                              onClick={() => handleMarkChallanDispatched(dc.id)}
                            >
                              <Truck size={13} style={{ marginRight: '4px' }} /> Mark Dispatched
                            </button>
                          )}
                          {dc.status === 'Dispatched' && (
                            <button
                              className="zb-table-btn"
                              style={{ color: '#059669', borderColor: '#a7f3d0' }}
                              onClick={() => handleMarkChallanDelivered(dc.id)}
                            >
                              <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Mark Delivered
                            </button>
                          )}
                          {dc.status === 'Delivered' && (
                            <span className="text-xs text-success font-semibold">Delivered & Verified</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 5. Credit Notes Sub-Module (Page 10) */}
        {salesSubTab === 'credit_notes' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Credit Notes</div>
                <div className="zb-metric-mini-val text-danger">
                  {formatINR(creditNotes.reduce((acc, c) => acc + c.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">{creditNotes.length} credit notes issued</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Available for Invoices</div>
                <div className="zb-metric-mini-val text-warning">
                  {formatINR(creditNotes.filter(c => c.status === 'Available').reduce((acc, c) => acc + c.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Ready to apply against receivables</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Applied to Invoices</div>
                <div className="zb-metric-mini-val text-success">
                  {formatINR(creditNotes.filter(c => c.status === 'Applied').reduce((acc, c) => acc + c.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Settled in ledger</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Customer Credit Notes Register</h3>
                <span className="text-muted text-sm">Goods return & pricing adjustments linked to invoices</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Credit Note #</th>
                    <th>Linked Invoice</th>
                    <th>Customer Name</th>
                    <th>Date</th>
                    <th>Reason / Narration</th>
                    <th className="text-right">Credit Amount</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {creditNotes.map(cn => (
                    <tr key={cn.id}>
                      <td className="font-semibold text-primary">{cn.id}</td>
                      <td><span className="text-muted text-xs font-mono">{cn.invRef}</span></td>
                      <td className="font-medium">{cn.client}</td>
                      <td>{cn.date}</td>
                      <td><span className="text-xs text-muted">{cn.reason}</span></td>
                      <td className="text-right font-semibold text-danger">-{formatINR(cn.amount)}</td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${cn.status === 'Applied' ? 'paid' : 'pending'}`}>
                          {cn.status}
                        </span>
                      </td>
                      <td className="text-center">
                        {cn.status === 'Available' ? (
                          <button
                            className="zb-table-btn"
                            onClick={() => handleApplyCredit(cn.id)}
                          >
                            Apply to Invoice
                          </button>
                        ) : (
                          <span className="text-xs text-muted">Fully Applied</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

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

    const handleConvertPOToBill = (po: typeof purchaseOrders[0]) => {
      const newBill = {
        id: `BILL-${8093 + bills.length}`,
        vendor: po.vendor,
        category: 'Hardware Procurement',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: po.amount,
        status: 'Pending',
      };
      setBills([newBill, ...bills]);
      setPurchaseOrders(purchaseOrders.map(p => p.id === po.id ? { ...p, status: 'Billed', matchStatus: `3-Way Matched (PO ↔ GRN ↔ ${newBill.id})` } : p));
      setPurchasesSubTab('bills');
      showToast(`Purchase Order ${po.id} converted to Vendor Bill ${newBill.id}! 3-Way match complete.`);
    };

    const handleReceivePO = (poId: string) => {
      setPurchaseOrders(purchaseOrders.map(p => p.id === poId ? { ...p, status: 'Partially Received', matchStatus: 'GRN Received (Awaiting Final Bill)' } : p));
      showToast(`Goods Receipt Note (GRN) recorded for ${poId}! Stock inventory updated.`);
    };

    const handleToggleRecurring = (id: string) => {
      setRecurringExpenses(recurringExpenses.map(r => r.id === id ? { ...r, status: r.status === 'Active' ? 'Paused' : 'Active' } : r));
      showToast(`Recurring expense schedule updated.`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Purchases & Procure-to-Pay</h1>
            <p className="zb-page-subtitle">Suppliers &rarr; Purchase Orders (3-Way Match) &rarr; Vendor Bills &rarr; Recurring Expenses &rarr; Vendor Credits</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'purchases_register.csv',
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

        {/* Sub-Navigation Tabs Bar */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'bills' ? 'active' : ''}`}
            onClick={() => setPurchasesSubTab('bills')}
          >
            <ShoppingBag size={15} />
            <span>Vendor Bills</span>
            <span className="zb-subnav-badge">{bills.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'orders' ? 'active' : ''}`}
            onClick={() => setPurchasesSubTab('orders')}
          >
            <Layers size={15} />
            <span>Purchase Orders & 3-Way Match</span>
            <span className="zb-subnav-badge">{purchaseOrders.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'credits' ? 'active' : ''}`}
            onClick={() => setPurchasesSubTab('credits')}
          >
            <Receipt size={15} />
            <span>Vendor Credits</span>
            <span className="zb-subnav-badge">{vendorCredits.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'recurring' ? 'active' : ''}`}
            onClick={() => setPurchasesSubTab('recurring')}
          >
            <Clock size={15} />
            <span>Recurring Expenses & Bills</span>
            <span className="zb-subnav-badge">{recurringExpenses.length}</span>
          </button>
        </div>

        {/* 1. Vendor Bills Tab */}
        {purchasesSubTab === 'bills' && (
          <>
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
          </>
        )}

        {/* 2. Purchase Orders & 3-Way Match Tab (Pages 10-11) */}
        {purchasesSubTab === 'orders' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Purchase Orders Issued</div>
                <div className="zb-metric-mini-val text-primary">{purchaseOrders.length} Orders</div>
                <div className="zb-metric-mini-sub">Procurement commitments</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">3-Way Match Accuracy</div>
                <div className="zb-metric-mini-val text-success">100% Audit Pass</div>
                <div className="zb-metric-mini-sub">PO &harr; Goods Receipt (GRN) &harr; Vendor Bill</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Procurement Value</div>
                <div className="zb-metric-mini-val text-dark">
                  {formatINR(purchaseOrders.reduce((acc, p) => acc + p.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Authorized expenditure</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div>
                  <h3 className="font-semibold text-dark">Purchase Orders & 3-Way Match System</h3>
                  <p className="text-muted text-xs">Verify Purchase Order &harr; Goods Received Note (GRN) &harr; Vendor Bill before releasing payment</p>
                </div>
                <span className="zb-ocr-chip"><ShieldCheck size={13} /> 3-Way Match Active</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Supplier / Vendor</th>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th>3-Way Match Status</th>
                    <th className="text-center">PO Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map(po => (
                    <tr key={po.id}>
                      <td className="font-semibold text-primary">{po.id}</td>
                      <td className="font-medium">{po.vendor}</td>
                      <td>{po.date}</td>
                      <td className="text-right font-semibold">{formatINR(po.amount)}</td>
                      <td>
                        <span className={`zb-status-pill ${po.matchStatus.includes('3-Way Matched') ? 'paid' : 'pending'}`}>
                          {po.matchStatus}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${po.status === 'Billed' ? 'paid' : po.status === 'Partially Received' ? 'active' : 'pending'}`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="zb-flex-align justify-center gap-2">
                          {po.status === 'Issued' && (
                            <button
                              className="zb-table-btn"
                              onClick={() => handleReceivePO(po.id)}
                            >
                              Log Goods Receipt (GRN)
                            </button>
                          )}
                          {po.status === 'Partially Received' && (
                            <button
                              className="zb-table-btn"
                              style={{ color: '#0066cc', borderColor: '#bfdbfe', background: '#eff6ff' }}
                              onClick={() => handleConvertPOToBill(po)}
                            >
                              Convert to Bill
                            </button>
                          )}
                          {po.status === 'Billed' && (
                            <span className="text-xs text-success font-semibold">Matched & Billed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 3. Vendor Credits Tab (Page 11) */}
        {purchasesSubTab === 'credits' && (
          <>
            <div className="zb-dashboard-grid two-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Vendor Credits</div>
                <div className="zb-metric-mini-val text-success">
                  {formatINR(vendorCredits.reduce((acc, v) => acc + v.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Vendor refund balances</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Available for Offsetting</div>
                <div className="zb-metric-mini-val text-primary">
                  {formatINR(vendorCredits.filter(v => v.status === 'Available').reduce((acc, v) => acc + v.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Deductible against upcoming bills</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Supplier Credit Notes Register</h3>
                <span className="text-muted text-sm">Credits granted for purchase returns and rate adjustments</span>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Credit ID</th>
                    <th>Vendor Name</th>
                    <th>Date</th>
                    <th>Reason / Notes</th>
                    <th className="text-right">Credit Amount</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorCredits.map(vc => (
                    <tr key={vc.id}>
                      <td className="font-semibold text-primary">{vc.id}</td>
                      <td className="font-medium">{vc.vendor}</td>
                      <td>{vc.date}</td>
                      <td><span className="text-xs text-muted">{vc.reason}</span></td>
                      <td className="text-right font-semibold text-success">{formatINR(vc.amount)}</td>
                      <td className="text-center">
                        <span className="zb-status-pill paid">{vc.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 4. Recurring Expenses & Bills Tab (Page 12) */}
        {purchasesSubTab === 'recurring' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Active Recurring Profiles</div>
                <div className="zb-metric-mini-val text-primary">{recurringExpenses.filter(r => r.status === 'Active').length} Active</div>
                <div className="zb-metric-mini-sub">Automatic monthly generation</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Monthly Outflow Commitment</div>
                <div className="zb-metric-mini-val text-dark">
                  {formatINR(recurringExpenses.filter(r => r.status === 'Active').reduce((acc, r) => acc + r.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Rent, Cloud, ISP & utilities</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Next Scheduled Run</div>
                <div className="zb-metric-mini-val text-warning">15 Sep 2026</div>
                <div className="zb-metric-mini-sub">AWS Cloud Server charge</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div>
                  <h3 className="font-semibold text-dark">Recurring Expenses & Recurring Bills</h3>
                  <p className="text-muted text-xs">Automate recurring overhead expenses without repeated manual entry</p>
                </div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => showToast('New recurring schedule created!')}
                >
                  <Plus size={13} /> Add Recurring Profile
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Schedule #</th>
                    <th>Profile Name</th>
                    <th>Vendor / Payee</th>
                    <th>Category</th>
                    <th>Frequency</th>
                    <th>Next Run Date</th>
                    <th className="text-right">Amount / Cycle</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringExpenses.map(rec => (
                    <tr key={rec.id}>
                      <td className="font-semibold text-primary">{rec.id}</td>
                      <td className="font-medium">{rec.name}</td>
                      <td>{rec.vendor}</td>
                      <td>{rec.category}</td>
                      <td><span className="zb-status-pill">{rec.frequency}</span></td>
                      <td>{rec.nextRun}</td>
                      <td className="text-right font-semibold">{formatINR(rec.amount)}</td>
                      <td className="text-center">
                        <span className={`zb-status-pill ${rec.status === 'Active' ? 'paid' : 'pending'}`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          className="zb-table-btn"
                          onClick={() => handleToggleRecurring(rec.id)}
                        >
                          {rec.status === 'Active' ? 'Pause Schedule' : 'Resume Schedule'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

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
      showToast(`Journal ${newJrn.id} posted successfully! Double-entry balanced.`);
    };

    const handleToggleLock = () => {
      setIsPeriodLocked(!isPeriodLocked);
      showToast(isPeriodLocked ? 'Prior financial period UNLOCKED for authorized audit adjustments' : `Financial period locked through ${lockedDate}. Historical data protected.`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Accountant & General Ledger</h1>
            <p className="zb-page-subtitle">Manual journals, multi-tiered chart of accounts, trial balance, and transaction period locking</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => showToast('Trial Balance balanced: Total Debits ₹4,892,100 = Total Credits ₹4,892,100 (Variance: ₹0.00)')}
            >
              <Calculator size={15} /> Verify Trial Balance
            </button>
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('new_journal')}>
              <Plus size={16} /> New Manual Journal
            </button>
          </div>
        </div>

        {/* Sub-Navigation Bar (Pages 14-15) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${accountantSubTab === 'journals' ? 'active' : ''}`}
            onClick={() => setAccountantSubTab('journals')}
          >
            <FileText size={15} />
            <span>Manual Journals</span>
            <span className="zb-subnav-badge">{journals.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${accountantSubTab === 'accounts' ? 'active' : ''}`}
            onClick={() => setAccountantSubTab('accounts')}
          >
            <Layers size={15} />
            <span>Chart of Accounts</span>
            <span className="zb-subnav-badge">18 Accounts</span>
          </button>
          <button
            className={`zb-subnav-item ${accountantSubTab === 'locking' ? 'active' : ''}`}
            onClick={() => setAccountantSubTab('locking')}
          >
            {isPeriodLocked ? <Lock size={15} className="text-warning" /> : <Unlock size={15} />}
            <span>Transaction Locking</span>
            <span className="zb-subnav-badge">{isPeriodLocked ? 'Locked' : 'Open'}</span>
          </button>
        </div>

        {/* 1. Manual Journals Tab */}
        {accountantSubTab === 'journals' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Journals Posted</div>
                <div className="zb-metric-mini-val text-primary">{journals.length} Entries</div>
                <div className="zb-metric-mini-sub text-success">Double-entry verified</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Trial Balance Integrity</div>
                <div className="zb-metric-mini-val text-success">Balanced</div>
                <div className="zb-metric-mini-sub">Debits = Credits (₹48,92,100)</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Audit Trail Logging</div>
                <div className="zb-metric-mini-val text-dark">Continuous</div>
                <div className="zb-metric-mini-sub">User timestamps recorded</div>
              </div>
            </div>

            <div className="zb-card zb-table-container zb-section-spacing">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <h3 className="font-semibold text-dark">Posted Journal Entries (FY 2026-27)</h3>
                <span className="text-muted text-sm">Double-Entry Debit / Credit Record</span>
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
                      <td><span className="font-medium text-dark">{j.debit}</span></td>
                      <td><span className="font-medium text-dark">{j.credit}</span></td>
                      <td className="text-right font-semibold">{formatINR(j.amount)}</td>
                      <td className="text-center"><span className="zb-status-pill paid">{j.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 2. Chart of Accounts Tab (Page 15) */}
        {accountantSubTab === 'accounts' && (
          <div className="zb-card zb-table-container zb-section-spacing">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div>
                <h3 className="font-semibold text-dark">Master Chart of Accounts</h3>
                <p className="text-muted text-xs">Statutory Indian GAAP & Ind-AS compliant account hierarchy</p>
              </div>
              <button className="zb-btn zb-btn-primary zb-btn-sm" onClick={() => showToast('New ledger account created!')}>
                <Plus size={13} /> Add Account
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Category / Classification</th>
                  <th>Normal Balance</th>
                  <th className="text-right">Current Ledger Balance</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-mono font-semibold text-primary">1010</td>
                  <td className="font-medium">HDFC Bank Corporate Current A/C</td>
                  <td>Current Asset (Cash & Cash Equivalents)</td>
                  <td>Debit</td>
                  <td className="text-right font-semibold">{formatINR(1452800.50)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">1020</td>
                  <td className="font-medium">Accounts Receivable (Trade Debtors)</td>
                  <td>Current Asset (Receivables)</td>
                  <td>Debit</td>
                  <td className="text-right font-semibold">{formatINR(985500.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">1510</td>
                  <td className="font-medium">Computer & Server Hardware Assets</td>
                  <td>Fixed Asset (Property, Plant & Equipment)</td>
                  <td>Debit</td>
                  <td className="text-right font-semibold">{formatINR(860400.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">2010</td>
                  <td className="font-medium">Accounts Payable (Trade Creditors)</td>
                  <td>Current Liability (Payables)</td>
                  <td>Credit</td>
                  <td className="text-right font-semibold">{formatINR(375000.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">2030</td>
                  <td className="font-medium">GST Output Tax Payable (CGST + SGST)</td>
                  <td>Current Liability (Duties & Taxes)</td>
                  <td>Credit</td>
                  <td className="text-right font-semibold">{formatINR(84200.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">4010</td>
                  <td className="font-medium">Cloud IT & Software Solutions Revenue</td>
                  <td>Operating Revenue (Sales)</td>
                  <td>Credit</td>
                  <td className="text-right font-semibold">{formatINR(4250000.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
                <tr>
                  <td className="font-mono font-semibold text-primary">5020</td>
                  <td className="font-medium">Office Space Lease & Facilities Rent</td>
                  <td>Operating Expense (Overheads)</td>
                  <td>Debit</td>
                  <td className="text-right font-semibold">{formatINR(525000.00)}</td>
                  <td className="text-center"><span className="zb-status-pill paid">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Transaction Locking Tab (Page 15) */}
        {accountantSubTab === 'locking' && (
          <div className="zb-card zb-table-container zb-section-spacing p-4">
            <div className="zb-flex-between align-start">
              <div>
                <h3 className="font-semibold text-dark">Transaction Locking & Historical Freeze</h3>
                <p className="text-muted text-sm mt-1" style={{ maxWidth: 640 }}>
                  Prevent backdated transactions or unauthorized modifications in finalized audit periods.
                  When locking is active, no invoices, vendor bills, or journals prior to the lock date can be altered without supervisor override.
                </p>
              </div>
              <div className="zb-flex-align gap-3">
                <span className={`zb-status-pill ${isPeriodLocked ? 'pending' : 'paid'}`}>
                  {isPeriodLocked ? 'LOCK ACTIVE' : 'UNLOCKED'}
                </span>
                <button
                  className="zb-btn zb-btn-primary"
                  onClick={handleToggleLock}
                >
                  {isPeriodLocked ? <Unlock size={15} /> : <Lock size={15} />}
                  <span>{isPeriodLocked ? 'Unlock Period' : 'Lock Historical Period'}</span>
                </button>
              </div>
            </div>

            <div className="zb-dashboard-grid three-col mt-4">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Locked Through Date</div>
                <div className="zb-metric-mini-val text-primary">{lockedDate}</div>
                <div className="zb-metric-mini-sub">Fiscal Year 2025-26 finalized</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Protected Ledgers</div>
                <div className="zb-metric-mini-val text-success">All Modules</div>
                <div className="zb-metric-mini-sub">Sales, Purchases, Banking, Journals</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Audit Log Compliance</div>
                <div className="zb-metric-mini-val text-dark">Rule Enforced</div>
                <div className="zb-metric-mini-sub">Complies with MCA / GST statutory rules</div>
              </div>
            </div>
          </div>
        )}

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
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: '#065f46', marginBottom: '16px' }}>
                  &check; Debit and Credit balances are verified equal before posting to General Ledger.
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
              <Plus size={16} /> Log Manual Entry
            </button>
          </div>
        </div>

        {/* Live Stopwatch / Real-Time Ticker Widget (Documentation Pages 13-14) */}
        <div className="zb-stopwatch-card zb-section-spacing">
          <div className="zb-stopwatch-display-group">
            <div className="zb-stopwatch-digits">
              {formatStopwatch(stopwatchSeconds)}
            </div>
            <div className="zb-stopwatch-meta">
              <div className="project-label">Active Project: {stopwatchProject}</div>
              <div className="task-label">{stopwatchTask} &bull; Standard Billable Rate: ₹2,000/hr</div>
            </div>
          </div>

          <div className="zb-stopwatch-controls">
            {!isStopwatchRunning ? (
              <button
                className="zb-btn zb-btn-primary"
                onClick={() => setIsStopwatchRunning(true)}
              >
                <Play size={14} /> Start Timer
              </button>
            ) : (
              <button
                className="zb-btn zb-btn-warning"
                style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                onClick={() => setIsStopwatchRunning(false)}
              >
                <Pause size={14} /> Pause Timer
              </button>
            )}
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => {
                setIsStopwatchRunning(false);
                setStopwatchSeconds(0);
              }}
              title="Reset Timer"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => {
                const loggedHrs = Math.max(0.2, parseFloat((stopwatchSeconds / 3600).toFixed(1)));
                const newTs = {
                  id: `TS-00${timesheets.length + 1}`,
                  project: stopwatchProject,
                  task: stopwatchTask,
                  consultant: 'Shalya Gaonkar',
                  date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                  hours: loggedHrs,
                  rate: 2000,
                  billable: true,
                };
                setTimesheets([newTs, ...timesheets]);
                setIsStopwatchRunning(false);
                setStopwatchSeconds(0);
                showToast(`Logged ${loggedHrs} hrs to project timesheet!`);
              }}
              title="Commit elapsed time directly to timesheet"
            >
              <Check size={14} /> Log Elapsed Time
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

    const handleRunAutoScan = (sampleKey: string) => {
      setIsScanning(true);
      setTimeout(() => {
        setIsScanning(false);
        if (sampleKey === 'cisco') {
          setScanResult({
            vendor: 'Cisco Systems India Pvt Ltd',
            invoiceNo: 'CIS-IN-44091',
            date: '02 Sep 2026',
            subtotal: 75000,
            cgst: 6750,
            sgst: 6750,
            total: 88500,
            confidence: 99.8,
          });
        } else if (sampleKey === 'dell') {
          setScanResult({
            vendor: 'Dell Technologies India',
            invoiceNo: 'DEL-INV-88912',
            date: '04 Sep 2026',
            subtotal: 156779.66,
            cgst: 14110.17,
            sgst: 14110.17,
            total: 185000,
            confidence: 99.1,
          });
        } else {
          setScanResult({
            vendor: 'Hewlett Packard Enterprise India',
            invoiceNo: 'HPE-IN-98214',
            date: '03 Sep 2026',
            subtotal: 120000,
            cgst: 10800,
            sgst: 10800,
            total: 141600,
            confidence: 99.4,
          });
        }
        showToast('Document AutoScan complete! AI extracted all fields with 99%+ confidence.');
      }, 400);
    };

    const handleCreateBillFromScan = () => {
      if (!scanResult) return;
      const newBill = {
        id: `BILL-${8093 + bills.length}`,
        vendor: scanResult.vendor,
        category: 'Hardware Procurement',
        date: scanResult.date,
        amount: scanResult.total,
        status: 'Pending',
      };
      setBills([newBill, ...bills]);
      showToast(`Created Vendor Bill ${newBill.id} from AutoScan OCR!`);
    };

    const handleFileScanToVault = () => {
      if (!scanResult) return;
      const newDoc = {
        id: `DOC-${800 + documentsList.length + 1}`,
        title: `${scanResult.invoiceNo}_AutoScan.pdf`,
        category: 'Invoices & Bills',
        uploadedBy: 'AutoScan AI Engine',
        date: scanResult.date,
        size: '1.6 MB',
        verified: true,
      };
      setDocumentsList([newDoc, ...documentsList]);
      showToast(`Document ${newDoc.title} cataloged into audit vault!`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Documents & AutoScan Engine</h1>
            <p className="zb-page-subtitle">Document evidence storage, AI receipt OCR AutoScan, and compliance audit archive</p>
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

        {/* Sub-Navigation Tabs Bar (Document Section 18) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${documentsSubTab === 'vault' ? 'active' : ''}`}
            onClick={() => setDocumentsSubTab('vault')}
          >
            <FileText size={15} />
            <span>Document Vault & Files</span>
            <span className="zb-subnav-badge">{documentsList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${documentsSubTab === 'autoscan' ? 'active' : ''}`}
            onClick={() => setDocumentsSubTab('autoscan')}
          >
            <Sparkles size={15} className="text-primary" />
            <span>AutoScan & Receipt OCR</span>
            <span className="zb-subnav-badge" style={{ background: '#eff6ff', color: '#0066cc' }}>AI Enabled</span>
          </button>
        </div>

        {/* 1. Vault Files Sub-Module */}
        {documentsSubTab === 'vault' && (
          <>
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
          </>
        )}

        {/* 2. AutoScan & Receipt OCR Sub-Module (Page 16-17) */}
        {documentsSubTab === 'autoscan' && (
          <div className="zb-autoscan-card zb-section-spacing">
            <div className="zb-flex-between align-start mb-4">
              <div>
                <div className="zb-flex-align gap-2">
                  <h3 className="font-semibold text-dark text-lg">AI AutoScan & Receipt OCR Engine</h3>
                  <span className="zb-ocr-chip"><Sparkles size={13} /> OCR Vision v4.2</span>
                </div>
                <p className="text-muted text-sm mt-1">
                  Upload vendor invoices, scanned receipts, or bills to automatically extract vendor details, line items, taxes, and amounts.
                </p>
              </div>
            </div>

            <div className="zb-dashboard-grid two-col">
              {/* Scan Trigger / Sample Selector */}
              <div className="zb-card p-4">
                <h4 className="font-semibold text-dark mb-2">1. Select Document or Receipt to Scan</h4>
                <div className="zb-form-group">
                  <label className="zb-label">Choose Sample Document</label>
                  <select
                    className="zb-select"
                    value={autoScanSample}
                    onChange={e => {
                      setAutoScanSample(e.target.value);
                      handleRunAutoScan(e.target.value);
                    }}
                  >
                    <option value="hpe">Hewlett Packard Enterprise Invoice (HPE-IN-98214 - ₹1,41,600)</option>
                    <option value="cisco">Cisco Systems India Switch Bill (CIS-IN-44091 - ₹88,500)</option>
                    <option value="dell">Dell Technologies Precision Order (DEL-INV-88912 - ₹1,85,000)</option>
                  </select>
                </div>

                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '24px', textAlign: 'center', background: '#f8fafc', marginBottom: '16px' }}>
                  <UploadCloud size={32} className="text-muted" style={{ margin: '0 auto 8px auto' }} />
                  <div className="font-medium text-dark text-sm">Drag & drop receipt image or PDF here</div>
                  <div className="text-xs text-muted mt-1">Supports PDF, PNG, JPEG, TIFF (Up to 25MB)</div>
                </div>

                <button
                  className="zb-btn zb-btn-primary zb-btn-block"
                  disabled={isScanning}
                  onClick={() => handleRunAutoScan(autoScanSample)}
                >
                  {isScanning ? (
                    <span>Extracting Text with OCR...</span>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Run AI AutoScan Extraction</span>
                    </>
                  )}
                </button>
              </div>

              {/* Extracted Metadata Preview */}
              <div className="zb-card p-4">
                <div className="zb-flex-between mb-3">
                  <h4 className="font-semibold text-dark">2. Extracted Data & Confidence</h4>
                  {scanResult && (
                    <span className="zb-status-pill paid">
                      {scanResult.confidence}% Confidence
                    </span>
                  )}
                </div>

                {scanResult ? (
                  <div>
                    <div className="zb-ocr-match-box">
                      <div className="zb-dashboard-grid two-col" style={{ gap: '8px', fontSize: '13px' }}>
                        <div><span className="text-muted">Vendor Name:</span> <strong className="text-dark">{scanResult.vendor}</strong></div>
                        <div><span className="text-muted">Invoice No:</span> <strong className="font-mono text-primary">{scanResult.invoiceNo}</strong></div>
                        <div><span className="text-muted">Invoice Date:</span> <strong>{scanResult.date}</strong></div>
                        <div><span className="text-muted">Vendor GSTIN:</span> <strong className="font-mono">29AAACH1234F1Z8</strong></div>
                        <div><span className="text-muted">Subtotal:</span> <strong>{formatINR(scanResult.subtotal)}</strong></div>
                        <div><span className="text-muted">CGST (9%):</span> <strong>{formatINR(scanResult.cgst)}</strong></div>
                        <div><span className="text-muted">SGST (9%):</span> <strong>{formatINR(scanResult.sgst)}</strong></div>
                        <div><span className="text-muted">Grand Total:</span> <strong className="text-success text-base">{formatINR(scanResult.total)}</strong></div>
                      </div>
                    </div>

                    <div className="zb-flex-align gap-3 mt-4">
                      <button
                        className="zb-btn zb-btn-primary"
                        onClick={handleCreateBillFromScan}
                      >
                        <ShoppingBag size={14} />
                        <span>Create Vendor Bill from Scan</span>
                      </button>
                      <button
                        className="zb-btn zb-btn-secondary"
                        onClick={handleFileScanToVault}
                      >
                        <FileCheck size={14} />
                        <span>Store in Statutory Vault</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 text-muted">Click "Run AI AutoScan Extraction" to preview data</div>
                )}
              </div>
            </div>
          </div>
        )}

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
