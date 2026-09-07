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
  Users
} from 'lucide-react';

interface ModuleViewProps {
  module: NavModule;
  onNavigate: (module: NavModule) => void;
}

export const ModuleView: React.FC<ModuleViewProps> = ({ module, onNavigate }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Sales Module
  if (module === 'sales') {
    const invoices = [
      { id: 'INV-00104', client: 'Infosys BPM Limited', date: '02 Sep 2026', due: '16 Sep 2026', amount: 185000, status: 'Sent' },
      { id: 'INV-00103', client: 'Tata Consultancy Services', date: '28 Aug 2026', due: '11 Sep 2026', amount: 342000, status: 'Paid' },
      { id: 'INV-00102', client: 'Wipro Digital Labs', date: '20 Aug 2026', due: '03 Sep 2026', amount: 98500, status: 'Overdue' },
      { id: 'INV-00101', client: 'Razorpay Software Pvt Ltd', date: '15 Aug 2026', due: '30 Aug 2026', amount: 215000, status: 'Paid' },
      { id: 'INV-00100', client: 'Swiggy Technologies', date: '08 Aug 2026', due: '22 Aug 2026', amount: 145000, status: 'Paid' },
    ];

    const filtered = invoices.filter(inv =>
      inv.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="zb-page zb-module-page">
        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Sales & Invoicing</h1>
            <p className="zb-page-subtitle">Track client invoices, customer retainers, and GST compliant tax invoices</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button className="zb-btn zb-btn-secondary"><Download size={15} /> Export</button>
            <button className="zb-btn zb-btn-primary"><Plus size={16} /> New Invoice</button>
          </div>
        </div>

        {/* Sales Metric Cards */}
        <div className="zb-dashboard-grid four-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Invoiced</div>
            <div className="zb-metric-mini-val text-primary">{formatINR(985500)}</div>
            <div className="zb-metric-mini-sub text-success"><TrendingUp size={12} /> +18.4% vs last month</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Paid Receipts</div>
            <div className="zb-metric-mini-val text-success">{formatINR(702000)}</div>
            <div className="zb-metric-mini-sub">4 invoices cleared</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Due / Pending</div>
            <div className="zb-metric-mini-val text-warning">{formatINR(185000)}</div>
            <div className="zb-metric-mini-sub">Due in next 9 days</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Overdue</div>
            <div className="zb-metric-mini-val text-danger">{formatINR(98500)}</div>
            <div className="zb-metric-mini-sub text-danger">1 invoice overdue</div>
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
              <button className={`zb-tab-chip ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All (5)</button>
              <button className={`zb-tab-chip ${activeTab === 'paid' ? 'active' : ''}`} onClick={() => setActiveTab('paid')}>Paid</button>
              <button className={`zb-tab-chip ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending</button>
              <button className={`zb-tab-chip ${activeTab === 'overdue' ? 'active' : ''}`} onClick={() => setActiveTab('overdue')}>Overdue</button>
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
                    <button className="zb-table-btn">View PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. Purchases Module
  if (module === 'purchases') {
    const bills = [
      { id: 'BILL-8092', vendor: 'TechDistro India Pvt Ltd', category: 'Hardware Procurement', date: '01 Sep 2026', amount: 145000, status: 'Paid' },
      { id: 'BILL-8091', vendor: 'Urban Space Supplies', category: 'Office Furniture', date: '25 Aug 2026', amount: 55200, status: 'Pending' },
      { id: 'BILL-8090', vendor: 'LogiDirect Traders', category: 'Peripherals Supply', date: '19 Aug 2026', amount: 25600, status: 'Paid' },
      { id: 'BILL-8089', vendor: 'Amazon Web Services AWS', category: 'Cloud Hosting & Servers', date: '10 Aug 2026', amount: 48900, status: 'Paid' },
    ];

    return (
      <div className="zb-page zb-module-page">
        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Purchases & Vendor Bills</h1>
            <p className="zb-page-subtitle">Track supplier bills, purchase orders, recurring expenses and vendor credits</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button className="zb-btn zb-btn-secondary"><Download size={15} /> Export</button>
            <button className="zb-btn zb-btn-primary"><Plus size={16} /> Record New Bill</button>
          </div>
        </div>

        <div className="zb-dashboard-grid three-col zb-section-spacing">
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Total Purchases (This Month)</div>
            <div className="zb-metric-mini-val text-primary">{formatINR(274700)}</div>
            <div className="zb-metric-mini-sub">4 vendor bills processed</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Outstanding Payables</div>
            <div className="zb-metric-mini-val text-warning">{formatINR(55200)}</div>
            <div className="zb-metric-mini-sub">Due in 5 days</div>
          </div>
          <div className="zb-metric-mini-card">
            <div className="zb-metric-mini-label">Input GST Credit (ITC)</div>
            <div className="zb-metric-mini-val text-success">{formatINR(49446)}</div>
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
      </div>
    );
  }

  // 3. Banking Module
  if (module === 'banking') {
    const bankAccounts = [
      { name: 'HDFC Bank Corporate Current A/C', accNo: '50200049281928', balance: 1452800.50, feeds: 'Connected', lastSync: '10 mins ago' },
      { name: 'ICICI Bank Smart Business A/C', accNo: '001205018274', balance: 875200.00, feeds: 'Connected', lastSync: '1 hour ago' },
      { name: 'State Bank of India (SBI) GST Escrow', accNo: '38192019482', balance: 340000.00, feeds: 'Connected', lastSync: '3 hours ago' },
    ];

    return (
      <div className="zb-page zb-module-page">
        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Banking & Reconciliation</h1>
            <p className="zb-page-subtitle">Real-time bank feed integrations, automatic statement rules, and 1-click reconciliation</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button className="zb-btn zb-btn-secondary"><Landmark size={15} /> Add Bank Account</button>
            <button className="zb-btn zb-btn-primary"><CheckCircle2 size={16} /> Reconcile All Feeds</button>
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
      </div>
    );
  }

  // 4. Reports Module
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
        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Financial Reports & Compliance</h1>
            <p className="zb-page-subtitle">Accurate, audit-ready financial statements, GST filings and ledger summaries</p>
          </div>
          <button className="zb-btn zb-btn-primary"><Download size={15} /> Export Audit Package</button>
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
                  <li key={idx} className="zb-report-item">
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

  // 5. Accountant Module
  if (module === 'accountant') {
    return (
      <div className="zb-page zb-module-page">
        <div className="zb-page-header zb-flex-between">
          <div>
            <h1 className="zb-page-title">Accountant & Chart of Accounts</h1>
            <p className="zb-page-subtitle">Manual journals, opening balances, trial balances, and fiscal year adjustments</p>
          </div>
          <div className="zb-flex-align gap-3">
            <button className="zb-btn zb-btn-secondary"><Calculator size={15} /> Run Trial Balance</button>
            <button className="zb-btn zb-btn-primary"><Plus size={16} /> New Manual Journal</button>
          </div>
        </div>

        <div className="zb-card zb-table-container zb-section-spacing">
          <div className="zb-table-header-bar zb-flex-between p-3">
            <h3 className="font-semibold text-dark">Recent Journal Entries</h3>
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
              <tr>
                <td className="font-semibold text-primary">JRN-2026-004</td>
                <td>01 Sep 2026</td>
                <td>Monthly office rent provision</td>
                <td>Rent Expense (A/C 502)</td>
                <td>HDFC Bank Current (A/C 101)</td>
                <td className="text-right font-semibold">{formatINR(85000)}</td>
                <td className="text-center"><span className="zb-status-pill paid">Posted</span></td>
              </tr>
              <tr>
                <td className="font-semibold text-primary">JRN-2026-003</td>
                <td>28 Aug 2026</td>
                <td>Hardware asset depreciation</td>
                <td>Depreciation Expense</td>
                <td>Accumulated Depreciation</td>
                <td className="text-right font-semibold">{formatINR(24500)}</td>
                <td className="text-center"><span className="zb-status-pill paid">Posted</span></td>
              </tr>
              <tr>
                <td className="font-semibold text-primary">JRN-2026-002</td>
                <td>15 Aug 2026</td>
                <td>Prepaid insurance amortization</td>
                <td>Insurance Expense</td>
                <td>Prepaid Insurance</td>
                <td className="text-right font-semibold">{formatINR(12000)}</td>
                <td className="text-center"><span className="zb-status-pill paid">Posted</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 6. Generic Fallback for other unlocked modules (Time Tracking, Documents, Payroll, Payments)
  const metaMap: Record<string, { title: string; subtitle: string; icon: React.ReactNode; cta: string }> = {
    time_tracking: {
      title: 'Time Tracking & Projects',
      subtitle: 'Log billable hours, project milestones, and convert timesheets into client invoices',
      icon: <Clock size={24} className="text-primary" />,
      cta: 'Log Time Entry',
    },
    documents: {
      title: 'Documents & Receipts Inbox',
      subtitle: 'Secure cloud repository for purchase receipts, vendor contracts, and tax documents',
      icon: <FileText size={24} className="text-primary" />,
      cta: 'Upload Document',
    },
    payroll: {
      title: 'Zoho Payroll Integration',
      subtitle: 'Automate employee salaries, provident fund (PF), ESI, and professional tax filings',
      icon: <DollarSign size={24} className="text-primary" />,
      cta: 'Run Payroll Batch',
    },
    payments: {
      title: 'Payment Gateways & UPI',
      subtitle: 'Accept credit cards, NetBanking, UPI, and send automated payment reminder links',
      icon: <CreditCard size={24} className="text-primary" />,
      cta: 'Configure Gateway',
    },
  };

  const meta = metaMap[module] || {
    title: 'Accounting Module',
    subtitle: 'Unlocked and fully accessible in Zoho Rooman Books',
    icon: <Users size={24} className="text-primary" />,
    cta: 'New Entry',
  };

  return (
    <div className="zb-page zb-module-page">
      <div className="zb-page-header zb-flex-between">
        <div>
          <h1 className="zb-page-title">{meta.title}</h1>
          <p className="zb-page-subtitle">{meta.subtitle}</p>
        </div>
        <button className="zb-btn zb-btn-primary"><Plus size={16} /> {meta.cta}</button>
      </div>

      <div className="zb-card zb-empty-state-card text-center p-5 zb-section-spacing">
        <div className="zb-empty-icon-circle mx-auto mb-3">
          {meta.icon}
        </div>
        <h3 className="font-bold text-xl mb-2">{meta.title} Active</h3>
        <p className="text-muted max-w-lg mx-auto mb-4">
          All locks have been removed. This module is connected to your primary SQLite accounting database and ready for transactions.
        </p>
        <div className="zb-flex-align justify-center gap-3">
          <button className="zb-btn zb-btn-secondary" onClick={() => onNavigate('items')}>View Inventory Items</button>
          <button className="zb-btn zb-btn-primary" onClick={() => onNavigate('home')}>Go to Dashboard Overview</button>
        </div>
      </div>
    </div>
  );
};
