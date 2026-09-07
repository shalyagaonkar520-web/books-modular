import React, { useState } from 'react';
import {
  X,
  Users,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  DollarSign,
  FileText,
  Truck,
  Receipt,
  ExternalLink,
  CreditCard,
  Building2,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { formatINR } from '../../utils/currency';

export interface Customer360Data {
  name: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address: string;
  creditLimit: number;
  creditUsed: number;
  healthGrade: string;
  healthScore: number;
  avgPaymentDays: number;
  onTimeRatio: number;
  totalLifetimeVolume: number;
  activeOrders: number;
  executiveSummary: string;
  auditTimeline: {
    stage: string;
    ref: string;
    date: string;
    status: 'completed' | 'in_progress' | 'pending';
    detail: string;
  }[];
}

interface Customer360ModalProps {
  customer: Customer360Data | null;
  isOpen: boolean;
  onClose: () => void;
  onViewInvoice?: (invId: string) => void;
}

export const Customer360Modal: React.FC<Customer360ModalProps> = ({
  customer,
  isOpen,
  onClose,
  onViewInvoice
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'transactions'>('overview');

  if (!isOpen || !customer) return null;

  const creditAvailable = Math.max(0, customer.creditLimit - customer.creditUsed);
  const utilizationPercent = Math.min(100, Math.round((customer.creditUsed / customer.creditLimit) * 100));

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDossier = () => {
    const content = `================================================================================
           ZOHO BOOKS - ENTERPRISE CUSTOMER 360° AUDIT DOSSIER
================================================================================
Generated Date       : 07 Sep 2026 17:30 IST
Customer Legal Name  : ${customer.name}
GSTIN / UIN          : ${customer.gstin}
Permanent A/C (PAN)  : ${customer.pan}
Contact Channel      : ${customer.email} | ${customer.phone}
Billing Address      : ${customer.address}
================================================================================
CREDIT EXPOSURE & RISK METRICS:
Total Approved Limit : ${formatINR(customer.creditLimit)}
Current Outstanding  : ${formatINR(customer.creditUsed)} (${utilizationPercent}% Utilized)
Unutilized Headroom  : ${formatINR(creditAvailable)}
Customer Health Grade: ${customer.healthGrade} (Score: ${customer.healthScore}/100)
Average Settlement   : ${customer.avgPaymentDays} Days from Invoice Date
On-Time Settlement   : ${customer.onTimeRatio}%
Lifetime Sales Volume: ${formatINR(customer.totalLifetimeVolume)} across active accounts
================================================================================
EXECUTIVE INTELLIGENCE SUMMARY:
${customer.executiveSummary}
================================================================================
LIFECYCLE AUDIT CLICK-PATH:
${customer.auditTimeline.map((t, idx) => `${idx + 1}. [${t.status.toUpperCase()}] ${t.stage} (${t.ref}) - ${t.date} | ${t.detail}`).join('\n')}
================================================================================
Statutory Record retained under Rule 56 of CGST Act. Certified Clean Audit Record.`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Customer360_${customer.name.replace(/\s+/g, '_')}_Dossier.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="zb-c360-modal-overlay" onClick={onClose}>
      <div className="zb-c360-modal-container" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="zb-c360-header">
          <div className="zb-flex-align gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0066cc 0%, #0284c7 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0, 102, 204, 0.25)'
              }}
            >
              <Users size={24} />
            </div>
            <div>
              <div className="zb-flex-align gap-2">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  {customer.name}
                </h2>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ShieldCheck size={12} /> {customer.healthGrade}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                GSTIN: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{customer.gstin}</span> &bull; PAN: <span style={{ fontFamily: 'monospace' }}>{customer.pan}</span>
              </div>
            </div>
          </div>

          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={handleDownloadDossier}
              title="Download text audit dossier"
            >
              <Download size={14} style={{ marginRight: '5px' }} /> Dossier
            </button>
            <button
              className="zb-btn zb-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={handlePrint}
              title="Print Customer 360 Sheet"
            >
              <Printer size={14} style={{ marginRight: '5px' }} /> Print
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            padding: '0 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            gap: '24px',
            background: '#ffffff'
          }}
        >
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '12px 4px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'overview' ? '2px solid #0066cc' : '2px solid transparent',
              color: activeTab === 'overview' ? '#0066cc' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <DollarSign size={15} /> Credit & Intelligence
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            style={{
              padding: '12px 4px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'timeline' ? '2px solid #0066cc' : '2px solid transparent',
              color: activeTab === 'timeline' ? '#0066cc' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={15} /> Visual Audit Click-Path
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            style={{
              padding: '12px 4px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'transactions' ? '2px solid #0066cc' : '2px solid transparent',
              color: activeTab === 'transactions' ? '#0066cc' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileText size={15} /> Contact & Governance
          </button>
        </div>

        {/* Modal Body */}
        <div className="zb-c360-body">
          {/* TAB 1: OVERVIEW & CREDIT EXPOSURE */}
          {activeTab === 'overview' && (
            <div>
              {/* Credit Limit Meter */}
              <div className="zb-c360-credit-meter">
                <div className="zb-flex-between">
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: '#64748b' }}>
                      Real-Time Credit Limit & Exposure
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {formatINR(customer.creditUsed)}{' '}
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                        used of {formatINR(customer.creditLimit)} limit
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: '#059669' }}>
                      Available Headroom
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                      {formatINR(creditAvailable)}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="zb-c360-credit-bar">
                  <div
                    className="zb-c360-credit-fill"
                    style={{
                      width: `${utilizationPercent}%`,
                      background:
                        utilizationPercent > 85
                          ? 'linear-gradient(90deg, #ef4444, #f87171)'
                          : utilizationPercent > 65
                          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                          : 'linear-gradient(90deg, #0066cc, #38bdf8)'
                    }}
                  />
                </div>

                <div className="zb-flex-between" style={{ fontSize: '12px', color: '#64748b' }}>
                  <span>Utilization: <strong>{utilizationPercent}%</strong></span>
                  <span>Credit Risk Status: <strong style={{ color: utilizationPercent > 80 ? '#dc2626' : '#059669' }}>{utilizationPercent > 80 ? 'Approaching Cap' : 'Within Normal Policy'}</strong></span>
                </div>
              </div>

              {/* 3 Metrics Cards */}
              <div className="zb-dashboard-grid three-col" style={{ marginBottom: '20px' }}>
                <div className="zb-metric-mini-card">
                  <div className="zb-metric-mini-label">Settlement Turnaround</div>
                  <div className="zb-metric-mini-val text-primary" style={{ fontSize: '20px' }}>
                    {customer.avgPaymentDays} Days
                  </div>
                  <div className="zb-metric-mini-sub text-success">
                    <TrendingUp size={12} /> 5.8 days ahead of net terms
                  </div>
                </div>
                <div className="zb-metric-mini-card">
                  <div className="zb-metric-mini-label">On-Time Ratio</div>
                  <div className="zb-metric-mini-val text-success" style={{ fontSize: '20px' }}>
                    {customer.onTimeRatio}%
                  </div>
                  <div className="zb-metric-mini-sub">Flawless reconciliation rate</div>
                </div>
                <div className="zb-metric-mini-card">
                  <div className="zb-metric-mini-label">Lifetime Volume</div>
                  <div className="zb-metric-mini-val text-dark" style={{ fontSize: '20px' }}>
                    {formatINR(customer.totalLifetimeVolume)}
                  </div>
                  <div className="zb-metric-mini-sub">Across 14 settled contracts</div>
                </div>
              </div>

              {/* AI Financial Narrative */}
              <div
                style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  marginBottom: '16px'
                }}
              >
                <div className="zb-flex-align gap-2" style={{ marginBottom: '6px', color: '#0284c7', fontWeight: 700, fontSize: '13px' }}>
                  <Sparkles size={16} /> Credit Intelligence Assessment
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#0369a1', lineHeight: '1.6' }}>
                  {customer.executiveSummary}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL AUDIT CLICK-PATH TIMELINE */}
          {activeTab === 'timeline' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  End-to-End Order-to-Cash Audit Trail
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Statutory click-path verification tracking documentation from initial quote through final reconciliation.
                </p>
              </div>

              {/* Horizontal Pipeline Representation */}
              <div className="zb-timeline-pipeline">
                <div className="zb-timeline-connector-line" />
                {customer.auditTimeline.map((item, index) => (
                  <div key={index} className="zb-timeline-step-item">
                    <div
                      className={`zb-timeline-step-circle ${item.status === 'completed' ? 'completed' : ''}`}
                      style={{
                        borderColor: item.status === 'completed' ? '#0066cc' : item.status === 'in_progress' ? '#f59e0b' : '#cbd5e1',
                        background: item.status === 'completed' ? '#0066cc' : item.status === 'in_progress' ? '#fef3c7' : '#ffffff',
                        color: item.status === 'completed' ? '#ffffff' : item.status === 'in_progress' ? '#d97706' : '#94a3b8'
                      }}
                    >
                      {item.status === 'completed' ? <CheckCircle2 size={18} /> : index + 1}
                    </div>
                    <div className="zb-timeline-step-title">{item.stage}</div>
                    <div className="zb-timeline-step-sub font-mono">{item.ref}</div>
                  </div>
                ))}
              </div>

              {/* Detailed Timeline Table */}
              <table className="zb-table" style={{ marginTop: '16px' }}>
                <thead>
                  <tr>
                    <th>Workflow Stage</th>
                    <th>Document Ref</th>
                    <th>Timestamp</th>
                    <th>Audit Details</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.auditTimeline.map((item, index) => (
                    <tr key={index}>
                      <td className="font-semibold text-dark">{item.stage}</td>
                      <td>
                        <span className="font-mono text-primary font-medium">{item.ref}</span>
                      </td>
                      <td className="text-xs text-muted">{item.date}</td>
                      <td className="text-xs">{item.detail}</td>
                      <td className="text-center">
                        <span
                          className="zb-status-pill"
                          style={{
                            background: item.status === 'completed' ? '#ecfdf5' : item.status === 'in_progress' ? '#fffbeb' : '#f1f5f9',
                            color: item.status === 'completed' ? '#059669' : item.status === 'in_progress' ? '#d97706' : '#64748b',
                            border: `1px solid ${item.status === 'completed' ? '#a7f3d0' : item.status === 'in_progress' ? '#fde68a' : '#e2e8f0'}`
                          }}
                        >
                          {item.status === 'completed' ? 'Verified' : item.status === 'in_progress' ? 'Active' : 'Queued'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: CONTACT & GOVERNANCE */}
          {activeTab === 'transactions' && (
            <div>
              <div className="zb-dashboard-grid two-col" style={{ marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={16} className="text-primary" /> Registered Corporate Entity
                  </h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#334155' }}>
                    <div><strong>Legal Entity:</strong> {customer.name}</div>
                    <div><strong>GSTIN / Tax ID:</strong> <span className="font-mono">{customer.gstin}</span></div>
                    <div><strong>PAN Number:</strong> <span className="font-mono">{customer.pan}</span></div>
                    <div><strong>Place of Supply:</strong> 29-Karnataka (Intra-state)</div>
                    <div><strong>Corporate Office:</strong> {customer.address}</div>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={16} className="text-primary" /> Key Financial Contacts
                  </h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#334155' }}>
                    <div><strong>Billing Email:</strong> <a href={`mailto:${customer.email}`} style={{ color: '#0066cc' }}>{customer.email}</a></div>
                    <div><strong>Accounts Phone:</strong> {customer.phone}</div>
                    <div><strong>Remittance Escrow:</strong> HDFC Bank CMS Corporate NetBanking</div>
                    <div><strong>GST E-Invoice Portal:</strong> Integrated & Auto-Reconciled</div>
                  </div>
                </div>
              </div>

              <div style={{ background: '#f1f5f9', borderRadius: '6px', padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                &bull; In accordance with Rule 56 of CGST Rules 2017, all transaction records, delivery proofs, and electronic tax vouchers for {customer.name} are preserved with immutable cryptographic signatures.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '0 0 12px 12px'
          }}
        >
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Account Health: <strong style={{ color: '#059669' }}>{customer.healthGrade} (Optimal)</strong>
          </span>
          <div className="zb-flex-align gap-2">
            <button className="zb-btn zb-btn-secondary" onClick={onClose}>
              Close Window
            </button>
            <button
              className="zb-btn zb-btn-primary"
              onClick={() => {
                onClose();
                handleDownloadDossier();
              }}
            >
              Export Compliance Audit Sheet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
