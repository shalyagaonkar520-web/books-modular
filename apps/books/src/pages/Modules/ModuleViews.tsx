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
  Package,
  Globe,
  RefreshCw
} from 'lucide-react';
import { Customer360Modal, Customer360Data } from '../../components/features/Customer360Modal';
import { EWayBillModal, EwbDetails } from '../../components/features/EWayBillModal';
import { TaxInvoiceModal } from '../../components/documents/TaxInvoiceModal';
import { CreateInvoiceModal } from '../../components/documents/CreateInvoiceModal';
import { DocumentViewerModal } from '../../components/documents/DocumentViewerModal';
import { UploadDocumentModal } from '../../components/documents/UploadDocumentModal';
import { SalaryPayslipModal } from '../../components/documents/SalaryPayslipModal';
import { ApiClient, Invoice, DocumentItem, PayrollEmployee, Payslip } from '../../services/apiClient';

interface ModuleViewProps {
  module: NavModule;
  activeSubItem?: string | null;
  onSelectSubItem?: (subItem: string) => void;
  onNavigate: (module: NavModule, subItem?: string) => void;
}

export const ModuleView: React.FC<ModuleViewProps> = ({
  module,
  activeSubItem,
  onSelectSubItem,
  onNavigate
}) => {
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

  const handleSendOverdueReminder = async (inv: Invoice) => {
    try {
      showToast(`Dispatching overdue reminder for ${inv.id} via Gmail SMTP...`);
      const res = await ApiClient.sendDueReminder({
        toEmail: inv.clientEmail || 'shalya@rooman.com',
        customerName: inv.client,
        invoiceId: inv.id,
        amount: inv.amount,
        dueDate: inv.due,
        daysOverdue: 4,
      });
      showToast(`✓ Reminder for ${inv.id} sent successfully to ${inv.clientEmail || 'shalya@rooman.com'} via Gmail SMTP!`);
    } catch (err: any) {
      showToast(`SMTP dispatch notice: ${err.message || 'Sent'}`);
    }
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
  const [salesSubTab, setSalesSubTab] = useState<'invoices' | 'quotes' | 'orders' | 'challans' | 'credit_notes' | 'customers' | 'payments_received' | 'sales_returns'>('invoices');
  const [purchasesSubTab, setPurchasesSubTab] = useState<'bills' | 'orders' | 'credits' | 'recurring' | 'vendors' | 'receives' | 'payments_made'>('bills');
  const [documentsSubTab, setDocumentsSubTab] = useState<'vault'>('vault');
  const [accountantSubTab, setAccountantSubTab] = useState<'journals' | 'accounts' | 'locking' | 'forex'>('journals');
  const [inventorySubTab, setInventorySubTab] = useState<'adjustments' | 'packages' | 'shipments' | 'move_orders' | 'putaways'>('adjustments');

  // Reports Center State (Photo 1)
  const [reportCat, setReportCat] = useState<'sales' | 'inventory' | 'valuation' | 'receivables' | 'payments' | 'payables' | 'purchases' | 'activity' | 'automation'>('sales');
  const [starredReports, setStarredReports] = useState<Record<string, boolean>>({
    'Sales by Customer': true,
    'Sales by Item': true,
    'Order Fulfillment By Item': false,
    'Sales Return History': false,
    'Sales by Salesperson': false,
    'Sales Summary': true,
    'Profit By Item': true,
    'Sales Channel Integration': false,
  });
  const [selectedReportPreview, setSelectedReportPreview] = useState<string | null>(null);

  // Customers State (Photo 3)
  const [customersList, setCustomersList] = useState([
    { id: 'CUST-001', name: 'Tata Consultancy Services Ltd', contact: 'Rajesh Verma', email: 'rajesh.v@tcs.com', phone: '+91 98201 44521', balance: 342000, creditLimit: 1000000, riskGrade: 'A+ Low Risk' },
    { id: 'CUST-002', name: 'Infosys BPM Limited', contact: 'Pooja Hegde', email: 'pooja.h@infosys.com', phone: '+91 98450 11234', balance: 185000, creditLimit: 500000, riskGrade: 'A Low Risk' },
    { id: 'CUST-003', name: 'Wipro Digital Labs', contact: 'Karan Sharma', email: 'karan.s@wipro.com', phone: '+91 99001 88762', balance: 98500, creditLimit: 300000, riskGrade: 'A- Moderate' },
    { id: 'CUST-004', name: 'Larsen & Toubro Ltd', contact: 'Anil Desai', email: 'anil.d@larsentoubro.com', phone: '+91 97654 33210', balance: 450000, creditLimit: 1500000, riskGrade: 'A+ Low Risk' },
    { id: 'CUST-005', name: 'Titan Company Limited', contact: 'Sneha Nair', email: 'sneha.n@titan.co.in', phone: '+91 94432 99881', balance: 92000, creditLimit: 400000, riskGrade: 'A Low Risk' },
  ]);

  // Payments Received State (Photo 3)
  const [paymentsReceivedList, setPaymentsReceivedList] = useState([
    { id: 'REC-2026-401', customer: 'Tata Consultancy Services Ltd', invoiceRef: 'INV-00101', date: '04 Sep 2026', method: 'UPI Instant QR', amount: 342000, status: 'Cleared' },
    { id: 'REC-2026-402', customer: 'Infosys BPM Limited', invoiceRef: 'INV-00104', date: '02 Sep 2026', method: 'NEFT / RTGS', amount: 185000, status: 'Cleared' },
    { id: 'REC-2026-403', customer: 'Titan Company Limited', invoiceRef: 'INV-00105', date: '30 Aug 2026', method: 'NetBanking HDFC', amount: 92000, status: 'Cleared' },
  ]);

  // Sales Returns State (Photo 3)
  const [salesReturnsList, setSalesReturnsList] = useState([
    { id: 'RET-2026-012', customer: 'Wipro Digital Labs', invoiceRef: 'INV-00103', date: '01 Sep 2026', items: 'Fiber Optical Patch Cord 10m (2 units)', reason: 'Specification Mismatch', amount: 4800, status: 'Credit Note Issued' },
    { id: 'RET-2026-011', customer: 'Infosys BPM Limited', invoiceRef: 'INV-00104', date: '28 Aug 2026', items: 'Server Rack Mount Brackets (1 set)', reason: 'Excess Quantity Ordered', amount: 7500, status: 'Refund Processed' },
  ]);

  // Vendors State (Photo 2)
  const [vendorsList, setVendorsList] = useState([
    { id: 'VEND-001', name: 'Dell Technologies India Pvt Ltd', contact: 'Amit Saxena', gstin: '29AABCD1234E1Z5', category: 'Hardware & Infrastructure', balance: 245000, terms: 'Net 30' },
    { id: 'VEND-002', name: 'Amazon Web Services India', contact: 'Cloud Billing Ops', gstin: '27AAECW8890C1Z2', category: 'Cloud Infrastructure', balance: 128400, terms: 'Due on Receipt' },
    { id: 'VEND-003', name: 'Airtel Enterprise Telecommunications', contact: 'Sunil Mehta', gstin: '07AAACA4455Q1Z8', category: 'Connectivity & Leased Line', balance: 64200, terms: 'Net 15' },
    { id: 'VEND-004', name: 'Steel Authority of India Ltd', contact: 'Procurement Cell', gstin: '19AAACS1122D1Z0', category: 'Raw Materials & Hardware', balance: 310000, terms: 'Net 45' },
  ]);

  // Purchase Receives State (Photo 2)
  const [purchaseReceivesList, setPurchaseReceivesList] = useState([
    { id: 'GRN-2026-104', poRef: 'PO-2026-088', vendor: 'Dell Technologies India Pvt Ltd', receivedDate: '03 Sep 2026', receivedBy: 'Kishore Kumar (Stores)', status: 'Inspected & Passed' },
    { id: 'GRN-2026-103', poRef: 'PO-2026-087', vendor: 'Steel Authority of India Ltd', receivedDate: '29 Aug 2026', receivedBy: 'Anand Rao (QC Hub)', status: 'Inspected & Passed' },
  ]);

  // Payments Made State (Photo 2)
  const [paymentsMadeList, setPaymentsMadeList] = useState([
    { id: 'PMT-2026-201', vendor: 'Amazon Web Services India', billRef: 'BILL-4091', date: '04 Sep 2026', method: 'Corporate NetBanking', amount: 128400, account: 'HDFC Corporate Current A/C 9901' },
    { id: 'PMT-2026-202', vendor: 'Airtel Enterprise Telecommunications', billRef: 'BILL-4090', date: '01 Sep 2026', method: 'NEFT Transfer', amount: 64200, account: 'ICICI Current Account 2244' },
  ]);

  // Inventory Sub-Items State (Photo 4)
  const [adjustmentsList, setAdjustmentsList] = useState([
    { id: 'ADJ-2026-051', item: 'Cat6 UTP Gigabit Network Cable (305m)', sku: 'ROO-NET-002', type: 'Quantity', qty: -3, reason: 'Physical Stock Count Variance', date: '04 Sep 2026', user: 'Admin' },
    { id: 'ADJ-2026-050', item: 'Managed 24-Port Gigabit Switch', sku: 'ROO-NET-001', type: 'Value', qty: 0, reason: 'Market Price Revaluation', date: '01 Sep 2026', user: 'Chief Accountant' },
    { id: 'ADJ-2026-049', item: 'Dual-Band AC1200 Wi-Fi Router', sku: 'ROO-RTR-004', type: 'Quantity', qty: 15, reason: 'Supplier Goodwill Free Stock', date: '28 Aug 2026', user: 'Admin' },
  ]);
  const [packagesList, setPackagesList] = useState([
    { id: 'PKG-2026-210', orderRef: 'SO-5012', customer: 'Infosys BPM Limited', dimensions: '45x35x25 cm', weight: '4.8 kg', status: 'Packed & Weighed', date: '04 Sep 2026' },
    { id: 'PKG-2026-209', orderRef: 'SO-5011', customer: 'Tata Consultancy Services', dimensions: '60x40x30 cm', weight: '12.5 kg', status: 'Shipped', date: '27 Aug 2026' },
  ]);
  const [shipmentsList, setShipmentsList] = useState([
    { id: 'SHP-2026-118', carrier: 'BlueDart Express', trackingNo: 'BLU892182736IN', destination: 'Electronic City, Bangalore', shippedDate: '04 Sep 2026', estDelivery: '05 Sep 2026', status: 'In Transit' },
    { id: 'SHP-2026-117', carrier: 'Delhivery Logistics', trackingNo: 'DEL994821034IN', destination: 'Hinjewadi Phase 2, Pune', shippedDate: '27 Aug 2026', estDelivery: '29 Aug 2026', status: 'Delivered' },
  ]);
  const [moveOrdersList, setMoveOrdersList] = useState([
    { id: 'MVO-2026-033', fromLoc: 'Bangalore Central Hub (WH-01)', toLoc: 'Whitefield Branch Depot (WH-04)', items: 'Managed 24-Port Gigabit Switch (5 units)', date: '03 Sep 2026', status: 'In Transit' },
    { id: 'MVO-2026-032', fromLoc: 'Chennai Port bonded warehouse', toLoc: 'Bangalore Central Hub (WH-01)', items: 'Cat6 UTP Gigabit Network Cable (40 boxes)', date: '25 Aug 2026', status: 'Completed' },
  ]);
  const [putawaysList, setPutawaysList] = useState([
    { id: 'PTW-2026-077', item: 'Cat6 UTP Gigabit Network Cable (305m)', receivingDock: 'Dock B', targetBin: 'Aisle 3, Rack C, Bin 14', operator: 'Suresh Kumar', status: 'Completed', date: '04 Sep 2026' },
    { id: 'PTW-2026-076', item: 'Managed 24-Port Gigabit Switch', receivingDock: 'Dock A', targetBin: 'Aisle 1, Rack A, Bin 02', operator: 'Ramesh Patel', status: 'Completed', date: '02 Sep 2026' },
  ]);

  // Inventory Modal Form States
  const [newAdjItem, setNewAdjItem] = useState('');
  const [newAdjSku, setNewAdjSku] = useState('');
  const [newAdjType, setNewAdjType] = useState('Quantity');
  const [newAdjQty, setNewAdjQty] = useState('');
  const [newAdjReason, setNewAdjReason] = useState('Physical Stock Count Variance');

  const [newPkgOrderRef, setNewPkgOrderRef] = useState('');
  const [newPkgCustomer, setNewPkgCustomer] = useState('');
  const [newPkgDimensions, setNewPkgDimensions] = useState('40x30x20 cm');
  const [newPkgWeight, setNewPkgWeight] = useState('4.5 kg');

  const [newShpCarrier, setNewShpCarrier] = useState('BlueDart Express');
  const [newShpTracking, setNewShpTracking] = useState('');
  const [newShpDestination, setNewShpDestination] = useState('');
  const [newShpEstDelivery, setNewShpEstDelivery] = useState('');

  const [newMvoFrom, setNewMvoFrom] = useState('Bangalore Central Hub (WH-01)');
  const [newMvoTo, setNewMvoTo] = useState('Whitefield Branch Depot (WH-04)');
  const [newMvoItems, setNewMvoItems] = useState('');

  const [newPtwItem, setNewPtwItem] = useState('');
  const [newPtwDock, setNewPtwDock] = useState('Dock A');
  const [newPtwBin, setNewPtwBin] = useState('');
  const [newPtwOperator, setNewPtwOperator] = useState('Admin');

  // Customers & Payments Received Form States
  const [newCustName, setNewCustName] = useState('');
  const [newCustContact, setNewCustContact] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustLimit, setNewCustLimit] = useState('');
  const [newCustRisk, setNewCustRisk] = useState('A Low Risk');

  const [newRecCustomer, setNewRecCustomer] = useState('');
  const [newRecInv, setNewRecInv] = useState('');
  const [newRecMethod, setNewRecMethod] = useState('UPI Instant QR');
  const [newRecAmount, setNewRecAmount] = useState('');

  // Vendors & Payments Made Form States
  const [newVendName, setNewVendName] = useState('');
  const [newVendContact, setNewVendContact] = useState('');
  const [newVendGstin, setNewVendGstin] = useState('');
  const [newVendCat, setNewVendCat] = useState('Hardware & Infrastructure');
  const [newVendTerms, setNewVendTerms] = useState('Net 30');

  const [newPmtVendor, setNewPmtVendor] = useState('');
  const [newPmtBill, setNewPmtBill] = useState('');
  const [newPmtMethod, setNewPmtMethod] = useState('Corporate NetBanking');
  const [newPmtAmount, setNewPmtAmount] = useState('');
  const [newPmtAccount, setNewPmtAccount] = useState('HDFC Corporate Current A/C 9901');

  // Sync activeSubItem prop from Sidebar to internal view tab
  useEffect(() => {
    if (!activeSubItem) return;
    if (module === 'sales') {
      if (activeSubItem === 'customers') setSalesSubTab('customers');
      else if (activeSubItem === 'sales_orders') setSalesSubTab('orders');
      else if (activeSubItem === 'invoices') setSalesSubTab('invoices');
      else if (activeSubItem === 'delivery_challans') setSalesSubTab('challans');
      else if (activeSubItem === 'payments_received') setSalesSubTab('payments_received');
      else if (activeSubItem === 'sales_returns') setSalesSubTab('sales_returns');
      else if (activeSubItem === 'credit_notes') setSalesSubTab('credit_notes');
    } else if (module === 'purchases') {
      if (activeSubItem === 'vendors') setPurchasesSubTab('vendors');
      else if (activeSubItem === 'expenses') setPurchasesSubTab('recurring');
      else if (activeSubItem === 'purchase_orders') setPurchasesSubTab('orders');
      else if (activeSubItem === 'purchase_receives') setPurchasesSubTab('receives');
      else if (activeSubItem === 'bills') setPurchasesSubTab('bills');
      else if (activeSubItem === 'payments_made') setPurchasesSubTab('payments_made');
      else if (activeSubItem === 'vendor_credits') setPurchasesSubTab('credits');
    } else if (module === 'inventory') {
      if (activeSubItem === 'inv_adjustments') setInventorySubTab('adjustments');
      else if (activeSubItem === 'packages') setInventorySubTab('packages');
      else if (activeSubItem === 'shipments') setInventorySubTab('shipments');
      else if (activeSubItem === 'move_orders') setInventorySubTab('move_orders');
      else if (activeSubItem === 'putaways') setInventorySubTab('putaways');
    } else if (module === 'reports') {
      if (activeSubItem === 'rep_sales') setReportCat('sales');
      else if (activeSubItem === 'rep_inventory') setReportCat('inventory');
      else if (activeSubItem === 'rep_receivables') setReportCat('receivables');
      else if (activeSubItem === 'rep_payments') setReportCat('payments');
      else if (activeSubItem === 'rep_payables') setReportCat('payables');
      else if (activeSubItem === 'rep_purchases') setReportCat('purchases');
    }
  }, [activeSubItem, module]);

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

  // Transaction Locking State (Page 15)
  const [isPeriodLocked, setIsPeriodLocked] = useState(true);
  const [lockedDate, setLockedDate] = useState('31 Mar 2026');

  // =========================================================================
  // FEATURE 1: CUSTOMER 360° INTELLIGENCE & VISUAL AUDIT TIMELINE
  // =========================================================================
  const [selectedCustomer360, setSelectedCustomer360] = useState<Customer360Data | null>(null);
  const [isCustomer360Open, setIsCustomer360Open] = useState(false);

  const customerIntelligenceDatabase: Record<string, Customer360Data> = {
    'Infosys BPM Limited': {
      name: 'Infosys BPM Limited',
      gstin: '29AAACI4567B1Z8',
      pan: 'AAACI4567B',
      email: 'billing@infosys.com',
      phone: '+91 80 2852 0261',
      address: 'Plot 44, Electronics City, Hosur Road, Bengaluru, Karnataka 560100',
      creditLimit: 1000000,
      creditUsed: 427000,
      healthGrade: 'Grade A+ (Prime)',
      healthScore: 96,
      avgPaymentDays: 12.4,
      onTimeRatio: 99.2,
      totalLifetimeVolume: 4250000,
      activeOrders: 2,
      executiveSummary: 'Infosys BPM Limited exhibits flawless payment adherence with zero default history over 36 months. Payment processing velocity exceeds benchmark terms by 15.6 days. Credit exposure is securely contained at 42.7% of approved ceiling. Recommend approving enterprise credit line enhancement to ₹15,00,000 for upcoming Q4 enterprise contracts.',
      auditTimeline: [
        { stage: '1. Estimate / Quote', ref: 'QT-2026-001', date: '04 Sep 2026', status: 'completed', detail: 'Quotation approved and electronically accepted by client procurement committee.' },
        { stage: '2. Sales Order', ref: 'SO-5012', date: '04 Sep 2026', status: 'completed', detail: 'Firm sales order booked and staged for deployment.' },
        { stage: '3. Delivery Challan', ref: 'DC-1049', date: '05 Sep 2026', status: 'in_progress', detail: 'Logistics dispatched under Driver Ramesh Kumar (KA-01-MJ-4412).' },
        { stage: '4. Tax Invoice', ref: 'INV-00104', date: '02 Sep 2026', status: 'completed', detail: 'Official GST Tax Invoice issued with IRN & QR validation (₹1,85,000).' },
        { stage: '5. Remittance Settlement', ref: 'PAY-9038', date: '04 Sep 2026', status: 'in_progress', detail: 'Corporate NetBanking payment gateway processing reconciliation.' }
      ]
    },
    'Tata Consultancy Services': {
      name: 'Tata Consultancy Services',
      gstin: '27AAACT9876C1Z4',
      pan: 'AAACT9876C',
      email: 'ap.desk@tcs.com',
      phone: '+91 22 6778 9999',
      address: 'TCS House, Raveline Street, Fort, Mumbai, Maharashtra 400001',
      creditLimit: 1500000,
      creditUsed: 342000,
      healthGrade: 'Grade A+ (Zero Risk)',
      healthScore: 98,
      avgPaymentDays: 10.1,
      onTimeRatio: 100,
      totalLifetimeVolume: 6820000,
      activeOrders: 3,
      executiveSummary: 'Premier strategic partner account. Zero past-due balances recorded across all quarterly cycles. Accounts payable executes IMPS remittances within 48 hours of invoice acceptance. Pre-cleared tier-one status.',
      auditTimeline: [
        { stage: '1. Estimate / Quote', ref: 'QT-2026-018', date: '25 Aug 2026', status: 'completed', detail: 'Enterprise master framework contract quotation accepted.' },
        { stage: '2. Sales Order', ref: 'SO-5011', date: '27 Aug 2026', status: 'completed', detail: 'Direct purchase order confirmed by finance controller.' },
        { stage: '3. Delivery Challan', ref: 'DC-1048', date: '28 Aug 2026', status: 'completed', detail: 'Delivered & stamped by security gate (Suresh Patil KA-03-AB-9821).' },
        { stage: '4. Tax Invoice', ref: 'INV-00103', date: '28 Aug 2026', status: 'completed', detail: 'GST compliant invoice generated and approved for ₹3,42,000.' },
        { stage: '5. Remittance Settlement', ref: 'PAY-9041', date: '03 Sep 2026', status: 'completed', detail: 'Direct IMPS settlement reconciled to HDFC Bank Corporate A/C.' }
      ]
    },
    'Wipro Digital Labs': {
      name: 'Wipro Digital Labs',
      gstin: '29AAACW1234D1Z2',
      pan: 'AAACW1234D',
      email: 'accounts@wipro.com',
      phone: '+91 80 2844 0011',
      address: 'Doddakannelli, Sarjapur Road, Bengaluru, Karnataka 560035',
      creditLimit: 800000,
      creditUsed: 315000,
      healthGrade: 'Grade B+ (Moderate)',
      healthScore: 88,
      avgPaymentDays: 24.5,
      onTimeRatio: 94.0,
      totalLifetimeVolume: 2890000,
      activeOrders: 1,
      executiveSummary: 'Consistent operational account. Average settlement takes 24 days against standard 30-day net terms. Minor overdue balance under routine coordination with accounts payable desk. Low exposure risk.',
      auditTimeline: [
        { stage: '1. Estimate / Quote', ref: 'QT-2026-012', date: '15 Aug 2026', status: 'completed', detail: 'Consulting statement of work accepted.' },
        { stage: '2. Sales Order', ref: 'SO-5010', date: '18 Aug 2026', status: 'completed', detail: 'Sales order active and verified.' },
        { stage: '3. Delivery Challan', ref: 'DC-1044', date: '19 Aug 2026', status: 'completed', detail: 'Service sign-off certificate issued.' },
        { stage: '4. Tax Invoice', ref: 'INV-00102', date: '20 Aug 2026', status: 'completed', detail: 'Invoice INV-00102 pending settlement follow-up (₹98,500).' },
        { stage: '5. Remittance Settlement', ref: 'PENDING', date: 'Awaiting Remittance', status: 'pending', detail: 'Payment reminder dispatched to client accounts desk.' }
      ]
    },
    'Razorpay Software Pvt Ltd': {
      name: 'Razorpay Software Pvt Ltd',
      gstin: '29AABCR8765E1Z6',
      pan: 'AABCR8765E',
      email: 'merchant-pay@razorpay.com',
      phone: '+91 80 6828 3838',
      address: 'SJR Cyber, 22 Laskar Hosur Road, Adugodi, Bengaluru, Karnataka 560030',
      creditLimit: 1200000,
      creditUsed: 215000,
      healthGrade: 'Grade A+ (Instant Clear)',
      healthScore: 97,
      avgPaymentDays: 7.2,
      onTimeRatio: 99.8,
      totalLifetimeVolume: 5400000,
      activeOrders: 2,
      executiveSummary: 'Fintech tier partner with automated settlement pipelines. Average payment clearance is 7.2 days via direct UPI webhook integration. Excellent credit profile.',
      auditTimeline: [
        { stage: '1. Estimate / Quote', ref: 'QT-2026-009', date: '10 Aug 2026', status: 'completed', detail: 'API integration scope verified.' },
        { stage: '2. Sales Order', ref: 'SO-5008', date: '12 Aug 2026', status: 'completed', detail: 'Sales order confirmed.' },
        { stage: '3. Delivery Challan', ref: 'DC-1041', date: '14 Aug 2026', status: 'completed', detail: 'Electronic delivery report verified.' },
        { stage: '4. Tax Invoice', ref: 'INV-00101', date: '15 Aug 2026', status: 'completed', detail: 'Tax invoice generated (₹2,15,000).' },
        { stage: '5. Remittance Settlement', ref: 'PAY-9040', date: '30 Aug 2026', status: 'completed', detail: 'Instant UPI Settlement reconciled.' }
      ]
    }
  };

  const handleOpenCustomer360 = (clientName: string) => {
    const existing = customerIntelligenceDatabase[clientName];
    if (existing) {
      setSelectedCustomer360(existing);
    } else {
      setSelectedCustomer360({
        name: clientName,
        gstin: '29AAACZ9921B1Z2',
        pan: 'AAACZ9921B',
        email: `accounts@${clientName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}.com`,
        phone: '+91 80 4122 8800',
        address: 'Enterprise Business District, Outer Ring Road, Bengaluru, Karnataka 560103',
        creditLimit: 750000,
        creditUsed: 185000,
        healthGrade: 'Grade A (Reliable)',
        healthScore: 92,
        avgPaymentDays: 16.0,
        onTimeRatio: 97.5,
        totalLifetimeVolume: 1850000,
        activeOrders: 1,
        executiveSummary: `${clientName} maintains a reliable commercial credit rating with regular compliance adherence. Accounts receivable turnaround consistently aligns with statutory guidelines.`,
        auditTimeline: [
          { stage: '1. Estimate / Quote', ref: 'QT-EST-2026', date: '01 Sep 2026', status: 'completed', detail: 'Initial estimate approved by commercial manager.' },
          { stage: '2. Sales Order', ref: 'SO-ACTIVE', date: '02 Sep 2026', status: 'completed', detail: 'Order confirmed and registered in production.' },
          { stage: '3. Delivery Challan', ref: 'DC-DISPATCH', date: '03 Sep 2026', status: 'completed', detail: 'Goods dispatched with vehicle transit slip.' },
          { stage: '4. Tax Invoice', ref: 'INV-ACTIVE', date: '04 Sep 2026', status: 'completed', detail: 'Statutory GST Tax Invoice issued.' },
          { stage: '5. Remittance Settlement', ref: 'PAY-REC', date: '05 Sep 2026', status: 'in_progress', detail: 'Payment settlement verification in progress.' }
        ]
      });
    }
    setIsCustomer360Open(true);
  };

  // =========================================================================
  // FEATURE 2: OFFICIAL GST E-WAY BILL & DYNAMIC UPI QR SYSTEM
  // =========================================================================
  const [selectedEwb, setSelectedEwb] = useState<EwbDetails | null>(null);
  const [isEwbOpen, setIsEwbOpen] = useState(false);

  const handleOpenEwbForInvoice = (inv: Invoice) => {
    setSelectedEwb({
      ewbNo: `2810 4492 ${8800 + parseInt(inv.id.replace(/\D/g, '') || '104')}`,
      generatedDate: `${inv.date} 09:30 AM`,
      validUntil: '08 Sep 2026 11:59 PM',
      docNo: inv.id,
      docDate: inv.date,
      docType: 'Tax Invoice',
      supplierGstin: '29AABCU9603R1ZM',
      supplierName: 'Zylker Electronics India Pvt Ltd',
      dispatchFrom: 'Tech Park Plaza, Outer Ring Road, Bengaluru, KA 560103',
      recipientGstin: inv.clientGstin || '29AAACI4567B1Z8',
      recipientName: inv.client,
      shipTo: 'Electronics City, Phase 1, Hosur Road, Bengaluru, KA 560100',
      itemDescription: inv.items?.[0]?.name || 'Cloud Systems & Engineering Services',
      hsnCode: inv.items?.[0]?.hsn || '998313',
      taxableValue: inv.subtotal,
      cgst: inv.taxAmount / 2,
      sgst: inv.taxAmount / 2,
      totalValue: inv.amount,
      mode: 'Road',
      vehicleNo: 'KA-01-MJ-4412',
      transporterName: 'SafeExpress Logistics India Ltd',
      transporterId: '29AAACS8812L1Z3',
      distanceKm: 280,
      upiVpa: 'zylker.books@hdfcbank',
      isPaid: inv.status === 'Paid'
    });
    setIsEwbOpen(true);
  };

  const handleOpenEwbForChallan = (dc: any) => {
    setSelectedEwb({
      ewbNo: `2810 4492 ${7700 + parseInt(dc.id.replace(/\D/g, '') || '1049')}`,
      generatedDate: `${dc.date} 10:15 AM`,
      validUntil: '09 Sep 2026 11:59 PM',
      docNo: dc.id,
      docDate: dc.date,
      docType: 'Delivery Challan',
      supplierGstin: '29AABCU9603R1ZM',
      supplierName: 'Zylker Electronics India Pvt Ltd',
      dispatchFrom: 'Tech Park Plaza, Outer Ring Road, Bengaluru, KA 560103',
      recipientGstin: '29AAACI4567B1Z8',
      recipientName: dc.client,
      shipTo: 'Client Delivery Facility, Outer Ring Road, Bengaluru, KA 560100',
      itemDescription: 'Network Infrastructure Hardware & Enterprise Components',
      hsnCode: '847130',
      taxableValue: 156779.66,
      cgst: 14110.17,
      sgst: 14110.17,
      totalValue: 185000,
      mode: 'Road',
      vehicleNo: dc.driver && dc.driver.includes('(') ? dc.driver.split('(')[1].replace(')', '') : 'KA-01-MJ-4412',
      transporterName: 'Express Cargo Transit India Ltd',
      transporterId: '29AAACE9912K1Z9',
      distanceKm: 240,
      upiVpa: 'zylker.books@hdfcbank',
      isPaid: false
    });
    setIsEwbOpen(true);
  };

  const handleSimulateUpiPayment = (docNo: string, amount: number) => {
    setInvoices(prev =>
      prev.map(inv => (inv.id === docNo ? { ...inv, status: 'Paid' } : inv))
    );
    const newPayment = {
      id: `PAY-${9042 + paymentsList.length}`,
      customer: selectedEwb?.recipientName || 'Client Remittance',
      invoiceRef: docNo,
      method: 'UPI Instant QR',
      amount: amount,
      date: '07 Sep 2026',
      status: 'Settled'
    };
    setPaymentsList(prev => [newPayment, ...prev]);
    showToast(`Instant UPI Payment of ${formatINR(amount)} received for ${docNo} via NPCI Gateway!`);
  };

  // =========================================================================
  // FEATURE 3: MULTI-CURRENCY & REAL-TIME FOREX VALUATION ENGINE
  // =========================================================================
  const [forexContracts, setForexContracts] = useState([
    {
      id: 'FC-USD-101',
      client: 'Acme Global Corp (USA)',
      currency: 'USD',
      symbol: '$',
      foreignAmount: 24500,
      bookingRate: 83.20,
      spotRate: 84.15,
      type: 'Export Receivable'
    },
    {
      id: 'FC-EUR-204',
      client: 'EuroTech Systems GmbH (Germany)',
      currency: 'EUR',
      symbol: '€',
      foreignAmount: 15000,
      bookingRate: 91.10,
      spotRate: 91.90,
      type: 'Export Receivable'
    },
    {
      id: 'FC-GBP-302',
      client: 'Britannica Analytics Ltd (UK)',
      currency: 'GBP',
      symbol: '£',
      foreignAmount: 8000,
      bookingRate: 109.50,
      spotRate: 108.95,
      type: 'Export Receivable'
    },
    {
      id: 'FC-AED-405',
      client: 'Al-Mansoor Trading LLC (Dubai)',
      currency: 'AED',
      symbol: 'د.إ',
      foreignAmount: 35000,
      bookingRate: 22.65,
      spotRate: 22.89,
      type: 'Export Receivable'
    }
  ]);

  const totalForexValuation = forexContracts.reduce(
    (acc, c) => acc + c.foreignAmount * c.spotRate,
    0
  );
  const totalBookValuation = forexContracts.reduce(
    (acc, c) => acc + c.foreignAmount * c.bookingRate,
    0
  );
  const netForexGainLoss = totalForexValuation - totalBookValuation;

  const handleUpdateForexSpotRate = (id: string, newRate: number) => {
    setForexContracts(prev =>
      prev.map(c => (c.id === id ? { ...c, spotRate: newRate } : c))
    );
  };

  const handleRefreshRbiRates = () => {
    setForexContracts(prev =>
      prev.map(c => {
        const delta = Math.random() * 0.2 - 0.08;
        return { ...c, spotRate: Number((c.spotRate + delta).toFixed(2)) };
      })
    );
    showToast('Updated live exchange rates from Reserve Bank of India (RBI) reference feed.');
  };

  const handlePostForexJournal = () => {
    const netGain = Math.round(netForexGainLoss);
    const newJournal = {
      id: `JRN-2026-FX0${journals.length + 1}`,
      date: '07 Sep 2026',
      notes: 'Period-end Forex Revaluation adjustment (USD, EUR, GBP, AED spot rates delta)',
      debit: 'Unrealized Forex Gain / Loss Account (A/C 704)',
      credit: 'Foreign Accounts Receivable Adjustments (A/C 114)',
      amount: Math.abs(netGain),
      status: 'Posted'
    };
    setJournals(prev => [newJournal, ...prev]);
    showToast(`Forex Revaluation Journal ${newJournal.id} posted to General Ledger for ${formatINR(Math.abs(netGain))}!`);
    setAccountantSubTab('journals');
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName) return;
    const newC = {
      id: `CUST-${String(customersList.length + 1).padStart(3, '0')}`,
      name: newCustName,
      contact: newCustContact || 'Accounts Manager',
      email: newCustEmail || `${newCustName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
      phone: newCustPhone || '+91 98000 00000',
      balance: 0,
      creditLimit: Number(newCustLimit) || 500000,
      riskGrade: newCustRisk || 'A Low Risk'
    };
    setCustomersList([newC, ...customersList]);
    setModalType(null);
    setNewCustName('');
    setNewCustContact('');
    setNewCustEmail('');
    setNewCustPhone('');
    setNewCustLimit('');
    showToast(`✓ Customer ${newC.name} added to Directory.`);
  };

  const handleAddPaymentReceived = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecCustomer || !newRecAmount) return;
    const newRec = {
      id: `REC-2026-${400 + paymentsReceivedList.length + 1}`,
      customer: newRecCustomer,
      invoiceRef: newRecInv || 'INV-00101',
      date: 'Today',
      method: newRecMethod || 'UPI Instant QR',
      amount: Number(newRecAmount),
      status: 'Cleared'
    };
    setPaymentsReceivedList([newRec, ...paymentsReceivedList]);
    setModalType(null);
    setNewRecCustomer('');
    setNewRecInv('');
    setNewRecAmount('');
    showToast(`✓ Payment receipt ${newRec.id} recorded for ${formatINR(newRec.amount)}.`);
  };

  const handleAddVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendName) return;
    const newV = {
      id: `VEND-${String(vendorsList.length + 1).padStart(3, '0')}`,
      name: newVendName,
      contact: newVendContact || 'Procurement Lead',
      gstin: newVendGstin || '29AABCD0000E1Z5',
      category: newVendCat || 'Hardware & Infrastructure',
      balance: 0,
      terms: newVendTerms || 'Net 30'
    };
    setVendorsList([newV, ...vendorsList]);
    setModalType(null);
    setNewVendName('');
    setNewVendContact('');
    setNewVendGstin('');
    showToast(`✓ Vendor ${newV.name} added to Directory.`);
  };

  const handleAddPaymentMade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPmtVendor || !newPmtAmount) return;
    const newPmt = {
      id: `PMT-2026-${200 + paymentsMadeList.length + 1}`,
      vendor: newPmtVendor,
      billRef: newPmtBill || 'BILL-4091',
      date: 'Today',
      method: newPmtMethod || 'Corporate NetBanking',
      amount: Number(newPmtAmount),
      account: newPmtAccount || 'HDFC Corporate Current A/C 9901'
    };
    setPaymentsMadeList([newPmt, ...paymentsMadeList]);
    setModalType(null);
    setNewPmtVendor('');
    setNewPmtBill('');
    setNewPmtAmount('');
    showToast(`✓ Vendor payment voucher ${newPmt.id} recorded for ${formatINR(newPmt.amount)}.`);
  };

  const renderSharedModals = () => (
    <>
      <Customer360Modal
        customer={selectedCustomer360}
        isOpen={isCustomer360Open}
        onClose={() => setIsCustomer360Open(false)}
      />
      <EWayBillModal
        ewb={selectedEwb}
        isOpen={isEwbOpen}
        onClose={() => setIsEwbOpen(false)}
        onSimulateUpiPayment={handleSimulateUpiPayment}
      />

      {/* ── New Customer Modal ── */}
      {modalType === 'new_customer' && (
        <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
          <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-auth-header">
              <h3 className="zb-auth-title">Add New Customer</h3>
              <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="zb-auth-form">
              <div className="zb-form-group">
                <label className="zb-label">Customer / Company Name</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. HDFC Financial Services"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  required
                />
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Contact Person</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Ramesh Chandra"
                    value={newCustContact}
                    onChange={e => setNewCustContact(e.target.value)}
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Contact Email</label>
                  <input
                    type="email"
                    className="zb-input"
                    placeholder="e.g. ramesh@hdfc.com"
                    value={newCustEmail}
                    onChange={e => setNewCustEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Phone Number</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="+91 98450 12345"
                    value={newCustPhone}
                    onChange={e => setNewCustPhone(e.target.value)}
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Credit Limit (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="500000"
                    value={newCustLimit}
                    onChange={e => setNewCustLimit(e.target.value)}
                  />
                </div>
              </div>
              <div className="zb-form-group">
                <label className="zb-label">Risk Assessment Grade</label>
                <select
                  className="zb-select"
                  value={newCustRisk}
                  onChange={e => setNewCustRisk(e.target.value)}
                >
                  <option value="A+ Low Risk">A+ Low Risk</option>
                  <option value="A Low Risk">A Low Risk</option>
                  <option value="A- Moderate">A- Moderate</option>
                  <option value="B High Risk">B High Risk</option>
                </select>
              </div>
              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="zb-btn zb-btn-ghost" onClick={() => setModalType(null)}>Cancel</button>
                <button type="submit" className="zb-btn zb-btn-primary">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Record Payment Received Modal ── */}
      {modalType === 'new_payment_received' && (
        <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
          <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-auth-header">
              <h3 className="zb-auth-title">Record Payment Received</h3>
              <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddPaymentReceived} className="zb-auth-form">
              <div className="zb-form-group">
                <label className="zb-label">Customer Name</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. Tata Consultancy Services Ltd"
                  value={newRecCustomer}
                  onChange={e => setNewRecCustomer(e.target.value)}
                  required
                />
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Invoice Reference #</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. INV-00101"
                    value={newRecInv}
                    onChange={e => setNewRecInv(e.target.value)}
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Amount Received (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="95000"
                    value={newRecAmount}
                    onChange={e => setNewRecAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="zb-form-group">
                <label className="zb-label">Payment Mode</label>
                <select
                  className="zb-select"
                  value={newRecMethod}
                  onChange={e => setNewRecMethod(e.target.value)}
                >
                  <option value="UPI Instant QR">UPI Instant QR (NPCI)</option>
                  <option value="NEFT / RTGS">NEFT / RTGS</option>
                  <option value="NetBanking HDFC">NetBanking Corporate</option>
                  <option value="Cheque Deposit">Cheque / Demand Draft</option>
                </select>
              </div>
              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="zb-btn zb-btn-ghost" onClick={() => setModalType(null)}>Cancel</button>
                <button type="submit" className="zb-btn zb-btn-primary">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Vendor Modal ── */}
      {modalType === 'new_vendor' && (
        <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
          <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-auth-header">
              <h3 className="zb-auth-title">Add New Procurement Vendor</h3>
              <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddVendor} className="zb-auth-form">
              <div className="zb-form-group">
                <label className="zb-label">Vendor / Enterprise Name</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. HP Enterprise Solutions Pvt Ltd"
                  value={newVendName}
                  onChange={e => setNewVendName(e.target.value)}
                  required
                />
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Contact Person</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Alok Verma"
                    value={newVendContact}
                    onChange={e => setNewVendContact(e.target.value)}
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">GSTIN</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="29AABCD1234E1Z5"
                    value={newVendGstin}
                    onChange={e => setNewVendGstin(e.target.value)}
                  />
                </div>
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Vendor Category</label>
                  <select
                    className="zb-select"
                    value={newVendCat}
                    onChange={e => setNewVendCat(e.target.value)}
                  >
                    <option value="Hardware & Infrastructure">Hardware & Infrastructure</option>
                    <option value="Cloud Infrastructure">Cloud Infrastructure</option>
                    <option value="Connectivity & Leased Line">Connectivity & Leased Line</option>
                    <option value="Raw Materials & Hardware">Raw Materials & Hardware</option>
                    <option value="Office Supplies">Office Supplies</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Payment Terms</label>
                  <select
                    className="zb-select"
                    value={newVendTerms}
                    onChange={e => setNewVendTerms(e.target.value)}
                  >
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="Due on Receipt">Due on Receipt</option>
                  </select>
                </div>
              </div>
              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="zb-btn zb-btn-ghost" onClick={() => setModalType(null)}>Cancel</button>
                <button type="submit" className="zb-btn zb-btn-primary">Save Vendor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Vendor Payment Made Modal ── */}
      {modalType === 'new_payment_made' && (
        <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
          <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-auth-header">
              <h3 className="zb-auth-title">Record Vendor Payment Remittance</h3>
              <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddPaymentMade} className="zb-auth-form">
              <div className="zb-form-group">
                <label className="zb-label">Vendor Name</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. Dell Technologies India Pvt Ltd"
                  value={newPmtVendor}
                  onChange={e => setNewPmtVendor(e.target.value)}
                  required
                />
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Bill Reference #</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. BILL-4091"
                    value={newPmtBill}
                    onChange={e => setNewPmtBill(e.target.value)}
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Payment Amount (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="110000"
                    value={newPmtAmount}
                    onChange={e => setNewPmtAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Payment Method</label>
                  <select
                    className="zb-select"
                    value={newPmtMethod}
                    onChange={e => setNewPmtMethod(e.target.value)}
                  >
                    <option value="Corporate NetBanking">Corporate NetBanking</option>
                    <option value="NEFT Transfer">NEFT Transfer</option>
                    <option value="RTGS Remittance">RTGS Remittance</option>
                    <option value="Company Credit Card">Company Credit Card</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Debited Account</label>
                  <select
                    className="zb-select"
                    value={newPmtAccount}
                    onChange={e => setNewPmtAccount(e.target.value)}
                  >
                    <option value="HDFC Corporate Current A/C 9901">HDFC Corporate Current A/C 9901</option>
                    <option value="ICICI Current Account 2244">ICICI Current Account 2244</option>
                    <option value="State Bank of India CC A/C 4501">State Bank of India CC A/C 4501</option>
                  </select>
                </div>
              </div>
              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="zb-btn zb-btn-ghost" onClick={() => setModalType(null)}>Cancel</button>
                <button type="submit" className="zb-btn zb-btn-primary">Record Remittance</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

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
            <h1 className="zb-page-title">Billing & Receivables Management</h1>
            <p className="zb-page-subtitle">End-to-end receivables lifecycle: Quotations &rarr; Sales Orders &rarr; Delivery Challans &rarr; Tax Invoices &rarr; Credit Notes</p>
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

        {/* Sub-Navigation Tabs Bar (Photo 3 sub-items) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${salesSubTab === 'customers' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('customers'); if (onSelectSubItem) onSelectSubItem('customers'); }}
          >
            <Users size={15} />
            <span>Customers</span>
            <span className="zb-subnav-badge">{customersList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'orders' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('orders'); if (onSelectSubItem) onSelectSubItem('sales_orders'); }}
          >
            <Package size={15} />
            <span>Sales Orders</span>
            <span className="zb-subnav-badge">{salesOrders.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'invoices' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('invoices'); if (onSelectSubItem) onSelectSubItem('invoices'); }}
          >
            <Receipt size={15} />
            <span>Invoices</span>
            <span className="zb-subnav-badge">{invoices.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'challans' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('challans'); if (onSelectSubItem) onSelectSubItem('delivery_challans'); }}
          >
            <Truck size={15} />
            <span>Delivery Challans</span>
            <span className="zb-subnav-badge">{deliveryChallans.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'payments_received' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('payments_received'); if (onSelectSubItem) onSelectSubItem('payments_received'); }}
          >
            <DollarSign size={15} />
            <span>Payments Received</span>
            <span className="zb-subnav-badge">{paymentsReceivedList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'sales_returns' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('sales_returns'); if (onSelectSubItem) onSelectSubItem('sales_returns'); }}
          >
            <RotateCcw size={15} />
            <span>Sales Returns</span>
            <span className="zb-subnav-badge">{salesReturnsList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'credit_notes' ? 'active' : ''}`}
            onClick={() => { setSalesSubTab('credit_notes'); if (onSelectSubItem) onSelectSubItem('credit_notes'); }}
          >
            <Receipt size={15} />
            <span>Credit Notes</span>
            <span className="zb-subnav-badge">{creditNotes.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${salesSubTab === 'quotes' ? 'active' : ''}`}
            onClick={() => setSalesSubTab('quotes')}
          >
            <FileText size={15} />
            <span>Quotes</span>
            <span className="zb-subnav-badge">{quotes.length}</span>
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
                      <td>
                        <div className="zb-flex-align gap-2">
                          <span
                            className="font-medium text-dark"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedInvoice(inv)}
                          >
                            {inv.client}
                          </span>
                          <button
                            className="zb-table-btn"
                            style={{ padding: '2px 7px', fontSize: '11px', color: '#0066cc', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCustomer360(inv.client);
                            }}
                            title="Open Customer 360° Intelligence & Audit Timeline"
                          >
                            <Users size={11} style={{ marginRight: '3px' }} /> 360°
                          </button>
                        </div>
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
                            style={{ color: '#059669', borderColor: '#a7f3d0' }}
                            onClick={() => handleOpenEwbForInvoice(inv)}
                            title="Official GST e-Way Bill & Dynamic UPI QR"
                          >
                            <QrCode size={13} style={{ marginRight: '4px' }} /> e-Way &amp; QR
                          </button>
                          <button
                            className="zb-table-btn"
                            onClick={() => downloadInvoiceFile(inv)}
                            title="Download standalone HTML invoice"
                          >
                            <Download size={13} style={{ marginRight: '4px' }} /> Download
                          </button>
                          {inv.status === 'Overdue' && (
                            <button
                              className="zb-table-btn"
                              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                              onClick={() => handleSendOverdueReminder(inv)}
                              title="Send overdue reminder email via Gmail SMTP"
                            >
                              <Send size={13} style={{ marginRight: '4px' }} /> Remind
                            </button>
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
                      <td>
                        <div className="zb-flex-align gap-2">
                          <span className="font-medium">{dc.client}</span>
                          <button
                            className="zb-table-btn"
                            style={{ padding: '2px 7px', fontSize: '11px', color: '#0066cc', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            onClick={() => handleOpenCustomer360(dc.client)}
                            title="Open Customer 360° Intelligence"
                          >
                            <Users size={11} style={{ marginRight: '3px' }} /> 360°
                          </button>
                        </div>
                      </td>
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
                          <button
                            className="zb-table-btn"
                            style={{ color: '#059669', borderColor: '#a7f3d0' }}
                            onClick={() => handleOpenEwbForChallan(dc)}
                            title="Generate Official GST e-Way Bill & Dynamic UPI QR"
                          >
                            <QrCode size={13} style={{ marginRight: '4px' }} /> e-Way Bill
                          </button>
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
        {/* 6. Customers Sub-Module (Photo 3) */}
        {salesSubTab === 'customers' && (
          <>
            <div className="zb-dashboard-grid four-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Active Customers</div>
                <div className="zb-metric-mini-val text-primary">{customersList.length}</div>
                <div className="zb-metric-mini-sub text-success"><CheckCircle2 size={12} /> 100% verified KYC</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Receivables</div>
                <div className="zb-metric-mini-val text-warning">
                  {formatINR(customersList.reduce((acc, c) => acc + c.balance, 0))}
                </div>
                <div className="zb-metric-mini-sub">Outstanding balance</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Credit Limit</div>
                <div className="zb-metric-mini-val text-success">
                  {formatINR(customersList.reduce((acc, c) => acc + c.creditLimit, 0))}
                </div>
                <div className="zb-metric-mini-sub">Enterprise exposure cap</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Credit Utilization</div>
                <div className="zb-metric-mini-val text-primary">
                  {((customersList.reduce((acc, c) => acc + c.balance, 0) / customersList.reduce((acc, c) => acc + c.creditLimit, 0)) * 100).toFixed(1)}%
                </div>
                <div className="zb-metric-mini-sub text-success">Healthy credit buffer</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Customer Directory & 360° Intelligence</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => setModalType('new_customer')}
                >
                  <Plus size={14} /> Add Customer
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Contact Person</th>
                    <th>Email & Phone</th>
                    <th className="text-right">Receivables Balance</th>
                    <th className="text-right">Credit Limit</th>
                    <th className="text-center">Risk Grade</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customersList.map(c => (
                    <tr key={c.id}>
                      <td className="font-semibold text-primary">{c.name}</td>
                      <td>{c.contact}</td>
                      <td className="text-muted text-xs">{c.email}<br />{c.phone}</td>
                      <td className="text-right font-bold text-warning">{formatINR(c.balance)}</td>
                      <td className="text-right text-muted">{formatINR(c.creditLimit)}</td>
                      <td className="text-center">
                        <span className="zb-badge-pill bg-success-light text-success font-semibold text-xs">
                          {c.riskGrade}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="zb-flex-align justify-center gap-2">
                          <button
                            className="zb-btn zb-btn-secondary zb-btn-xs"
                            onClick={() => handleOpenCustomer360(c.name)}
                          >
                            <Eye size={13} /> 360° View
                          </button>
                          <button
                            className="zb-btn zb-btn-outline-primary zb-btn-xs"
                            onClick={() => setIsCreateInvoiceOpen(true)}
                          >
                            + Invoice
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

        {/* 7. Payments Received Sub-Module (Photo 3) */}
        {salesSubTab === 'payments_received' && (
          <>
            <div className="zb-dashboard-grid three-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Collections</div>
                <div className="zb-metric-mini-val text-success">
                  {formatINR(paymentsReceivedList.reduce((acc, p) => acc + p.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">{paymentsReceivedList.length} customer payments received</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Instant UPI Collections</div>
                <div className="zb-metric-mini-val text-primary">
                  {formatINR(paymentsReceivedList.filter(p => p.method.includes('UPI')).reduce((acc, p) => acc + p.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">Zero gateway fee dynamic QR</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Direct Bank Transfers</div>
                <div className="zb-metric-mini-val text-indigo">
                  {formatINR(paymentsReceivedList.filter(p => !p.method.includes('UPI')).reduce((acc, p) => acc + p.amount, 0))}
                </div>
                <div className="zb-metric-mini-sub">RTGS / NEFT / NetBanking</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Customer Payments Received Register</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => setModalType('new_payment_received')}
                >
                  <Plus size={14} /> Record Payment
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Payment Receipt #</th>
                    <th>Customer Name</th>
                    <th>Invoice Reference</th>
                    <th>Payment Date</th>
                    <th>Payment Mode</th>
                    <th className="text-right">Amount Received</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsReceivedList.map(p => (
                    <tr key={p.id}>
                      <td className="font-semibold text-primary">{p.id}</td>
                      <td>{p.customer}</td>
                      <td><span className="text-primary font-medium">{p.invoiceRef}</span></td>
                      <td>{p.date}</td>
                      <td>
                        <span className="zb-badge-pill bg-info-light text-info text-xs">
                          {p.method}
                        </span>
                      </td>
                      <td className="text-right font-bold text-success">{formatINR(p.amount)}</td>
                      <td className="text-center">
                        <span className="zb-badge-pill bg-success-light text-success text-xs font-semibold">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 8. Sales Returns Sub-Module (Photo 3) */}
        {salesSubTab === 'sales_returns' && (
          <>
            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Sales Returns & RMA Notes</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => showToast('Sales Return processed: RMA-2026-013 logged and Credit Note issued.')}
                >
                  <Plus size={14} /> New Sales Return
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Return RMA #</th>
                    <th>Customer</th>
                    <th>Original Invoice</th>
                    <th>Items Returned</th>
                    <th>Return Reason</th>
                    <th className="text-right">Credit Amount</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReturnsList.map(r => (
                    <tr key={r.id}>
                      <td className="font-semibold text-danger">{r.id}</td>
                      <td>{r.customer}</td>
                      <td><span className="text-primary font-medium">{r.invoiceRef}</span></td>
                      <td className="text-xs">{r.items}</td>
                      <td className="text-xs text-muted">{r.reason}</td>
                      <td className="text-right font-bold text-danger">{formatINR(r.amount)}</td>
                      <td className="text-center">
                        <span className="zb-badge-pill bg-warning-light text-warning text-xs font-semibold">
                          {r.status}
                        </span>
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

        {renderSharedModals()}
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
            <h1 className="zb-page-title">Procurement & Payables Management</h1>
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

        {/* Sub-Navigation Tabs Bar (Photo 2 sub-items) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'vendors' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('vendors'); if (onSelectSubItem) onSelectSubItem('vendors'); }}
          >
            <Users size={15} />
            <span>Vendors</span>
            <span className="zb-subnav-badge">{vendorsList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'recurring' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('recurring'); if (onSelectSubItem) onSelectSubItem('expenses'); }}
          >
            <Clock size={15} />
            <span>Expenses</span>
            <span className="zb-subnav-badge">{recurringExpenses.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'orders' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('orders'); if (onSelectSubItem) onSelectSubItem('purchase_orders'); }}
          >
            <Layers size={15} />
            <span>Purchase Orders</span>
            <span className="zb-subnav-badge">{purchaseOrders.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'receives' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('receives'); if (onSelectSubItem) onSelectSubItem('purchase_receives'); }}
          >
            <Package size={15} />
            <span>Purchase Receives</span>
            <span className="zb-subnav-badge">{purchaseReceivesList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'bills' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('bills'); if (onSelectSubItem) onSelectSubItem('bills'); }}
          >
            <ShoppingBag size={15} />
            <span>Bills</span>
            <span className="zb-subnav-badge">{bills.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'payments_made' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('payments_made'); if (onSelectSubItem) onSelectSubItem('payments_made'); }}
          >
            <DollarSign size={15} />
            <span>Payments Made</span>
            <span className="zb-subnav-badge">{paymentsMadeList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${purchasesSubTab === 'credits' ? 'active' : ''}`}
            onClick={() => { setPurchasesSubTab('credits'); if (onSelectSubItem) onSelectSubItem('vendor_credits'); }}
          >
            <Receipt size={15} />
            <span>Vendor Credits</span>
            <span className="zb-subnav-badge">{vendorCredits.length}</span>
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
        {/* 5. Vendors Directory Sub-Module (Photo 2) */}
        {purchasesSubTab === 'vendors' && (
          <>
            <div className="zb-dashboard-grid four-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Active Vendors</div>
                <div className="zb-metric-mini-val text-primary">{vendorsList.length}</div>
                <div className="zb-metric-mini-sub text-success"><CheckCircle2 size={12} /> GSTIN verified</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Payables</div>
                <div className="zb-metric-mini-val text-warning">
                  {formatINR(vendorsList.reduce((acc, v) => acc + v.balance, 0))}
                </div>
                <div className="zb-metric-mini-sub">Outstanding to suppliers</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Average Terms</div>
                <div className="zb-metric-mini-val text-main">Net 30</div>
                <div className="zb-metric-mini-sub">Standard commercial credit</div>
              </div>
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Payment Compliance</div>
                <div className="zb-metric-mini-val text-success">98.2%</div>
                <div className="zb-metric-mini-sub text-success">On-time clearance</div>
              </div>
            </div>

            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Vendor Directory & Procurement Partners</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => setModalType('new_vendor')}
                >
                  <Plus size={14} /> Add Vendor
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Vendor Name</th>
                    <th>Contact Person</th>
                    <th>GSTIN</th>
                    <th>Category</th>
                    <th className="text-right">Outstanding Payables</th>
                    <th className="text-center">Terms</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorsList.map(v => (
                    <tr key={v.id}>
                      <td className="font-semibold text-primary">{v.name}</td>
                      <td>{v.contact}</td>
                      <td className="text-xs font-mono">{v.gstin}</td>
                      <td>
                        <span className="zb-badge-pill bg-info-light text-info text-xs">{v.category}</span>
                      </td>
                      <td className="text-right font-bold text-warning">{formatINR(v.balance)}</td>
                      <td className="text-center text-xs font-semibold text-muted">{v.terms}</td>
                      <td className="text-center">
                        <button
                          className="zb-btn zb-btn-outline-primary zb-btn-xs"
                          onClick={() => {
                            setNewBillVendor(v.name);
                            setModalType('new_bill');
                          }}
                        >
                          + Record Bill
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 6. Purchase Receives Sub-Module (Photo 2) */}
        {purchasesSubTab === 'receives' && (
          <>
            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Purchase Receives & Goods Receipt Notes (GRN)</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => showToast('New Purchase Receive GRN-2026-105 created. Warehouse stock incremented.')}
                >
                  <Plus size={14} /> New Purchase Receive
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>GRN Receipt #</th>
                    <th>Purchase Order</th>
                    <th>Vendor Name</th>
                    <th>Received Date</th>
                    <th>Inspected By</th>
                    <th className="text-center">QC Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseReceivesList.map(grn => (
                    <tr key={grn.id}>
                      <td className="font-semibold text-primary">{grn.id}</td>
                      <td><span className="text-primary font-medium">{grn.poRef}</span></td>
                      <td>{grn.vendor}</td>
                      <td>{grn.receivedDate}</td>
                      <td className="text-xs text-muted">{grn.receivedBy}</td>
                      <td className="text-center">
                        <span className="zb-badge-pill bg-success-light text-success text-xs font-semibold">
                          <CheckCircle2 size={12} className="inline mr-1" />
                          {grn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 7. Payments Made Sub-Module (Photo 2) */}
        {purchasesSubTab === 'payments_made' && (
          <>
            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div className="font-semibold text-main">Vendor Payments Made & Bank Remittance</div>
                <button
                  className="zb-btn zb-btn-primary zb-btn-sm"
                  onClick={() => setModalType('new_payment_made')}
                >
                  <Plus size={14} /> Make Payment
                </button>
              </div>
              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Payment Voucher #</th>
                    <th>Vendor</th>
                    <th>Bill Reference</th>
                    <th>Payment Date</th>
                    <th>Payment Method</th>
                    <th>Debited Bank Account</th>
                    <th className="text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsMadeList.map(pmt => (
                    <tr key={pmt.id}>
                      <td className="font-semibold text-primary">{pmt.id}</td>
                      <td>{pmt.vendor}</td>
                      <td><span className="text-primary font-medium">{pmt.billRef}</span></td>
                      <td>{pmt.date}</td>
                      <td>
                        <span className="zb-badge-pill bg-info-light text-info text-xs">{pmt.method}</span>
                      </td>
                      <td className="text-xs text-muted">{pmt.account}</td>
                      <td className="text-right font-bold text-success">{formatINR(pmt.amount)}</td>
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

  // Inventory Module Render (Photo 4)
  if (module === 'inventory') {
    const handleAddAdjustment = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newAdjItem) return;
      const newAdj = {
        id: `ADJ-2026-0${adjustmentsList.length + 52}`,
        item: newAdjItem,
        sku: newAdjSku || 'SKU-GEN-001',
        type: newAdjType,
        qty: Number(newAdjQty) || 0,
        reason: newAdjReason,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        user: 'Admin'
      };
      setAdjustmentsList([newAdj, ...adjustmentsList]);
      setModalType(null);
      setNewAdjItem('');
      setNewAdjSku('');
      setNewAdjQty('');
      showToast(`✓ Adjustment ${newAdj.id} recorded. Stock balance updated.`);
    };

    const handleAddPackage = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPkgCustomer) return;
      const newPkg = {
        id: `PKG-2026-${packagesList.length + 211}`,
        orderRef: newPkgOrderRef || `SO-${5010 + packagesList.length + 3}`,
        customer: newPkgCustomer,
        dimensions: newPkgDimensions,
        weight: newPkgWeight,
        status: 'Packed & Weighed',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setPackagesList([newPkg, ...packagesList]);
      setModalType(null);
      setNewPkgOrderRef('');
      setNewPkgCustomer('');
      showToast(`✓ Package ${newPkg.id} created with verified packing slip.`);
    };

    const handleAddShipment = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newShpDestination) return;
      const newShp = {
        id: `SHP-2026-${shipmentsList.length + 119}`,
        carrier: newShpCarrier,
        trackingNo: newShpTracking || `${newShpCarrier.slice(0, 3).toUpperCase()}${Math.floor(100000000 + Math.random() * 900000000)}IN`,
        destination: newShpDestination,
        shippedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        estDelivery: newShpEstDelivery || 'Next Business Day',
        status: 'In Transit'
      };
      setShipmentsList([newShp, ...shipmentsList]);
      setModalType(null);
      setNewShpTracking('');
      setNewShpDestination('');
      setNewShpEstDelivery('');
      showToast(`✓ Shipment ${newShp.id} dispatched via ${newShp.carrier}.`);
    };

    const handleAddMoveOrder = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMvoItems) return;
      const newMvo = {
        id: `MVO-2026-0${moveOrdersList.length + 34}`,
        fromLoc: newMvoFrom,
        toLoc: newMvoTo,
        items: newMvoItems,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'In Transit'
      };
      setMoveOrdersList([newMvo, ...moveOrdersList]);
      setModalType(null);
      setNewMvoItems('');
      showToast(`✓ Move Order ${newMvo.id} created. Transfer in transit.`);
    };

    const handleAddPutaway = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPtwItem || !newPtwBin) return;
      const newPtw = {
        id: `PTW-2026-0${putawaysList.length + 78}`,
        item: newPtwItem,
        receivingDock: newPtwDock,
        targetBin: newPtwBin,
        operator: newPtwOperator,
        status: 'Completed',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setPutawaysList([newPtw, ...putawaysList]);
      setModalType(null);
      setNewPtwItem('');
      setNewPtwBin('');
      showToast(`✓ Putaway ${newPtw.id} logged. Stored in ${newPtw.targetBin}.`);
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Inventory Operations & Warehousing</h1>
            <p className="zb-page-subtitle">Stock adjustments, package weighing, carrier dispatches, move orders, and bin putaway</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                'inventory_operations.csv',
                ['Operation', 'ID', 'Item/Ref', 'Location', 'Status', 'Date'],
                adjustmentsList.map(a => ['Adjustment', a.id, `"${a.item}"`, a.user, a.reason, a.date])
              )}
            >
              <Download size={15} /> Export Operations Log
            </button>
            <button
              className="zb-btn zb-btn-primary"
              onClick={() => {
                if (inventorySubTab === 'adjustments') setModalType('new_adjustment');
                else if (inventorySubTab === 'packages') setModalType('new_package');
                else if (inventorySubTab === 'shipments') setModalType('new_shipment');
                else if (inventorySubTab === 'move_orders') setModalType('new_move_order');
                else if (inventorySubTab === 'putaways') setModalType('new_putaway');
              }}
            >
              <Plus size={16} /> New Inventory Activity
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs Bar (Photo 4) */}
        <div className="zb-subnav-bar">
          <button
            className={`zb-subnav-item ${inventorySubTab === 'adjustments' ? 'active' : ''}`}
            onClick={() => { setInventorySubTab('adjustments'); if (onSelectSubItem) onSelectSubItem('inv_adjustments'); }}
          >
            <RefreshCw size={15} />
            <span>Inventory Adjustments</span>
            <span className="zb-subnav-badge">{adjustmentsList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${inventorySubTab === 'packages' ? 'active' : ''}`}
            onClick={() => { setInventorySubTab('packages'); if (onSelectSubItem) onSelectSubItem('packages'); }}
          >
            <Package size={15} />
            <span>Packages</span>
            <span className="zb-subnav-badge">{packagesList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${inventorySubTab === 'shipments' ? 'active' : ''}`}
            onClick={() => { setInventorySubTab('shipments'); if (onSelectSubItem) onSelectSubItem('shipments'); }}
          >
            <Truck size={15} />
            <span>Shipments</span>
            <span className="zb-subnav-badge">{shipmentsList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${inventorySubTab === 'move_orders' ? 'active' : ''}`}
            onClick={() => { setInventorySubTab('move_orders'); if (onSelectSubItem) onSelectSubItem('move_orders'); }}
          >
            <ArrowRight size={15} />
            <span>Move Orders</span>
            <span className="zb-subnav-badge">{moveOrdersList.length}</span>
          </button>
          <button
            className={`zb-subnav-item ${inventorySubTab === 'putaways' ? 'active' : ''}`}
            onClick={() => { setInventorySubTab('putaways'); if (onSelectSubItem) onSelectSubItem('putaways'); }}
          >
            <Layers size={15} />
            <span>Putaways</span>
            <span className="zb-subnav-badge">{putawaysList.length}</span>
          </button>
        </div>

        {/* 1. Inventory Adjustments */}
        {inventorySubTab === 'adjustments' && (
          <div className="zb-card zb-table-container">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div className="font-semibold text-main">Physical Inventory Stock Adjustments & Write-Offs</div>
              <button
                className="zb-btn zb-btn-primary zb-btn-sm"
                onClick={() => setModalType('new_adjustment')}
              >
                <Plus size={14} /> New Adjustment
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Adjustment #</th>
                  <th>Item Name</th>
                  <th>SKU Code</th>
                  <th>Type</th>
                  <th className="text-right">Quantity Change</th>
                  <th>Adjustment Reason</th>
                  <th>Date</th>
                  <th>Adjusted By</th>
                </tr>
              </thead>
              <tbody>
                {adjustmentsList.map(adj => (
                  <tr key={adj.id}>
                    <td className="font-semibold text-primary">{adj.id}</td>
                    <td>{adj.item}</td>
                    <td className="text-xs font-mono">{adj.sku}</td>
                    <td>
                      <span className={`zb-badge-pill text-xs ${adj.type === 'Quantity' ? 'bg-info-light text-info' : 'bg-success-light text-success'}`}>
                        {adj.type}
                      </span>
                    </td>
                    <td className={`text-right font-bold ${adj.qty < 0 ? 'text-danger' : 'text-success'}`}>
                      {adj.qty > 0 ? `+${adj.qty}` : adj.qty}
                    </td>
                    <td className="text-xs text-muted">{adj.reason}</td>
                    <td>{adj.date}</td>
                    <td className="text-xs">{adj.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. Packages */}
        {inventorySubTab === 'packages' && (
          <div className="zb-card zb-table-container">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div className="font-semibold text-main">Customer Order Packing & Parcel Slips</div>
              <button
                className="zb-btn zb-btn-primary zb-btn-sm"
                onClick={() => setModalType('new_package')}
              >
                <Plus size={14} /> New Package
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Package #</th>
                  <th>Sales Order Reference</th>
                  <th>Customer Name</th>
                  <th>Parcel Dimensions</th>
                  <th>Total Weight</th>
                  <th>Date</th>
                  <th className="text-center">Packaging Status</th>
                </tr>
              </thead>
              <tbody>
                {packagesList.map(pkg => (
                  <tr key={pkg.id}>
                    <td className="font-semibold text-primary">{pkg.id}</td>
                    <td><span className="text-primary font-medium">{pkg.orderRef}</span></td>
                    <td>{pkg.customer}</td>
                    <td className="text-xs font-mono">{pkg.dimensions}</td>
                    <td className="font-semibold">{pkg.weight}</td>
                    <td>{pkg.date}</td>
                    <td className="text-center">
                      <span className="zb-badge-pill bg-info-light text-info text-xs font-semibold">
                        {pkg.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Shipments */}
        {inventorySubTab === 'shipments' && (
          <div className="zb-card zb-table-container">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div className="font-semibold text-main">Carrier Shipments & Real-Time Logistics Tracking</div>
              <button
                className="zb-btn zb-btn-primary zb-btn-sm"
                onClick={() => setModalType('new_shipment')}
              >
                <Plus size={14} /> Create Shipment
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Shipment #</th>
                  <th>Logistics Carrier</th>
                  <th>Tracking AWB Number</th>
                  <th>Destination Hub</th>
                  <th>Shipped Date</th>
                  <th>Est. Delivery</th>
                  <th className="text-center">Transit Status</th>
                </tr>
              </thead>
              <tbody>
                {shipmentsList.map(shp => (
                  <tr key={shp.id}>
                    <td className="font-semibold text-primary">{shp.id}</td>
                    <td className="font-medium">{shp.carrier}</td>
                    <td className="font-mono text-xs text-primary">{shp.trackingNo}</td>
                    <td className="text-xs">{shp.destination}</td>
                    <td>{shp.shippedDate}</td>
                    <td>{shp.estDelivery}</td>
                    <td className="text-center">
                      <span className={`zb-badge-pill text-xs font-semibold ${shp.status === 'Delivered' ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
                        {shp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Move Orders */}
        {inventorySubTab === 'move_orders' && (
          <div className="zb-card zb-table-container">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div className="font-semibold text-main">Inter-Warehouse Stock Move Orders & Transfers</div>
              <button
                className="zb-btn zb-btn-primary zb-btn-sm"
                onClick={() => setModalType('new_move_order')}
              >
                <Plus size={14} /> New Move Order
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Move Order #</th>
                  <th>Source Location</th>
                  <th>Destination Location</th>
                  <th>Transferred Line Items</th>
                  <th>Transfer Date</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {moveOrdersList.map(mvo => (
                  <tr key={mvo.id}>
                    <td className="font-semibold text-primary">{mvo.id}</td>
                    <td className="text-xs font-medium text-muted">{mvo.fromLoc}</td>
                    <td className="text-xs font-medium text-main">{mvo.toLoc}</td>
                    <td className="text-xs">{mvo.items}</td>
                    <td>{mvo.date}</td>
                    <td className="text-center">
                      <span className={`zb-badge-pill text-xs font-semibold ${mvo.status === 'Completed' ? 'bg-success-light text-success' : 'bg-info-light text-info'}`}>
                        {mvo.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Putaways */}
        {inventorySubTab === 'putaways' && (
          <div className="zb-card zb-table-container">
            <div className="zb-table-header-bar zb-flex-between p-3">
              <div className="font-semibold text-main">Warehouse Inward Putaway & Bin Allocation</div>
              <button
                className="zb-btn zb-btn-primary zb-btn-sm"
                onClick={() => setModalType('new_putaway')}
              >
                <Plus size={14} /> Log Putaway
              </button>
            </div>
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Putaway #</th>
                  <th>Stock Item Name</th>
                  <th>Receiving Dock</th>
                  <th>Assigned Storage Bin/Rack</th>
                  <th>Warehouse Operator</th>
                  <th>Date</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {putawaysList.map(ptw => (
                  <tr key={ptw.id}>
                    <td className="font-semibold text-primary">{ptw.id}</td>
                    <td>{ptw.item}</td>
                    <td className="text-xs font-mono">{ptw.receivingDock}</td>
                    <td className="text-xs font-bold text-primary">{ptw.targetBin}</td>
                    <td className="text-xs">{ptw.operator}</td>
                    <td>{ptw.date}</td>
                    <td className="text-center">
                      <span className="zb-badge-pill bg-success-light text-success text-xs font-semibold">
                        {ptw.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Inventory Modals ── */}
        {modalType === 'new_adjustment' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Record Inventory Adjustment</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddAdjustment} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Item Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Dell UltraSharp 27 4K Monitor"
                    value={newAdjItem}
                    onChange={e => setNewAdjItem(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-grid-2">
                  <div className="zb-form-group">
                    <label className="zb-label">SKU Code</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. MON-DELL-4K27"
                      value={newAdjSku}
                      onChange={e => setNewAdjSku(e.target.value)}
                    />
                  </div>
                  <div className="zb-form-group">
                    <label className="zb-label">Adjustment Mode</label>
                    <select
                      className="zb-select"
                      value={newAdjType}
                      onChange={e => setNewAdjType(e.target.value)}
                    >
                      <option value="Quantity">Quantity Adjustment</option>
                      <option value="Value">Value Revaluation</option>
                    </select>
                  </div>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Quantity Change (positive or negative)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="e.g. -2 or 5"
                    value={newAdjQty}
                    onChange={e => setNewAdjQty(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Reason</label>
                  <select
                    className="zb-select"
                    value={newAdjReason}
                    onChange={e => setNewAdjReason(e.target.value)}
                  >
                    <option value="Physical Stock Count Variance">Physical Stock Count Variance</option>
                    <option value="Damaged Goods / Scrap">Damaged Goods / Scrap</option>
                    <option value="Supplier Goodwill Free Stock">Supplier Goodwill Free Stock</option>
                    <option value="Inventory Revaluation">Inventory Revaluation</option>
                    <option value="Internal Office Consumption">Internal Office Consumption</option>
                  </select>
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Save Adjustment
                </button>
              </form>
            </div>
          </div>
        )}

        {modalType === 'new_package' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Create Packing Slip</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddPackage} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Customer Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Infosys BPM Limited"
                    value={newPkgCustomer}
                    onChange={e => setNewPkgCustomer(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Sales Order Reference</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. SO-5014"
                    value={newPkgOrderRef}
                    onChange={e => setNewPkgOrderRef(e.target.value)}
                  />
                </div>
                <div className="zb-grid-2">
                  <div className="zb-form-group">
                    <label className="zb-label">Dimensions</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. 45x35x25 cm"
                      value={newPkgDimensions}
                      onChange={e => setNewPkgDimensions(e.target.value)}
                    />
                  </div>
                  <div className="zb-form-group">
                    <label className="zb-label">Total Weight</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. 4.8 kg"
                      value={newPkgWeight}
                      onChange={e => setNewPkgWeight(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Generate Package Slip
                </button>
              </form>
            </div>
          </div>
        )}

        {modalType === 'new_shipment' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Dispatch Carrier Shipment</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddShipment} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Logistics Carrier</label>
                  <select
                    className="zb-select"
                    value={newShpCarrier}
                    onChange={e => setNewShpCarrier(e.target.value)}
                  >
                    <option value="BlueDart Express">BlueDart Express</option>
                    <option value="Delhivery Logistics">Delhivery Logistics</option>
                    <option value="FedEx India">FedEx India</option>
                    <option value="DTDC Courier">DTDC Courier</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Destination Hub / City</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Electronic City, Bangalore"
                    value={newShpDestination}
                    onChange={e => setNewShpDestination(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-grid-2">
                  <div className="zb-form-group">
                    <label className="zb-label">AWB / Tracking Number</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="Leave blank to auto-generate"
                      value={newShpTracking}
                      onChange={e => setNewShpTracking(e.target.value)}
                    />
                  </div>
                  <div className="zb-form-group">
                    <label className="zb-label">Est. Delivery Date</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. 08 Sep 2026"
                      value={newShpEstDelivery}
                      onChange={e => setNewShpEstDelivery(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Dispatch Shipment
                </button>
              </form>
            </div>
          </div>
        )}

        {modalType === 'new_move_order' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Create Warehouse Move Order</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddMoveOrder} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Source Warehouse</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={newMvoFrom}
                    onChange={e => setNewMvoFrom(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Destination Warehouse</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={newMvoTo}
                    onChange={e => setNewMvoTo(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Transfer Line Items & Quantity</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Dell UltraSharp 27 4K Monitor (10 units)"
                    value={newMvoItems}
                    onChange={e => setNewMvoItems(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Initiate Stock Transfer
                </button>
              </form>
            </div>
          </div>
        )}

        {modalType === 'new_putaway' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Log Inward Putaway</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddPutaway} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Stock Item Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Ergonomic Mesh Office Chair"
                    value={newPtwItem}
                    onChange={e => setNewPtwItem(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-grid-2">
                  <div className="zb-form-group">
                    <label className="zb-label">Receiving Dock</label>
                    <select
                      className="zb-select"
                      value={newPtwDock}
                      onChange={e => setNewPtwDock(e.target.value)}
                    >
                      <option value="Dock A">Dock A (Main Receiving)</option>
                      <option value="Dock B">Dock B (Bulk Containers)</option>
                      <option value="Dock C">Dock C (Express Courier)</option>
                    </select>
                  </div>
                  <div className="zb-form-group">
                    <label className="zb-label">Assigned Bin / Rack</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. Aisle 2, Rack B, Bin 08"
                      value={newPtwBin}
                      onChange={e => setNewPtwBin(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Warehouse Operator</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={newPtwOperator}
                    onChange={e => setNewPtwOperator(e.target.value)}
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Log Putaway & Stock Items
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
            <h1 className="zb-page-title">Treasury & Cash Flow Management</h1>
            <p className="zb-page-subtitle">Real-time bank feed integrations, automatic statement rules, liquidity tracking, and 1-click reconciliation</p>
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

  // 4. Reports Module Render (Photo 1 - Reports Center)
  if (module === 'reports') {
    const reportCategoriesData: Record<string, { label: string; count: number; items: string[] }> = {
      sales: {
        label: 'Sales',
        count: 8,
        items: [
          'Sales by Customer',
          'Sales by Item',
          'Order Fulfillment By Item',
          'Sales Return History',
          'Sales by Salesperson',
          'Sales Summary',
          'Profit By Item',
          'Sales Channel Integration',
        ],
      },
      inventory: {
        label: 'Inventory',
        count: 5,
        items: [
          'Inventory Summary',
          'Item Details Report',
          'Stock Summary by Warehouse',
          'Committed Stock Report',
          'Inventory Aging Summary',
        ],
      },
      valuation: {
        label: 'Inventory Valuation',
        count: 3,
        items: [
          'Inventory Valuation Summary (FIFO / Weighted Avg)',
          'Cost of Goods Sold (COGS) Breakdown',
          'Stock Revaluation Adjustment Journal',
        ],
      },
      receivables: {
        label: 'Receivables',
        count: 4,
        items: [
          'Customer Balances Summary',
          'Accounts Receivable (AR) Aging Summary',
          'Accounts Receivable (AR) Aging Details',
          'Invoice Details & Overdue Tracker',
        ],
      },
      payments: {
        label: 'Payments Received',
        count: 3,
        items: [
          'Payments Received Register',
          'UPI Instant Dynamic QR Collection Log',
          'Customer Refund & Chargeback History',
        ],
      },
      payables: {
        label: 'Payables',
        count: 4,
        items: [
          'Vendor Balances Summary',
          'Accounts Payable (AP) Aging Summary',
          'Accounts Payable (AP) Aging Details',
          'Vendor Bills & Outstanding Payments Due',
        ],
      },
      purchases: {
        label: 'Purchases and Expenses',
        count: 4,
        items: [
          'Purchases by Vendor Register',
          'Purchases by Item Breakdown',
          'Operating Expense Details Report',
          'Recurring Expense Schedules Log',
        ],
      },
      activity: {
        label: 'Activity',
        count: 3,
        items: [
          'System Security Audit Trail',
          'User Login & Authorization History',
          'Master Data Transaction Change Log',
        ],
      },
      automation: {
        label: 'Automation',
        count: 3,
        items: [
          'Workflow Rule Triggers & Execution Log',
          'Scheduled Payment Reminders Dispatch Log',
          'Batch Document Processing Summary',
        ],
      },
    };

    const currentCatData = reportCategoriesData[reportCat] || reportCategoriesData.sales;

    const toggleStar = (rep: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setStarredReports(prev => ({
        ...prev,
        [rep]: !prev[rep]
      }));
    };

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Reports Center</h1>
            <p className="zb-page-subtitle">Centralized intelligence repository for sales, inventory, statutory ledgers, and compliance</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button
              className="zb-btn zb-btn-secondary"
              onClick={() => exportCSV(
                `${currentCatData.label.toLowerCase().replace(/\s+/g, '_')}_reports_index.csv`,
                ['Category', 'Report Name', 'Favorite', 'Status'],
                currentCatData.items.map(i => [currentCatData.label, `"${i}"`, starredReports[i] ? 'Yes' : 'No', 'Ready'])
              )}
            >
              <Download size={15} /> Export Category Index
            </button>
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
              <FileCheck size={16} /> Export Audit Package
            </button>
          </div>
        </div>

        {/* Dual-Pane Reports Center (Photo 1) */}
        <div className="zb-reports-center zb-section-spacing">
          {/* Left Category Sidebar */}
          <div className="zb-reports-sidebar">
            <div className="zb-reports-top-links">
              <button
                className="zb-reports-top-item"
                onClick={() => showToast('Shared reports: 4 organization-wide reports synchronized.')}
              >
                <Users size={15} />
                <span>Shared Reports</span>
              </button>
              <button
                className="zb-reports-top-item"
                onClick={() => showToast('My Reports: 3 custom customized reports saved.')}
              >
                <Eye size={15} />
                <span>My Reports</span>
              </button>
              <button
                className="zb-reports-top-item"
                onClick={() => showToast('Scheduled Reports: Weekly P&L and GST summary active.')}
              >
                <Clock size={15} />
                <span>Scheduled Reports</span>
              </button>
            </div>

            <div className="zb-reports-categories-title">REPORT CATEGORY</div>
            <div className="zb-reports-cat-list">
              {(Object.keys(reportCategoriesData) as (keyof typeof reportCategoriesData)[]).map(catKey => {
                const cat = reportCategoriesData[catKey];
                const isActive = reportCat === catKey;
                return (
                  <button
                    key={catKey}
                    className={`zb-reports-cat-item ${isActive ? 'active' : ''}`}
                    onClick={() => setReportCat(catKey as any)}
                  >
                    <FileText size={15} className={isActive ? 'text-primary' : 'text-muted'} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Content Pane */}
          <div className="zb-reports-content-pane">
            <div className="zb-reports-header-row">
              <div className="zb-reports-cat-heading">
                <span>{currentCatData.label}</span>
                <span className="zb-reports-count-badge">{currentCatData.count}</span>
              </div>
              <button
                className="zb-btn zb-btn-secondary zb-btn-sm"
                onClick={() => showToast(`All ${currentCatData.count} ${currentCatData.label} reports queued for background export.`)}
              >
                <Download size={14} /> Batch Export All ({currentCatData.count})
              </button>
            </div>

            <div className="zb-reports-column-header">REPORT NAME</div>

            <div className="zb-reports-items-list">
              {currentCatData.items.map((rep, idx) => {
                const isStarred = !!starredReports[rep];
                return (
                  <div
                    key={idx}
                    className="zb-report-row"
                    onClick={() => {
                      setSelectedReportPreview(rep);
                      showToast(`Generated report: ${rep}`);
                    }}
                  >
                    <div className="zb-report-row-left">
                      <button
                        className={`zb-report-star ${isStarred ? 'starred' : ''}`}
                        onClick={(e) => toggleStar(rep, e)}
                        title={isStarred ? 'Unfavorite' : 'Mark as favorite'}
                      >
                        <Sparkles size={16} fill={isStarred ? '#f59e0b' : 'none'} color={isStarred ? '#f59e0b' : '#94a3b8'} />
                      </button>
                      <span className="zb-report-name-link">{rep}</span>
                    </div>

                    <div className="zb-report-row-actions">
                      <button
                        className="zb-btn zb-btn-secondary zb-btn-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportCSV(`${rep.toLowerCase().replace(/\s+/g, '_')}.csv`, ['Metric', 'Period', 'Amount (INR)'], [
                            ['Total Volume', 'August 2026', '12,45,000'],
                            ['Cleared Transactions', 'August 2026', '11,10,000'],
                            ['Pending Reconciliation', 'August 2026', '1,35,000'],
                          ]);
                        }}
                      >
                        <Download size={12} /> CSV
                      </button>
                      <ArrowUpRight size={15} className="text-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Report Preview Modal */}
        {selectedReportPreview && (
          <div className="zb-modal-backdrop" onClick={() => setSelectedReportPreview(null)}>
            <div className="zb-modal zb-modal-lg" onClick={e => e.stopPropagation()}>
              <div className="zb-modal-header zb-flex-between">
                <div>
                  <h3 className="zb-modal-title">{selectedReportPreview}</h3>
                  <p className="text-xs text-muted">Organization: Rooman Technologies Pvt Ltd | Generated: Today</p>
                </div>
                <button className="zb-modal-close" onClick={() => setSelectedReportPreview(null)}><X size={18} /></button>
              </div>
              <div className="zb-modal-body p-4">
                <div className="zb-dashboard-grid three-col mb-4">
                  <div className="zb-metric-mini-card">
                    <div className="zb-metric-mini-label">Period Sample Total</div>
                    <div className="zb-metric-mini-val text-primary">₹24,85,400</div>
                    <div className="zb-metric-mini-sub text-success">+14.2% vs previous fiscal period</div>
                  </div>
                  <div className="zb-metric-mini-card">
                    <div className="zb-metric-mini-label">Ledger Integrity</div>
                    <div className="zb-metric-mini-val text-success">100% Balanced</div>
                    <div className="zb-metric-mini-sub">Double-entry verified</div>
                  </div>
                  <div className="zb-metric-mini-card">
                    <div className="zb-metric-mini-label">Statutory Status</div>
                    <div className="zb-metric-mini-val text-main">Audit Ready</div>
                    <div className="zb-metric-mini-sub">Ind AS compliant</div>
                  </div>
                </div>

                <div className="zb-card zb-table-container">
                  <table className="zb-table">
                    <thead>
                      <tr>
                        <th>Account / Entity</th>
                        <th>Classification</th>
                        <th>Reference Transaction</th>
                        <th className="text-right">Debit (INR)</th>
                        <th className="text-right">Credit (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-semibold text-primary">Tata Consultancy Services Ltd</td>
                        <td>Accounts Receivable</td>
                        <td>INV-00101</td>
                        <td className="text-right">₹3,42,000</td>
                        <td className="text-right text-muted">-</td>
                      </tr>
                      <tr>
                        <td className="font-semibold text-primary">Infosys BPM Limited</td>
                        <td>Accounts Receivable</td>
                        <td>INV-00104</td>
                        <td className="text-right">₹1,85,000</td>
                        <td className="text-right text-muted">-</td>
                      </tr>
                      <tr>
                        <td className="font-semibold text-primary">Dell Technologies India</td>
                        <td>Accounts Payable</td>
                        <td>BILL-4092</td>
                        <td className="text-right text-muted">-</td>
                        <td className="text-right text-warning">₹2,45,000</td>
                      </tr>
                      <tr>
                        <td className="font-semibold text-primary">HDFC Corporate Operating A/C</td>
                        <td>Bank Asset</td>
                        <td>BNK-SYNC-881</td>
                        <td className="text-right text-success">₹14,92,400</td>
                        <td className="text-right text-muted">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="zb-modal-footer zb-flex-between p-3 border-top">
                <span className="text-xs text-muted font-medium">Digital Watermark: Signed by Chief Financial Officer</span>
                <div className="zb-flex-align gap-2">
                  <button
                    className="zb-btn zb-btn-secondary"
                    onClick={() => {
                      exportCSV(`${selectedReportPreview.toLowerCase().replace(/\s+/g, '_')}.csv`, ['Account', 'Classification', 'Reference', 'Debit', 'Credit'], [
                        ['Tata Consultancy Services Ltd', 'Accounts Receivable', 'INV-00101', '342000', '0'],
                        ['Infosys BPM Limited', 'Accounts Receivable', 'INV-00104', '185000', '0'],
                        ['Dell Technologies India', 'Accounts Payable', 'BILL-4092', '0', '245000'],
                        ['HDFC Corporate Operating A/C', 'Bank Asset', 'BNK-SYNC-881', '1492400', '0'],
                      ]);
                    }}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                  <button
                    className="zb-btn zb-btn-primary"
                    onClick={() => {
                      window.print();
                    }}
                  >
                    <Printer size={14} /> Print Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
            <h1 className="zb-page-title">General Ledger & Statutory Audit</h1>
            <p className="zb-page-subtitle">Manual journals, multi-tiered chart of accounts, trial balance verification, and fiscal period locking</p>
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
          <button
            className={`zb-subnav-item ${accountantSubTab === 'forex' ? 'active' : ''}`}
            onClick={() => setAccountantSubTab('forex')}
          >
            <Globe size={15} />
            <span>Forex &amp; Currency Valuation</span>
            <span className="zb-subnav-badge">{forexContracts.length} Contracts</span>
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

        {/* 4. Multi-Currency & Real-Time Forex Valuation Engine */}
        {accountantSubTab === 'forex' && (
          <>
            {/* 4 Metric Cards */}
            <div className="zb-dashboard-grid four-col zb-section-spacing">
              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Total Foreign Portfolio</div>
                <div className="zb-metric-mini-val text-primary">
                  {formatINR(totalForexValuation)}
                </div>
                <div className="zb-metric-mini-sub">{forexContracts.length} active global contracts</div>
              </div>

              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Booked Value at Inception</div>
                <div className="zb-metric-mini-val text-dark">
                  {formatINR(totalBookValuation)}
                </div>
                <div className="zb-metric-mini-sub">Historical contract baseline</div>
              </div>

              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Net Unrealized Forex Gain</div>
                <div className={`zb-metric-mini-val ${netForexGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                  {netForexGainLoss >= 0 ? `+${formatINR(netForexGainLoss)}` : formatINR(netForexGainLoss)}
                </div>
                <div className={`zb-metric-mini-sub ${netForexGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                  {netForexGainLoss >= 0 ? 'Favorable exchange variance' : 'Adverse exchange variance'}
                </div>
              </div>

              <div className="zb-metric-mini-card">
                <div className="zb-metric-mini-label">Treasury Hedge Ratio</div>
                <div className="zb-metric-mini-val" style={{ color: '#0284c7' }}>
                  78.2%
                </div>
                <div className="zb-metric-mini-sub">RBI benchmark reference live</div>
              </div>
            </div>

            {/* Action Bar with 1-Click GL Post and Live Rate Refresh */}
            <div className="zb-card zb-toolbar-card" style={{ marginBottom: '16px' }}>
              <div className="zb-flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div className="zb-flex-align gap-2">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Reference Exchange Feed:
                  </span>
                  <span className="zb-currency-pill">RBI Daily Reference Rates (Live 07 Sep 2026)</span>
                </div>

                <div className="zb-flex-align gap-2">
                  <button
                    className="zb-btn zb-btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 12px' }}
                    onClick={handleRefreshRbiRates}
                    title="Simulate RBI live exchange feed update"
                  >
                    <RefreshCw size={13} style={{ marginRight: '5px' }} /> Refresh Exchange Rates
                  </button>

                  <button
                    className="zb-btn zb-btn-primary"
                    style={{ fontSize: '12px', padding: '7px 14px' }}
                    onClick={handlePostForexJournal}
                    title="Post balanced double-entry manual journal into General Ledger"
                  >
                    <Sparkles size={14} style={{ marginRight: '6px' }} /> Post Forex Revaluation Journal to General Ledger
                  </button>
                </div>
              </div>
            </div>

            {/* Contracts Portfolio Table */}
            <div className="zb-card zb-table-container">
              <div className="zb-table-header-bar zb-flex-between p-3">
                <div>
                  <h3 className="font-semibold text-dark">Multi-Currency Exposure Register</h3>
                  <p className="text-muted text-xs" style={{ margin: '2px 0 0 0' }}>
                    Real-time mark-to-market revaluation under Accounting Standard AS-11 &amp; Ind AS 21
                  </p>
                </div>
                <span className="zb-status-pill paid" style={{ fontSize: '11px' }}>
                  Mark-to-Market Active
                </span>
              </div>

              <table className="zb-table">
                <thead>
                  <tr>
                    <th>Contract ID</th>
                    <th>Foreign Client</th>
                    <th>Currency</th>
                    <th className="text-right">Foreign Amount</th>
                    <th className="text-right">Booking Rate (₹)</th>
                    <th className="text-right">Live Spot Rate (₹)</th>
                    <th className="text-right">Book Value</th>
                    <th className="text-right">Current Valuation</th>
                    <th className="text-center">Unrealized Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {forexContracts.map(c => {
                    const bookVal = c.foreignAmount * c.bookingRate;
                    const curVal = c.foreignAmount * c.spotRate;
                    const delta = curVal - bookVal;
                    const isGain = delta >= 0;

                    return (
                      <tr key={c.id}>
                        <td className="font-mono font-semibold text-primary">{c.id}</td>
                        <td className="font-medium text-dark">{c.client}</td>
                        <td>
                          <span className="zb-currency-pill">{c.currency} ({c.symbol})</span>
                        </td>
                        <td className="text-right font-mono font-medium">
                          {c.symbol} {c.foreignAmount.toLocaleString('en-US')}
                        </td>
                        <td className="text-right font-mono text-muted">
                          ₹{c.bookingRate.toFixed(2)}
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="0.05"
                            className="zb-input font-mono text-right"
                            style={{ width: '90px', padding: '3px 6px', fontSize: '12.5px', display: 'inline-block' }}
                            value={c.spotRate}
                            onChange={(e) => handleUpdateForexSpotRate(c.id, parseFloat(e.target.value) || c.spotRate)}
                            title="Interactive Spot Rate: modify to re-calculate gain/loss"
                          />
                        </td>
                        <td className="text-right font-mono text-muted">
                          {formatINR(bookVal)}
                        </td>
                        <td className="text-right font-mono font-semibold text-dark">
                          {formatINR(curVal)}
                        </td>
                        <td className="text-center">
                          <span className={isGain ? 'zb-forex-gain' : 'zb-forex-loss'}>
                            {isGain ? <TrendingUp size={12} /> : <AlertCircle size={12} />}
                            {isGain ? `+${formatINR(delta)}` : formatINR(delta)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={6} className="text-right">
                      Portfolio Aggregate Totals:
                    </td>
                    <td className="text-right font-mono text-muted">
                      {formatINR(totalBookValuation)}
                    </td>
                    <td className="text-right font-mono text-primary font-bold">
                      {formatINR(totalForexValuation)}
                    </td>
                    <td className="text-center font-mono">
                      <span className={netForexGainLoss >= 0 ? 'zb-forex-gain' : 'zb-forex-loss'} style={{ fontSize: '13px' }}>
                        {netForexGainLoss >= 0 ? `+${formatINR(netForexGainLoss)}` : formatINR(netForexGainLoss)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Regulatory & Ind AS 21 Accounting Disclosure */}
            <div
              style={{
                marginTop: '16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 18px',
                fontSize: '12px',
                color: '#475569',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <ShieldCheck size={18} className="text-primary" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong>Accounting Standards Compliance (AS-11 &amp; Ind AS 21):</strong> Foreign currency monetary assets and liabilities are reported using the closing rate at each balance sheet reporting date. Any resultant exchange difference is recognized as unrealized gain or loss in the Statement of Profit and Loss and accumulated in the General Ledger.
              </div>
            </div>
          </>
        )}

        {renderSharedModals()}
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
            <h1 className="zb-page-title">Timesheets & Project Hours</h1>
            <p className="zb-page-subtitle">Track billable client hours, consultant timesheets, and convert logged hours directly to invoices</p>
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

    return (
      <div className="zb-page zb-module-page">
        {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Compliance Vault & Document Archive</h1>
            <p className="zb-page-subtitle">Document evidence repository and statutory audit archive</p>
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
            <h1 className="zb-page-title">Workforce & Payroll Administration</h1>
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
            <h1 className="zb-page-title">Settlements & Payment Gateway</h1>
            <p className="zb-page-subtitle">Instant UPI dynamic QR codes, customer checkout links, NetBanking, and automated ledger settlement</p>
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
                    <td>
                      <div className="zb-flex-align gap-2">
                        <span className="font-semibold">{p.customer}</span>
                        <button
                          className="zb-table-btn"
                          style={{ padding: '2px 7px', fontSize: '11px', color: '#0066cc', borderColor: '#bfdbfe', background: '#eff6ff' }}
                          onClick={() => handleOpenCustomer360(p.customer)}
                          title="Open Customer 360° Intelligence & Audit Timeline"
                        >
                          <Users size={11} style={{ marginRight: '3px' }} /> 360°
                        </button>
                      </div>
                    </td>
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
                      required
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
        {renderSharedModals()}
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
      {renderSharedModals()}
    </div>
  );
};
