import React from 'react';
import { CashFlowSummary, CashFlowPeriod } from '../../types/dashboard';
import { formatINR } from '../../utils/currency';
import { Calendar, DollarSign, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

interface CashFlowChartProps {
  data: CashFlowSummary;
  period: CashFlowPeriod;
  onPeriodChange: (period: CashFlowPeriod) => void;
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  data,
  period,
  onPeriodChange,
}) => {
  const maxBarValue = Math.max(
    ...data.monthlyBreakdown.map(m => Math.max(m.incoming, m.outgoing)),
    1000
  );

  return (
    <div className="zb-dashboard-card zb-cashflow-card">
      <div className="zb-card-header zb-flex-between">
        <div>
          <h3 className="zb-card-title">Cash Flow</h3>
          <span className="zb-card-subtitle">Cash movement based on inventory & transactions</span>
        </div>

        <div className="zb-period-select-wrapper">
          <Calendar size={14} className="zb-calendar-icon" />
          <select
            className="zb-select zb-period-select"
            value={period}
            onChange={e => onPeriodChange(e.target.value as CashFlowPeriod)}
          >
            <option value="this_fiscal_year">This Fiscal Year (2025-26)</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
          </select>
        </div>
      </div>

      <div className="zb-card-body">
        {/* Metric summary bar */}
        <div className="zb-cashflow-metrics-row">
          <div className="zb-cf-metric">
            <div className="zb-cf-icon blue">
              <Wallet size={16} />
            </div>
            <div>
              <div className="zb-cf-label">Opening Cash Balance</div>
              <div className="zb-cf-value">{formatINR(data.openingBalance)}</div>
            </div>
          </div>

          <div className="zb-cf-metric">
            <div className="zb-cf-icon green">
              <ArrowUpRight size={16} />
            </div>
            <div>
              <div className="zb-cf-label">Incoming (Sales)</div>
              <div className="zb-cf-value text-success">{formatINR(data.incomingAmount)}</div>
            </div>
          </div>

          <div className="zb-cf-metric">
            <div className="zb-cf-icon red">
              <ArrowDownRight size={16} />
            </div>
            <div>
              <div className="zb-cf-label">Outgoing (Purchases)</div>
              <div className="zb-cf-value text-danger">{formatINR(data.outgoingAmount)}</div>
            </div>
          </div>

          <div className="zb-cf-metric">
            <div className="zb-cf-icon purple">
              <DollarSign size={16} />
            </div>
            <div>
              <div className="zb-cf-label">Net Cash Flow</div>
              <div className={`zb-cf-value ${data.netCashFlow >= 0 ? 'text-primary' : 'text-danger'}`}>
                {formatINR(data.netCashFlow)}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="zb-chart-legend">
          <div className="zb-legend-item">
            <span className="zb-legend-box incoming" />
            <span>Incoming Cash (Revenues)</span>
          </div>
          <div className="zb-legend-item">
            <span className="zb-legend-box outgoing" />
            <span>Outgoing Cash (Costs)</span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="zb-chart-container">
          <div className="zb-bar-chart">
            {data.monthlyBreakdown.map((item, index) => {
              const incomingHeightPercent = (item.incoming / maxBarValue) * 100;
              const outgoingHeightPercent = (item.outgoing / maxBarValue) * 100;

              return (
                <div key={index} className="zb-chart-col">
                  <div className="zb-bars-group">
                    <div
                      className="zb-bar incoming-bar"
                      style={{ height: `${Math.max(incomingHeightPercent, 4)}%` }}
                      title={`Incoming (${item.month}): ${formatINR(item.incoming)}`}
                    >
                      <div className="zb-bar-tooltip">
                        <strong>{item.month}</strong>
                        <div>Incoming: {formatINR(item.incoming)}</div>
                      </div>
                    </div>

                    <div
                      className="zb-bar outgoing-bar"
                      style={{ height: `${Math.max(outgoingHeightPercent, 4)}%` }}
                      title={`Outgoing (${item.month}): ${formatINR(item.outgoing)}`}
                    >
                      <div className="zb-bar-tooltip">
                        <strong>{item.month}</strong>
                        <div>Outgoing: {formatINR(item.outgoing)}</div>
                      </div>
                    </div>
                  </div>
                  <span className="zb-chart-x-label">{item.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
