import React from 'react';
import { Item, ItemType } from '../../types/item';
import { formatINR } from '../../utils/currency';
import {
  Eye,
  Edit2,
  Trash2,
  Package,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Image as ImageIcon
} from 'lucide-react';

interface ItemsTableProps {
  items: Item[];
  onViewItem: (item: Item) => void;
  onEditItem: (item: Item) => void;
  onDeleteItem: (item: Item) => void;
  onQuickAddItem: () => void;
}

export const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  onViewItem,
  onEditItem,
  onDeleteItem,
  onQuickAddItem,
}) => {
  if (items.length === 0) {
    return (
      <div className="zb-empty-state">
        <div className="zb-empty-icon">
          <Package size={48} />
        </div>
        <h3 className="zb-empty-title">No items found</h3>
        <p className="zb-empty-desc">
          No items match your search or filter criteria. Create your first item or clear filters.
        </p>
        <button className="zb-btn zb-btn-primary" onClick={onQuickAddItem}>
          + Add New Item
        </button>
      </div>
    );
  }

  const renderStockBadge = (item: Item) => {
    if (item.type === 'service') {
      return <span className="zb-badge zb-badge-neutral">N/A (Service)</span>;
    }

    if (!item.inventoryInfo?.trackInventory) {
      return <span className="zb-badge zb-badge-neutral">Untracked</span>;
    }

    const stock = item.inventoryInfo.openingStock || 0;
    const reorderLevel = item.inventoryInfo.reorderLevel || 0;

    if (stock <= 0) {
      return (
        <span className="zb-badge zb-badge-danger">
          <MinusCircle size={12} /> Out of Stock ({stock})
        </span>
      );
    }

    if (stock <= reorderLevel) {
      return (
        <span className="zb-badge zb-badge-warning" title={`Reorder point is ${reorderLevel}`}>
          <AlertTriangle size={12} /> Low Stock ({stock} {item.unit})
        </span>
      );
    }

    return (
      <span className="zb-badge zb-badge-success">
        <CheckCircle2 size={12} /> {stock} {item.unit} on hand
      </span>
    );
  };

  return (
    <div className="zb-table-responsive">
      <table className="zb-table">
        <thead>
          <tr>
            <th>Item Name & Description</th>
            <th>Type</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Selling Price</th>
            <th>Cost Price</th>
            <th>Stock Status</th>
            <th>Created Date</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="zb-table-row">
              <td>
                <div className="zb-item-name-cell">
                  <div className="zb-item-thumb">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} />
                    ) : (
                      <div className="zb-thumb-fallback">
                        {item.type === 'goods' ? <Package size={16} /> : <Wrench size={16} />}
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      className="zb-item-title-btn"
                      onClick={() => onViewItem(item)}
                    >
                      {item.name}
                    </button>
                    {item.description && (
                      <div className="zb-item-desc-sub">{item.description}</div>
                    )}
                  </div>
                </div>
              </td>

              <td>
                <span className={`zb-type-pill ${item.type}`}>
                  {item.type === 'goods' ? 'Goods' : 'Service'}
                </span>
              </td>

              <td>
                <span className="zb-code-tag">{item.sku}</span>
              </td>

              <td>
                <span className="zb-unit-tag">{item.unit}</span>
              </td>

              <td>
                <strong className="zb-price-text">{formatINR(item.salesInfo.sellingPrice)}</strong>
              </td>

              <td>
                <span className="zb-cost-text">{formatINR(item.purchaseInfo.costPrice)}</span>
              </td>

              <td>{renderStockBadge(item)}</td>

              <td>
                <span className="zb-date-text">
                  {new Date(item.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </td>

              <td className="text-right">
                <div className="zb-actions-group">
                  <button
                    className="zb-action-btn"
                    onClick={() => onViewItem(item)}
                    title="View Item Details"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="zb-action-btn edit"
                    onClick={() => onEditItem(item)}
                    title="Edit Item"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    className="zb-action-btn delete"
                    onClick={() => onDeleteItem(item)}
                    title="Delete Item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
