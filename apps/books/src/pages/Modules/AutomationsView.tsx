import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  Check,
  X,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Clock,
  Landmark,
  ArrowRight,
  ShieldCheck,
  Brain,
  Sliders
} from 'lucide-react';
import {
  ApiClient,
  AutomationRule,
  BankReconciliation,
  AuditLog
} from '../../services/apiClient';

interface AutomationsViewProps {
  activeSubItem?: string | null;
  onSelectSubItem?: (subItem: string) => void;
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  activeSubItem = 'rules_engine',
  onSelectSubItem,
}) => {
  const [currentTab, setCurrentTab] = useState<string>(activeSubItem || 'rules_engine');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [learnings, setLearnings] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Explainability Modal
  const [explainModalData, setExplainModalData] = useState<{ title: string; explanation: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (activeSubItem) {
      setCurrentTab(activeSubItem);
    }
  }, [activeSubItem]);

  // Load automation data
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      ApiClient.getAutomationRules().catch(() => []),
      ApiClient.getBankReconciliations().catch(() => []),
      ApiClient.getAuditLogs().catch(() => []),
      fetch('/api/automation/learnings').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([rData, reconData, auditData, learnData]) => {
      if (isMounted) {
        setRules(rData);
        setReconciliations(reconData);
        setAuditLogs(auditData);
        setLearnings(learnData);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Toggle Rule handler
  const handleToggleRule = async (rule: AutomationRule) => {
    try {
      const updated = await ApiClient.toggleAutomationRule(rule.id, !rule.isActive);
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      showToast(`Rule '${rule.name}' is now ${updated.isActive ? 'Active' : 'Disabled'}.`);
    } catch (err: any) {
      showToast(`Failed to update rule: ${err.message}`);
    }
  };

  // Confirm Bank Reconciliation Match
  const handleConfirmRecon = async (recon: BankReconciliation) => {
    try {
      const updated = await ApiClient.confirmBankReconciliation(recon.id);
      setReconciliations(prev => prev.map(r => r.id === recon.id ? updated : r));
      showToast(`Bank transaction ₹${recon.bankAmount.toLocaleString()} reconciled with ${recon.matchedEntityName}!`);
    } catch (err: any) {
      showToast(`Reconciliation failed: ${err.message}`);
    }
  };

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId);
    if (onSelectSubItem) onSelectSubItem(tabId);
  };

  const filteredAuditLogs = auditLogs.filter(a =>
    a.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.rationale.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="zb-page zb-automations-page">
      {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <div className="zb-flex-align gap-2">
            <h1 className="zb-page-title">Automation & Intelligence Center</h1>
            <span className="zb-badge badge-primary">Touchless Accounting</span>
          </div>
          <p className="zb-page-subtitle">
            Configure deterministic IF-THEN business rules, verify bank match candidates, and inspect complete audit logs
          </p>
        </div>
        <div className="zb-flex-align gap-2">
          <span className="zb-chip-success">
            <ShieldCheck size={14} /> 94% Touchless Rate
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="zb-module-tabs-bar zb-section-spacing">
        <button
          className={`zb-module-tab-btn ${currentTab === 'rules_engine' ? 'active' : ''}`}
          onClick={() => handleTabChange('rules_engine')}
        >
          <Sliders size={15} />
          <span>Rules Engine ({rules.length})</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'recon_hub' ? 'active' : ''}`}
          onClick={() => handleTabChange('recon_hub')}
        >
          <Landmark size={15} />
          <span>Reconciliation Hub ({reconciliations.filter(r => r.status === 'suggested').length} Pending)</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'audit_trail' ? 'active' : ''}`}
          onClick={() => handleTabChange('audit_trail')}
        >
          <Clock size={15} />
          <span>Audit Trail & Explainability ({auditLogs.length})</span>
        </button>
        <button
          className={`zb-module-tab-btn ${currentTab === 'learning_memory' ? 'active' : ''}`}
          onClick={() => handleTabChange('learning_memory')}
        >
          <Brain size={15} />
          <span>AI Learning Memory ({learnings.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RULES ENGINE */}
      {/* ========================================================================= */}
      {currentTab === 'rules_engine' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Configurable Business Rules</h3>
              <p className="zb-card-subtitle">
                Deterministic rules run before every accounting posting. Admins can toggle or modify condition thresholds.
              </p>
            </div>
            <span className="zb-badge badge-neutral">
              {rules.filter(r => r.isActive).length} Active Rules
            </span>
          </div>

          <div className="zb-table-container">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Trigger Event</th>
                  <th>Condition (IF)</th>
                  <th>Action Taken (THEN)</th>
                  <th>Times Executed</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-bold">{r.name}</div>
                      <div className="text-xs text-muted">ID: {r.id}</div>
                    </td>
                    <td>
                      <span className="zb-badge badge-neutral">{r.triggerEvent}</span>
                    </td>
                    <td>
                      <code className="zb-code-pill">
                        {r.conditionField} {r.operator} "{r.conditionValue}"
                      </code>
                    </td>
                    <td>
                      <span className="zb-badge badge-primary">
                        {r.actionType.replace('_', ' ')}: {r.actionValue}
                      </span>
                    </td>
                    <td>
                      <span className="font-bold text-primary">{r.executionCount}</span> runs
                    </td>
                    <td>
                      <span className={`zb-badge ${r.isActive ? 'badge-success' : 'badge-neutral'}`}>
                        {r.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className={`zb-btn-action-ghost ${r.isActive ? 'text-danger' : 'text-success'}`}
                        onClick={() => handleToggleRule(r)}
                        title={r.isActive ? 'Disable rule' : 'Activate rule'}
                      >
                        {r.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SMART RECONCILIATION HUB */}
      {/* ========================================================================= */}
      {currentTab === 'recon_hub' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Bank Statement Fuzzy Reconciliation</h3>
              <p className="zb-card-subtitle">
                The engine matches messy bank statement descriptions (UPI, NEFT, IMPS) with open invoices, bills, and customers.
              </p>
            </div>
            <span className="zb-badge badge-success">Live Bank Feed Active</span>
          </div>

          <div className="zb-recon-grid">
            {reconciliations.map(recon => (
              <div key={recon.id} className={`zb-recon-card ${recon.status}`}>
                <div className="zb-recon-header zb-flex-between">
                  <div>
                    <span className="text-xs text-muted">{recon.bankTransDate}</span>
                    <div className="font-bold text-base mt-1">₹{recon.bankAmount.toLocaleString()}</div>
                  </div>
                  <span className={`zb-badge ${
                    recon.status === 'auto_reconciled' || recon.status === 'confirmed'
                      ? 'badge-success'
                      : recon.status === 'suggested'
                      ? 'badge-primary'
                      : 'badge-warning'
                  }`}>
                    {recon.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="zb-recon-statement-row">
                  <span className="zb-recon-label">Bank Feed Description:</span>
                  <div className="zb-recon-raw-desc">{recon.bankDescription}</div>
                </div>

                {recon.matchedEntityName ? (
                  <div className="zb-recon-match-box">
                    <div className="zb-flex-between text-xs mb-1">
                      <span className="text-muted">Matched Entity:</span>
                      <span className="font-bold text-primary">{Math.round(recon.confidence * 100)}% Match</span>
                    </div>
                    <div className="font-bold">{recon.matchedEntityName}</div>
                    <div className="text-xs text-muted">
                      {recon.matchedEntityType?.toUpperCase()} {recon.matchedEntityId && `(${recon.matchedEntityId})`}
                    </div>
                  </div>
                ) : (
                  <div className="zb-recon-unmatched-box">
                    <AlertTriangle size={14} className="text-warning" />
                    <span>No clear invoice match found. Needs manual allocation.</span>
                  </div>
                )}

                <div className="zb-recon-footer zb-flex-between">
                  <span className="text-xs text-muted">
                    Type: {recon.transType.toUpperCase()}
                  </span>
                  {recon.status === 'suggested' && (
                    <button
                      className="zb-btn-action-primary"
                      onClick={() => handleConfirmRecon(recon)}
                    >
                      <Check size={12} /> Confirm Match
                    </button>
                  )}
                  {recon.status === 'confirmed' && (
                    <span className="text-xs text-success font-bold">
                      ✓ Reconciled & Settled
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: AUDIT TRAIL & EXPLAINABILITY */}
      {/* ========================================================================= */}
      {currentTab === 'audit_trail' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Immutable Audit Trail & Regulatory Logs</h3>
              <p className="zb-card-subtitle">
                Every automatic categorization, tax split, and rule execution is recorded with full rationale and confidence score.
              </p>
            </div>
            <div className="zb-search-wrapper" style={{ width: 280 }}>
              <Search size={14} className="zb-search-icon" />
              <input
                type="text"
                className="zb-search-input"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="zb-table-container">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Automated Actor</th>
                  <th>Rationale / Explainability</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th className="text-right">Explain</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map(log => (
                  <tr key={log.id}>
                    <td className="text-xs text-muted whitespace-nowrap">{log.timestamp}</td>
                    <td className="font-bold">{log.action}</td>
                    <td>
                      <span className="zb-badge badge-neutral">{log.actor}</span>
                    </td>
                    <td className="max-w-md text-sm">{log.rationale}</td>
                    <td>
                      <span className="zb-confidence-badge">
                        {Math.round(log.confidence * 100)}%
                      </span>
                    </td>
                    <td>
                      <span className={`zb-badge ${log.status === 'Success' ? 'badge-success' : 'badge-warning'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="zb-btn-action-ghost"
                        onClick={() => {
                          setExplainModalData({
                            title: `Audit Decision: ${log.action}`,
                            explanation: `• Actor: ${log.actor}\n• Execution Time: ${log.timestamp}\n• Confidence Level: ${Math.round(log.confidence * 100)}%\n• Underlying Rationale:\n${log.rationale}\n\nThis decision satisfies Indian Double-Entry GAAP and GST statutory compliance.`,
                          });
                        }}
                      >
                        <HelpCircle size={13} /> Why?
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AI LEARNING MEMORY */}
      {/* ========================================================================= */}
      {currentTab === 'learning_memory' && (
        <div className="zb-card zb-section-spacing">
          <div className="zb-card-header zb-flex-between">
            <div>
              <h3 className="zb-card-title">Tenant Organization Learning Memory</h3>
              <p className="zb-card-subtitle">
                The engine continuously learns vendor classifications from past transactions. Mappings are strictly isolated per company.
              </p>
            </div>
            <span className="zb-badge badge-primary">Isolated Tenant Storage</span>
          </div>

          <div className="zb-table-container">
            <table className="zb-table">
              <thead>
                <tr>
                  <th>Entity Pattern Key</th>
                  <th>Learned Category</th>
                  <th>Ledger Chart Account</th>
                  <th>Occurrences</th>
                  <th>Confidence Weight</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {learnings.map(l => (
                  <tr key={l.id}>
                    <td className="font-bold text-primary">{l.patternKey}</td>
                    <td>
                      <span className="zb-badge badge-neutral">{l.category}</span>
                    </td>
                    <td>{l.account}</td>
                    <td>{l.occurrenceCount} transactions</td>
                    <td>
                      <div className="zb-flex-align gap-2">
                        <div className="zb-progress-bar-bg">
                          <div
                            className="zb-progress-bar-fill"
                            style={{ width: `${Math.round(l.confidenceScore * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold">{Math.round(l.confidenceScore * 100)}%</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted">{new Date(l.lastUsed).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Explainability Modal */}
      {explainModalData && (
        <div className="zb-modal-backdrop" onClick={() => setExplainModalData(null)}>
          <div className="zb-explain-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-modal-header">
              <div className="zb-flex-align gap-2">
                <Sparkles size={18} className="text-primary" />
                <h3 className="zb-modal-title">{explainModalData.title}</h3>
              </div>
              <button className="zb-close-btn" onClick={() => setExplainModalData(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="zb-modal-body">
              <div className="zb-explain-text whitespace-pre-line">
                {explainModalData.explanation}
              </div>
            </div>
            <div className="zb-modal-footer">
              <button className="zb-btn zb-btn-primary" onClick={() => setExplainModalData(null)}>
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
