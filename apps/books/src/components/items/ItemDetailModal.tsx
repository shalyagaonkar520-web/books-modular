import React from 'react';
import { Item } from '../../types/item';
import { formatINR } from '../../utils/currency';
import {
  X,
  Edit2,
  Package,
  Wrench,
  Tag,
  DollarSign,
  ShoppingCart,
  Building,
  Calendar,
  Layers,
  MapPin,
  AlertTriangle
} from 'lucide-react';

interface ItemDetailModalProps {
  item: Item | null;
  onClose: () => void;
  onEdit: (item: Item) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose, onEdit }) => {
  if (!item) return null;

  const totalStockValue =
    item.type === 'goods' && item.inventoryInfo?.trackInventory
      ? item.inventoryInfo.openingStock * (item.inventoryInfo.openingStockRate || item.purchaseInfo.costPrice)
      : 0;

  return (
    <div className="zb-modal-overlay" onClick={onClose}>
      <div className="zb-modal-card zb-item-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="zb-modal-header zb-flex-between">
          <div className="zb-flex-align gap-3">
            <div className="zb-detail-avatar">
              {item.type === 'goods' ? <Package size={22} /> : <Wrench size={22} />}
            </div>
            <div>
              <div className="zb-detail-type-row">
                <span className={`zb-type-pill ${item.type}`}>
                  {item.type === 'goods' ? 'Goods' : 'Service'}
                </span>
                <span className="zb-code-tag">{item.sku}</span>
              </div>
              <h3 className="zb-modal-title">{item.name}</h3>
            </div>
          </div>

          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary zb-btn-sm"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
            >
              <Edit2 size={14} /> Edit Item
            </button>
            <button className="zb-modal-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Detail Content Grid */}
        <div className="zb-detail-content">
          {/* Main overview banner */}
          <div className="zb-detail-stats-banner">
            <div className="zb-stat-box">
              <span className="zb-stat-label">Selling Price</span>
              <span className="zb-stat-value text-primary">
                {formatINR(item.salesInfo.sellingPrice)}
              </span>
              <span className="zb-stat-sub">per {item.unit}</span>
            </div>

            <div className="zb-stat-box">
              <span className="zb-stat-label">Cost Price</span>
              <span className="zb-stat-value">{formatINR(item.purchaseInfo.costPrice)}</span>
              <span className="zb-stat-sub">Vendor rate</span>
            </div>

            <div className="zb-stat-box">
              <span className="zb-stat-label">Stock Status</span>
              <span className="zb-stat-value">
                {item.type === 'goods' && item.inventoryInfo?.trackInventory
                  ? `${item.inventoryInfo.openingStock} ${item.unit}`
                  : 'N/A'}
              </span>
              <span className="zb-stat-sub">
                {item.type === 'goods' && item.inventoryInfo?.trackInventory
                  ? `Valuation: ${formatINR(totalStockValue)}`
                  : 'Untracked / Service'}
              </span>
            </div>
          </div>

          {/* Detailed Cards */}
          <div className="zb-detail-sections-grid">
            {/* Sales Card */}
            <div className="zb-detail-card">
              <h4 className="zb-detail-card-title">
                <DollarSign size={16} /> Sales Information
              </h4>
              <div className="zb-detail-field">
                <span className="label">Selling Price</span>
                <span className="val font-semibold">{formatINR(item.salesInfo.sellingPrice)}</span>
              </div>
              <div className="zb-detail-field">
                <span className="label">Sales Account</span>
                <span className="val">{item.salesInfo.salesAccount}</span>
              </div>
              <div className="zb-detail-field">
                <span className="label">Sales Description</span>
                <span className="val">{item.salesInfo.description || '—'}</span>
              </div>
            </div>

            {/* Purchase Card */}
            <div className="zb-detail-card">
              <h4 className="zb-detail-card-title">
                <ShoppingCart size={16} /> Purchase Information
              </h4>
              <div className="zb-detail-field">
                <span className="label">Cost Price</span>
                <span className="val font-semibold">{formatINR(item.purchaseInfo.costPrice)}</span>
              </div>
              <div className="zb-detail-field">
                <span className="label">Cost Account</span>
                <span className="val">{item.purchaseInfo.costAccount}</span>
              </div>
              <div className="zb-detail-field">
                <span className="label">Preferred Vendor</span>
                <span className="val">{item.purchaseInfo.preferredVendor || '—'}</span>
              </div>
              <div className="zb-detail-field">
                <span className="label">Purchase Description</span>
                <span className="val">{item.purchaseInfo.description || '—'}</span>
              </div>
            </div>

            {/* Inventory Card (Goods) */}
            {item.type === 'goods' && (
              <div className="zb-detail-card full-width">
                <h4 className="zb-detail-card-title">
                  <Layers size={16} /> Inventory & Stock Details
                </h4>
                {item.inventoryInfo?.trackInventory ? (
                  <div className="zb-detail-grid-three">
                    <div className="zb-detail-field">
                      <span className="label">Opening Stock</span>
                      <span className="val">{item.inventoryInfo.openingStock} {item.unit}</span>
                    </div>
                    <div className="zb-detail-field">
                      <span className="label">Opening Stock Rate</span>
                      <span className="val">{formatINR(item.inventoryInfo.openingStockRate)}</span>
                    </div>
                    <div className="zb-detail-field">
                      <span className="label">Reorder Level</span>
                      <span className="val">{item.inventoryInfo.reorderLevel} {item.unit}</span>
                    </div>
                    <div className="zb-detail-field">
                      <span className="label">Warehouse Location</span>
                      <span className="val">{item.inventoryInfo.warehouseLocation || 'Main Warehouse'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted">Inventory tracking is disabled for this goods item.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="zb-modal-footer">
          <button className="zb-btn zb-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
