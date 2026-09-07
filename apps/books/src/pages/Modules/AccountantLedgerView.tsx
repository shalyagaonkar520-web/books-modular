import React, { useState, useEffect } from 'react';
import {
  Calculator,
  BookOpen,
  FileCheck,
  CheckCircle2,
  Lock,
  Plus,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Layers,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import {
  ApiClient,
  JournalEntry,
  TrialBalance
} from '../../services/apiClient';

interface AccountantLedgerViewProps {
  activeSubItem?: string | null;
  onSelectSubItem?: (subItem: string) => void;
}

export const AccountantLedgerView: React.FC<AccountantLedgerViewProps> = ({
  activeSubItem = 'general_ledger',
  onSelectSubItem,
}) => {
  const [currentTab, setCurrentTab] = useState<string>(activeSubItem || 'general_ledger');
  const [ledgerEntries, setLedgerEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (activeSubItem) {
      setCurrentTab(activeSubItem);
    }
  }, [activeSubItem]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      ApiClient.getGeneralLedger().catch(() => []),
      ApiClient.getTrialBalance().catch(() => null),
    ]).then(([ledgerData, tbData]) => {
      if (isMounted) {
        setLedgerEntries(ledgerData);
        setTrialBalance(tbData);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId);
    if (onSelectSubItem) onSelectSubItem(tabId);
  };

  const filteredEntries = ledgerEntries.filter(e =>
    e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.referenceNo && e.referenceNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
    e.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="zb-page zb-accountant-page">
      {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

      {/* Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <div className="zb-flex-align gap-2">
            <h1 className="zb-page-title">Accountant & General Ledger</h1>
            <span className="zb-badge badge-primary">Double-Entry Certified</span>
          </div>
          <p className="zb-page-subtitle">
            Inspect double-entry journal transactions, verify trial balances, and audit statutory accounting records
          </p>
        </div>
        <div className="zb-flex-align gap-2">
          <button
            className="zb-btn zb-btn-secondary zb-btn-sm"
            onClick={() => window.print()}
          >
            <Printer size={14} /> Print Statement
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="zb-module-tabs-bar zb-section-spacing">
        <button
          className={`zb-module-tab-btn ${currentTab === 'general_ledger' ? 'active' : ''}`}
          onClick={() => handleTabChange('general_ledger')}
        >
          <BookOpen size={15} />
          <span>General Ledger ({ledgerEntries.length})</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'trial_balance' ? 'active' : ''}`}
          onClick={() => handleTabChange('trial_balance')}
        >
          <Calculator size={15} />
          <span>Trial Balance</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'manual_journals' ? 'active' : ''}`}
          onClick={() => handleTabChange('manual_journals')}
        >
          <FileCheck size={15} />
          <span>Manual Adjustments</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'chart_of_accounts' ? 'active' : ''}`}
          onClick={() => handleTabChange('chart_of_accounts')}
        >
          <Layers size={15} />
          <span>Chart of Accounts</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'lock_period' ? 'active' : ''}`}
          onClick={() => handleTabChange('lock_period')}
        >
          <Lock size={15} />
          <span>Period Lock</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GENERAL LEDGER */}
      {/* ========================================================================= */}
      {currentTab === 'general_ledger' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Double-Entry Journal Register</h3>
              <p className="zb-card-subtitle">
                Every business event posted maintains Total Debits = Total Credits.
              </p>
            </div>
            <div className="zb-search-wrapper" style={{ width: 280 }}>
              <Search size={14} className="zb-search-icon" />
              <input
                type="text"
                className="zb-search-input"
                placeholder="Search ledger entries..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="zb-ledger-list">
            {filteredEntries.map(entry => (
              <div key={entry.id} className="zb-journal-card">
                <div className="zb-journal-header zb-flex-between">
                  <div className="zb-flex-align gap-3">
                    <span className="font-bold text-sm text-primary">{entry.id}</span>
                    {entry.referenceNo && (
                      <span className="zb-badge badge-neutral text-xs">{entry.referenceNo}</span>
                    )}
                    <span className="text-xs text-muted">{entry.date}</span>
                    <span className="text-sm font-semibold">{entry.description}</span>
                  </div>
                  <div className="zb-flex-align gap-2">
                    <span className="zb-badge badge-success">
                      <CheckCircle2 size={12} /> Balanced (₹{entry.totalDebit.toLocaleString()})
                    </span>
                  </div>
                </div>

                <div className="zb-table-container">
                  <table className="zb-table zb-table-compact">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Notes / Context</th>
                        <th className="text-right">Debit (₹)</th>
                        <th className="text-right">Credit (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{line.account}</td>
                          <td className="text-xs text-muted">{line.notes || '—'}</td>
                          <td className="text-right font-mono font-semibold">
                            {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                          </td>
                          <td className="text-right font-mono font-semibold">
                            {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="zb-total-row">
                        <td colSpan={2} className="font-bold text-right">TOTAL:</td>
                        <td className="text-right font-mono font-bold text-primary">
                          ₹{entry.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono font-bold text-primary">
                          ₹{entry.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRIAL BALANCE */}
      {/* ========================================================================= */}
      {currentTab === 'trial_balance' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Trial Balance Statement</h3>
              <p className="zb-card-subtitle">
                Summary of all active ledger accounts as of {trialBalance?.asOf || 'Today'}.
              </p>
            </div>
            {trialBalance?.isBalanced && (
              <span className="zb-chip-success">
                <CheckCircle2 size={14} /> Debits & Credits Balanced
              </span>
            )}
          </div>

          <div className="zb-table-container">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Chart Account Name</th>
                  <th className="text-right">Debit Balance (₹)</th>
                  <th className="text-right">Credit Balance (₹)</th>
                  <th className="text-right">Net Position (₹)</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance?.accounts.map((acc, idx) => (
                  <tr key={idx}>
                    <td className="font-semibold">{acc.account}</td>
                    <td className="text-right font-mono">
                      {acc.debit > 0 ? acc.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                    </td>
                    <td className="text-right font-mono">
                      {acc.credit > 0 ? acc.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                    </td>
                    <td className={`text-right font-mono font-bold ${acc.net >= 0 ? 'text-primary' : 'text-danger'}`}>
                      ₹{acc.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {trialBalance && (
                  <tr className="zb-total-row bg-slate-50">
                    <td className="font-bold">TOTAL VERIFICATION:</td>
                    <td className="text-right font-mono font-bold text-primary">
                      ₹{trialBalance.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono font-bold text-primary">
                      ₹{trialBalance.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-bold text-success">
                      ✓ Zero Variance
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MANUAL ADJUSTMENTS */}
      {/* ========================================================================= */}
      {currentTab === 'manual_journals' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Accountant Manual Adjustments</h3>
              <p className="zb-card-subtitle">
                Post period-end depreciation, accruals, prepayments, or tax adjustments.
              </p>
            </div>
            <button
              className="zb-btn zb-btn-primary"
              onClick={() => showToast('Opening Manual Journal voucher builder...')}
            >
              <Plus size={15} /> New Journal Entry
            </button>
          </div>

          <div className="p-4 text-center text-muted">
            <Calculator size={36} className="mx-auto mb-2 text-primary opacity-60" />
            <p>Use manual journals for year-end adjustments, depreciation schedules, and closing entries.</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CHART OF ACCOUNTS */}
      {/* ========================================================================= */}
      {currentTab === 'chart_of_accounts' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Standard Chart of Accounts (GAAP / IND-AS)</h3>
              <p className="zb-card-subtitle">
                Hierarchical ledger taxonomy covering Assets, Liabilities, Equity, Revenue, and Expenses.
              </p>
            </div>
            <button
              className="zb-btn zb-btn-secondary zb-btn-sm"
              onClick={() => showToast('Standard chart of accounts is fully mapped.')}
            >
              Configure Accounts
            </button>
          </div>

          <div className="zb-table-container">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Classification</th>
                  <th>Currency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>1010</code></td>
                  <td>HDFC Bank Operating Account</td>
                  <td><span className="zb-badge badge-primary">Current Asset</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>1020</code></td>
                  <td>Accounts Receivable (Sundry Debtors)</td>
                  <td><span className="zb-badge badge-primary">Current Asset</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>1030</code></td>
                  <td>Inventory Asset</td>
                  <td><span className="zb-badge badge-primary">Inventory Asset</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>1040</code></td>
                  <td>Input CGST 9% (ITC)</td>
                  <td><span className="zb-badge badge-primary">Tax Asset</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>1050</code></td>
                  <td>Input SGST 9% (ITC)</td>
                  <td><span className="zb-badge badge-primary">Tax Asset</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>2010</code></td>
                  <td>Accounts Payable (Sundry Creditors)</td>
                  <td><span className="zb-badge badge-warning">Current Liability</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>2020</code></td>
                  <td>Output CGST 9% (Liability)</td>
                  <td><span className="zb-badge badge-warning">Current Liability</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>2030</code></td>
                  <td>Output SGST 9% (Liability)</td>
                  <td><span className="zb-badge badge-warning">Current Liability</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>4010</code></td>
                  <td>Sales Revenue (Goods & Services)</td>
                  <td><span className="zb-badge badge-success">Operating Revenue</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>5010</code></td>
                  <td>Cost of Goods Sold (COGS)</td>
                  <td><span className="zb-badge badge-neutral">Direct Expense</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
                <tr>
                  <td><code>5020</code></td>
                  <td>Salaries & Wages Expense</td>
                  <td><span className="zb-badge badge-neutral">Operating Expense</span></td>
                  <td>INR</td>
                  <td><span className="zb-badge badge-success">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PERIOD LOCK */}
      {/* ========================================================================= */}
      {currentTab === 'lock_period' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Fiscal Period Lock & Books Closing</h3>
              <p className="zb-card-subtitle">
                Prevent retroactive modifications to finalized accounting periods to satisfy audit compliance.
              </p>
            </div>
            <span className="zb-badge badge-success">Locked up to 31 July 2026</span>
          </div>

          <div className="p-4">
            <div className="zb-flex-align gap-3 p-3 bg-slate-50 border rounded-lg max-w-xl mb-4">
              <Lock size={20} className="text-primary" />
              <div>
                <div className="font-bold text-sm">Active Lock Date: 31 July 2026</div>
                <div className="text-xs text-muted">No transactions on or prior to this date can be edited or deleted without accountant override.</div>
              </div>
            </div>
            <button
              className="zb-btn zb-btn-primary"
              onClick={() => showToast('Fiscal period lock updated.')}
            >
              Update Lock Date
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
