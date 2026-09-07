import React from 'react';
import { ReceivablesSummary, PayablesSummary } from '../../types/dashboard';
import { formatINR } from '../../utils/currency';
import { TrendingUp, TrendingDown, ArrowRight, FileText, AlertTriangle } from 'lucide-react';

interface ReceivablesCardProps {
  data: ReceivablesSummary;
  onNavigateItems?: () => void;
}

export const ReceivablesCard: React.FC<ReceivablesCardProps> = ({ data, onNavigateItems }) => {
  return (
    <div className="zb-dashboard-card zb-metrics-card">
      <div className="zb-card-header zb-flex-between">
        <div className="zb-card-title-group">
          <h3 className="zb-card-title">Total Receivables</h3>
          <span className="zb-card-subtitle">Unpaid Invoices & Sales Assets</span>
        </div>
        <div className="zb-card-badge positive">
          <TrendingUp size={14} /> Sales
        </div>
      </div>

      <div className="zb-card-body">
        <div className="zb-metric-main-value">
          {formatINR(data.totalReceivables)}
        </div>

        <div className="zb-metric-progress-bar">
          <div
            className="zb-progress-fill current"
            style={{
              width: `${data.totalReceivables > 0 ? (data.currentAmount / data.totalReceivables) * 100 : 0}%`,
            }}
            title="Current Receivables"
          />
          <div
            className="zb-progress-fill overdue"
            style={{
              width: `${data.totalReceivables > 0 ? (data.overdueAmount / data.totalReceivables) * 100 : 0}%`,
            }}
            title="Overdue Receivables"
          />
        </div>

        <div className="zb-metric-details-grid">
          <div className="zb-metric-detail-item">
            <span className="zb-detail-label">Total Unpaid Invoices</span>
            <span className="zb-detail-value font-semibold">{data.totalUnpaidInvoices}</span>
          </div>

          <div className="zb-metric-detail-item">
            <span className="zb-detail-label zb-dot-current">Current Amount</span>
            <span className="zb-detail-value">{formatINR(data.currentAmount)}</span>
          </div>

          <div className="zb-metric-detail-item">
            <span className="zb-detail-label zb-dot-overdue">Overdue Amount</span>
            <span className="zb-detail-value text-danger">{formatINR(data.overdueAmount)}</span>
          </div>
        </div>
      </div>

      <div className="zb-card-footer">
        <button className="zb-text-link" onClick={onNavigateItems}>
          View Sales Inventory Items <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

interface PayablesCardProps {
  data: PayablesSummary;
  onNavigateItems?: () => void;
}

export const PayablesCard: React.FC<PayablesCardProps> = ({ data, onNavigateItems }) => {
  return (
    <div className="zb-dashboard-card zb-metrics-card">
      <div className="zb-card-header zb-flex-between">
        <div className="zb-card-title-group">
          <h3 className="zb-card-title">Total Payables</h3>
          <span className="zb-card-subtitle">Unpaid Bills & Vendor Liabilities</span>
        </div>
        <div className="zb-card-badge warning">
          <TrendingDown size={14} /> Purchases
        </div>
      </div>

      <div className="zb-card-body">
        <div className="zb-metric-main-value text-dark">
          {formatINR(data.totalPayables)}
        </div>

        <div className="zb-metric-progress-bar">
          <div
            className="zb-progress-fill current-pay"
            style={{
              width: `${data.totalPayables > 0 ? (data.currentAmount / data.totalPayables) * 100 : 0}%`,
            }}
            title="Current Payables"
          />
          <div
            className="zb-progress-fill overdue-pay"
            style={{
              width: `${data.totalPayables > 0 ? (data.overdueAmount / data.totalPayables) * 100 : 0}%`,
            }}
            title="Overdue Payables"
          />
        </div>

        <div className="zb-metric-details-grid">
          <div className="zb-metric-detail-item">
            <span className="zb-detail-label">Total Unpaid Bills</span>
            <span className="zb-detail-value font-semibold">{data.totalUnpaidBills}</span>
          </div>

          <div className="zb-metric-detail-item">
            <span className="zb-detail-label zb-dot-current-pay">Current Amount</span>
            <span className="zb-detail-value">{formatINR(data.currentAmount)}</span>
          </div>

          <div className="zb-metric-detail-item">
            <span className="zb-detail-label zb-dot-overdue-pay">Overdue Amount</span>
            <span className="zb-detail-value text-warning">{formatINR(data.overdueAmount)}</span>
          </div>
        </div>
      </div>

      <div className="zb-card-footer">
        <button className="zb-text-link" onClick={onNavigateItems}>
          View Purchase Items <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
