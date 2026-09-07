import React from 'react';
import { InventorySummary } from '../../types/dashboard';
import { formatINR } from '../../utils/currency';
import { Package, Layers, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface InventorySummaryCardProps {
  data: InventorySummary;
  onNavigateItems: () => void;
  onQuickAddItem: () => void;
}

export const InventorySummaryCard: React.FC<InventorySummaryCardProps> = ({
  data,
  onNavigateItems,
  onQuickAddItem,
}) => {
  return (
    <div className="zb-dashboard-card zb-inventory-summary-card">
      <div className="zb-card-header zb-flex-between">
        <div>
          <h3 className="zb-card-title">Inventory & Items Summary</h3>
          <span className="zb-card-subtitle">Active catalog & asset valuation</span>
        </div>

        <button className="zb-btn zb-btn-sm zb-btn-secondary" onClick={onQuickAddItem}>
          + Add New Item
        </button>
      </div>

      <div className="zb-card-body">
        <div className="zb-inv-grid">
          <div className="zb-inv-stat-card">
            <div className="zb-inv-stat-label">
              <Package size={16} className="text-primary" /> Total Items
            </div>
            <div className="zb-inv-stat-value">{data.totalItemsCount}</div>
            <div className="zb-inv-stat-sub">
              {data.goodsCount} Goods | {data.serviceCount} Services
            </div>
          </div>

          <div className="zb-inv-stat-card">
            <div className="zb-inv-stat-label">
              <Layers size={16} className="text-info" /> Tracked Goods
            </div>
            <div className="zb-inv-stat-value">{data.trackedCount}</div>
            <div className="zb-inv-stat-sub">Physical Inventory Items</div>
          </div>

          <div className="zb-inv-stat-card">
            <div className="zb-inv-stat-label">
              <ShieldCheck size={16} className="text-success" /> Stock Valuation
            </div>
            <div className="zb-inv-stat-value text-success">
              {formatINR(data.totalInventoryValuation)}
            </div>
            <div className="zb-inv-stat-sub">Asset value on hand</div>
          </div>

          <div className="zb-inv-stat-card">
            <div className="zb-inv-stat-label">
              <AlertCircle size={16} className={data.lowStockItemsCount > 0 ? 'text-warning' : 'text-muted'} /> Low Stock Alerts
            </div>
            <div className={`zb-inv-stat-value ${data.lowStockItemsCount > 0 ? 'text-warning' : ''}`}>
              {data.lowStockItemsCount}
            </div>
            <div className="zb-inv-stat-sub">Below reorder point</div>
          </div>
        </div>
      </div>

      <div className="zb-card-footer zb-flex-between">
        <span className="zb-footer-text">
          Real-time stock values computed from stored Items repository.
        </span>
        <button className="zb-text-link" onClick={onNavigateItems}>
          Manage All Items <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
