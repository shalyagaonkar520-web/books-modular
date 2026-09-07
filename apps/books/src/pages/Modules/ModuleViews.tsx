import React, { useState } from 'react';
import { NavModule } from '../../components/layout/Sidebar';
import { formatINR } from '../../utils/currency';
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
  FileSpreadsheet
} from 'lucide-react';

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Sales Module State
  const [invoices, setInvoices] = useState([
    { id: 'INV-00104', client: 'Infosys BPM Limited', date: '02 Sep 2026', due: '16 Sep 2026', amount: 185000, status: 'Sent' },
    { id: 'INV-00103', client: 'Tata Consultancy Services', date: '28 Aug 2026', due: '11 Sep 2026', amount: 342000, status: 'Paid' },
    { id: 'INV-00102', client: 'Wipro Digital Labs', date: '20 Aug 2026', due: '03 Sep 2026', amount: 98500, status: 'Overdue' },
    { id: 'INV-00101', client: 'Razorpay Software Pvt Ltd', date: '15 Aug 2026', due: '30 Aug 2026', amount: 215000, status: 'Paid' },
    { id: 'INV-00100', client: 'Swiggy Technologies', date: '08 Aug 2026', due: '22 Aug 2026', amount: 145000, status: 'Paid' },
  ]);

  const [newInvClient, setNewInvClient] = useState('');
  const [newInvAmount, setNewInvAmount] = useState('');

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

    const handleCreateInvoice = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newInvClient || !newInvAmount) return;

      const newInv = {
        id: `INV-${105 + invoices.length}`,
        client: newInvClient,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        due: '30 Sep 2026',
        amount: parseFloat(newInvAmount),
        status: 'Sent',
      };
      setInvoices([newInv, ...invoices]);
      setNewInvClient('');
      setNewInvAmount('');
      setModalType(null);
      showToast(`Invoice ${newInv.id} created successfully!`);
    };

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
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('new_invoice')}>
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
                  <td className="font-semibold text-primary">{inv.id}</td>
                  <td className="font-medium">{inv.client}</td>
                  <td>{inv.date}</td>
                  <td>{inv.due}</td>
                  <td className="text-right font-semibold">{formatINR(inv.amount)}</td>
                  <td className="text-center">
                    <span className={`zb-status-pill ${inv.status.toLowerCase()}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-center">
                    <button
                      className="zb-table-btn"
                      onClick={() => showToast(`Downloaded PDF for ${inv.id}`)}
                    >
                      View PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create Invoice Modal */}
        {modalType === 'new_invoice' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
              <div className="zb-auth-header">
                <h3 className="zb-auth-title">Create New Invoice</h3>
                <button className="zb-modal-close" onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateInvoice} className="zb-auth-form">
                <div className="zb-form-group">
                  <label className="zb-label">Client Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g. Reliance Retail Ltd"
                    value={newInvClient}
                    onChange={e => setNewInvClient(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Invoice Amount (₹)</label>
                  <input
                    type="number"
                    className="zb-input"
                    placeholder="e.g. 125000"
                    value={newInvAmount}
                    onChange={e => setNewInvAmount(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Save & Generate Invoice
                </button>
              </form>
            </div>
          </div>
        )}
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
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Total Logged Hours</span>
            <div className="zb-mini-stat-value text-primary">{totalHours} hrs</div>
            <span className="zb-mini-stat-sub">Across 4 active client projects</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Billable Hours</span>
            <div className="zb-mini-stat-value text-success">{billableHours} hrs</div>
            <span className="zb-mini-stat-sub">{Math.round((billableHours / (totalHours || 1)) * 100)}% billable efficiency</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Unbilled Revenue Value</span>
            <div className="zb-mini-stat-value text-primary">{formatINR(unbilledAmount)}</div>
            <span className="zb-mini-stat-sub">Ready to convert to client invoice</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Active Consultants</span>
            <div className="zb-mini-stat-value">4 Specialists</div>
            <span className="zb-mini-stat-sub">Tracked in real time</span>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="zb-toolbar-container zb-flex-between zb-section-spacing">
          <div className="zb-filter-tabs">
            <button className={`zb-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Logs</button>
            <button className={`zb-tab-btn ${activeTab === 'billable' ? 'active' : ''}`} onClick={() => setActiveTab('billable')}>Billable Only</button>
            <button className={`zb-tab-btn ${activeTab === 'non_billable' ? 'active' : ''}`} onClick={() => setActiveTab('non_billable')}>Non-Billable</button>
          </div>
          <div className="zb-search-box">
            <Search size={15} className="zb-search-icon" />
            <input
              type="text"
              placeholder="Search by project, task, consultant..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Timesheets Table */}
        <div className="zb-table-card">
          <table className="zb-data-table">
            <thead>
              <tr>
                <th>LOG ID</th>
                <th>PROJECT & TASK</th>
                <th>CONSULTANT</th>
                <th>DATE</th>
                <th>HOURS</th>
                <th>RATE</th>
                <th>TOTAL AMOUNT</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ts => (
                <tr key={ts.id}>
                  <td className="font-medium text-primary">{ts.id}</td>
                  <td>
                    <div className="font-semibold">{ts.project}</div>
                    <div className="text-muted text-xs">{ts.task}</div>
                  </td>
                  <td>{ts.consultant}</td>
                  <td>{ts.date}</td>
                  <td><span className="font-bold">{ts.hours} hrs</span></td>
                  <td>{formatINR(ts.rate)}/hr</td>
                  <td className="font-semibold">{formatINR(ts.hours * ts.rate)}</td>
                  <td>
                    <span className={`zb-status-pill ${ts.billable ? 'success' : 'neutral'}`}>
                      {ts.billable ? 'Billable' : 'Non-Billable'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="zb-btn zb-btn-sm zb-btn-secondary"
                      onClick={() => showToast(`Timesheet ${ts.id} linked to pending invoice draft!`)}
                    >
                      Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <button className="zb-btn zb-btn-primary" onClick={() => setModalType('upload_document')}>
              <Plus size={16} /> Upload Document
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Total Vault Files</span>
            <div className="zb-mini-stat-value text-primary">{documentsList.length} Files</div>
            <span className="zb-mini-stat-sub">100% cloud encrypted</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Audit Verified</span>
            <div className="zb-mini-stat-value text-success">
              {documentsList.filter(d => d.verified).length} Verified
            </div>
            <span className="zb-mini-stat-sub">GST auditor ready</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Storage Allocated</span>
            <div className="zb-mini-stat-value">1.4 GB / 50 GB</div>
            <span className="zb-mini-stat-sub">High-availability cloud</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Security Compliance</span>
            <div className="zb-mini-stat-value text-success">AES-256</div>
            <span className="zb-mini-stat-sub">ISO 27001 Certified</span>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="zb-toolbar-container zb-flex-between zb-section-spacing">
          <div className="zb-filter-tabs">
            <button className={`zb-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Documents</button>
            <button className={`zb-tab-btn ${activeTab === 'tax' ? 'active' : ''}`} onClick={() => setActiveTab('tax')}>Tax & GST</button>
            <button className={`zb-tab-btn ${activeTab === 'banking' ? 'active' : ''}`} onClick={() => setActiveTab('banking')}>Bank Statements</button>
            <button className={`zb-tab-btn ${activeTab === 'legal' ? 'active' : ''}`} onClick={() => setActiveTab('legal')}>Contracts</button>
            <button className={`zb-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>Bills & Receipts</button>
          </div>
          <div className="zb-search-box">
            <Search size={15} className="zb-search-icon" />
            <input
              type="text"
              placeholder="Search documents by name or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Documents Table */}
        <div className="zb-table-card">
          <table className="zb-data-table">
            <thead>
              <tr>
                <th>DOC ID</th>
                <th>DOCUMENT NAME</th>
                <th>CATEGORY</th>
                <th>UPLOADED BY</th>
                <th>UPLOAD DATE</th>
                <th>FILE SIZE</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id}>
                  <td className="font-medium text-primary">{doc.id}</td>
                  <td>
                    <div className="zb-flex-align gap-2">
                      <FileText size={16} className="text-muted" />
                      <span className="font-semibold">{doc.title}</span>
                    </div>
                  </td>
                  <td><span className="zb-badge-category">{doc.category}</span></td>
                  <td>{doc.uploadedBy}</td>
                  <td>{doc.date}</td>
                  <td>{doc.size}</td>
                  <td>
                    <span className={`zb-status-pill ${doc.verified ? 'success' : 'warning'}`}>
                      {doc.verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="zb-btn zb-btn-sm zb-btn-secondary"
                      onClick={() => showToast(`Downloaded: ${doc.title}`)}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal: Upload Document */}
        {modalType === 'upload_document' && (
          <div className="zb-modal-backdrop" onClick={() => setModalType(null)}>
            <div className="zb-modal-card" onClick={e => e.stopPropagation()}>
              <div className="zb-modal-header">
                <h3>Upload Document</h3>
                <button className="zb-close-btn" onClick={() => setModalType(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleUploadDocument} className="zb-modal-form">
                <div className="zb-form-group">
                  <label>Document Title / Filename *</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g., GSTR_3B_Filing_Confirmation_August2026.pdf"
                    value={newDocTitle}
                    onChange={e => setNewDocTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label>Category *</label>
                  <select
                    className="zb-input"
                    value={newDocCategory}
                    onChange={e => setNewDocCategory(e.target.value)}
                  >
                    <option value="Tax & GST">Tax & GST</option>
                    <option value="Invoices & Bills">Invoices & Bills</option>
                    <option value="Bank Statements">Bank Statements</option>
                    <option value="Legal & Contracts">Legal & Contracts</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label>Audit Notes (Optional)</label>
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="e.g., Verified by Statutory Auditor on 04 Sep"
                    value={newDocNote}
                    onChange={e => setNewDocNote(e.target.value)}
                  />
                </div>
                <button type="submit" className="zb-btn zb-btn-primary zb-btn-block">
                  Upload to Vault
                </button>
              </form>
            </div>
          </div>
        )}
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

    const handleAddEmployee = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newEmpName || !newEmpGross) return;

      const gross = parseFloat(newEmpGross);
      const deductions = Math.round(gross * 0.12);
      const net = gross - deductions;

      const newEmp = {
        id: `EMP-${100 + employees.length + 1}`,
        name: newEmpName,
        designation: newEmpRole || 'Software Specialist',
        department: newEmpDept,
        gross,
        deductions,
        net,
        status: 'Processing',
      };

      setEmployees([newEmp, ...employees]);
      setNewEmpName('');
      setNewEmpRole('');
      setNewEmpGross('');
      setModalType(null);
      showToast(`Employee ${newEmp.name} added to payroll register!`);
    };

    const handleRunPayBatch = () => {
      setEmployees(employees.map(e => ({ ...e, status: 'Paid' })));
      showToast(`Monthly payroll disbursed! Net ${formatINR(totalNet)} transferred across ${employees.length} employee accounts.`);
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
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Total Monthly Payroll</span>
            <div className="zb-mini-stat-value text-primary">{formatINR(totalGross)}</div>
            <span className="zb-mini-stat-sub">Across {employees.length} team members</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Statutory Deductions (EPF/PT)</span>
            <div className="zb-mini-stat-value text-danger">{formatINR(totalDeductions)}</div>
            <span className="zb-mini-stat-sub">Challan ready for EPFO portal</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Net Salary Disbursed</span>
            <div className="zb-mini-stat-value text-success">{formatINR(totalNet)}</div>
            <span className="zb-mini-stat-sub">Direct bank transfer via IMPS/NEFT</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Next Pay Cycle</span>
            <div className="zb-mini-stat-value">30 Sep 2026</div>
            <span className="zb-mini-stat-sub">Automated direct deposits</span>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="zb-toolbar-container zb-flex-between zb-section-spacing">
          <div className="zb-filter-tabs">
            <button className={`zb-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Departments</button>
            <button className={`zb-tab-btn ${activeTab === 'engineering' ? 'active' : ''}`} onClick={() => setActiveTab('engineering')}>Engineering</button>
            <button className={`zb-tab-btn ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>Finance</button>
            <button className={`zb-tab-btn ${activeTab === 'operations' ? 'active' : ''}`} onClick={() => setActiveTab('operations')}>Operations</button>
          </div>
          <div className="zb-search-box">
            <Search size={15} className="zb-search-icon" />
            <input
              type="text"
              placeholder="Search employee by name, role, department..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Payroll Table */}
        <div className="zb-table-card">
          <table className="zb-data-table">
            <thead>
              <tr>
                <th>EMP ID</th>
                <th>EMPLOYEE NAME</th>
                <th>ROLE & TITLE</th>
                <th>DEPARTMENT</th>
                <th>GROSS SALARY</th>
                <th>DEDUCTIONS</th>
                <th>NET SALARY</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id}>
                  <td className="font-medium text-primary">{emp.id}</td>
                  <td className="font-semibold">{emp.name}</td>
                  <td>{emp.designation}</td>
                  <td><span className="zb-badge-category">{emp.department}</span></td>
                  <td>{formatINR(emp.gross)}</td>
                  <td className="text-danger font-medium">-{formatINR(emp.deductions)}</td>
                  <td className="font-bold text-success">{formatINR(emp.net)}</td>
                  <td>
                    <span className={`zb-status-pill ${emp.status === 'Paid' ? 'success' : 'warning'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="zb-btn zb-btn-sm zb-btn-secondary"
                      onClick={() => showToast(`Payslip generated for ${emp.name} (Ref: PS-${emp.id})`)}
                    >
                      View Payslip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Total Collections</span>
            <div className="zb-mini-stat-value text-primary">{formatINR(totalCollected)}</div>
            <span className="zb-mini-stat-sub">Automated bank reconciliation</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">UPI QR Collections</span>
            <div className="zb-mini-stat-value text-success">₹4,30,000</div>
            <span className="zb-mini-stat-sub">Zero transaction fee</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Settlement Rate</span>
            <div className="zb-mini-stat-value text-success">T+0 Instant</div>
            <span className="zb-mini-stat-sub">Direct into HDFC / ICICI accounts</span>
          </div>
          <div className="zb-card zb-mini-stat-card">
            <span className="zb-mini-stat-label">Active Links</span>
            <div className="zb-mini-stat-value">12 Active Links</div>
            <span className="zb-mini-stat-sub">Automated WhatsApp & Email dispatch</span>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="zb-toolbar-container zb-flex-between zb-section-spacing">
          <div className="zb-filter-tabs">
            <button className={`zb-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Transactions</button>
            <button className={`zb-tab-btn ${activeTab === 'upi' ? 'active' : ''}`} onClick={() => setActiveTab('upi')}>UPI QR</button>
            <button className={`zb-tab-btn ${activeTab === 'netbanking' ? 'active' : ''}`} onClick={() => setActiveTab('netbanking')}>NetBanking</button>
            <button className={`zb-tab-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>Credit / Debit Cards</button>
          </div>
          <div className="zb-search-box">
            <Search size={15} className="zb-search-icon" />
            <input
              type="text"
              placeholder="Search by customer, transaction ref, invoice..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Payments Table */}
        <div className="zb-table-card">
          <table className="zb-data-table">
            <thead>
              <tr>
                <th>TRANSACTION REF</th>
                <th>CUSTOMER NAME</th>
                <th>INVOICE REF</th>
                <th>PAYMENT METHOD</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-medium text-primary">{p.id}</td>
                  <td className="font-semibold">{p.customer}</td>
                  <td><span className="text-muted">{p.invoiceRef}</span></td>
                  <td>
                    <div className="zb-flex-align gap-2">
                      <CreditCard size={15} className="text-primary" />
                      <span>{p.method}</span>
                    </div>
                  </td>
                  <td>{p.date}</td>
                  <td className="font-bold text-success">{formatINR(p.amount)}</td>
                  <td>
                    <span className={`zb-status-pill ${p.status === 'Settled' ? 'success' : 'warning'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="zb-btn zb-btn-sm zb-btn-secondary"
                      onClick={() => {
                        navigator.clipboard?.writeText(`https://pay.roomanbooks.com/${p.id}`);
                        showToast(`Copied payment link for ${p.customer}!`);
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
