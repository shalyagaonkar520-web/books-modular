import React from 'react';
import { Item } from '../../types/item';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  item: Item | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  item,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div className="zb-modal-overlay" onClick={onClose}>
      <div className="zb-modal-card zb-delete-modal" onClick={e => e.stopPropagation()}>
        <button className="zb-modal-close-btn" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="zb-delete-modal-content">
          <div className="zb-delete-icon-wrapper">
            <AlertTriangle size={32} className="zb-delete-icon" />
          </div>

          <h3 className="zb-delete-title">Delete Item?</h3>
          <p className="zb-delete-message">
            Are you sure you want to delete <strong>"{item.name}"</strong> (SKU: {item.sku})?
          </p>
          <p className="zb-delete-warning">
            This action cannot be undone. Associated inventory valuations and dashboard metrics will recalculate immediately.
          </p>

          <div className="zb-delete-actions">
            <button className="zb-btn zb-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="zb-btn zb-btn-danger"
              onClick={() => {
                onConfirm(item.id);
                onClose();
              }}
            >
              Delete Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
