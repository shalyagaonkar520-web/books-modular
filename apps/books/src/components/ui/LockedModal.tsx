import React from 'react';
import { Lock, AlertCircle, X, CheckCircle2 } from 'lucide-react';

interface LockedModalProps {
  isOpen: boolean;
  moduleName: string | null;
  onClose: () => void;
  onNavigateItems: () => void;
}

export const LockedModal: React.FC<LockedModalProps> = ({
  isOpen,
  moduleName,
  onClose,
  onNavigateItems,
}) => {
  if (!isOpen) return null;

  return (
    <div className="zb-modal-overlay" onClick={onClose}>
      <div className="zb-modal-card zb-locked-modal" onClick={e => e.stopPropagation()}>
        <button className="zb-modal-close-btn" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="zb-locked-modal-header">
          <div className="zb-locked-icon-wrapper">
            <Lock size={32} className="zb-locked-icon" />
          </div>
          <h3 className="zb-locked-title">{moduleName || 'Module'} is Locked</h3>
        </div>

        <div className="zb-locked-modal-body">
          <p className="zb-locked-message">
            <strong>Coming Soon</strong> — This module is currently locked. Home and Items are available in this version.
          </p>

          <div className="zb-locked-available-box">
            <div className="zb-available-header">Available Modules in this Edition:</div>
            <div className="zb-available-item">
              <CheckCircle2 size={16} className="zb-check-green" />
              <span><strong>Home / Dashboard</strong> — Live analytics, cash flow, receivables & payables</span>
            </div>
            <div className="zb-available-item">
              <CheckCircle2 size={16} className="zb-check-green" />
              <span><strong>Items Management</strong> — Full CRUD, stock inventory, selling/purchase prices & filtering</span>
            </div>
          </div>
        </div>

        <div className="zb-locked-modal-footer">
          <button className="zb-btn zb-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="zb-btn zb-btn-primary"
            onClick={() => {
              onClose();
              onNavigateItems();
            }}
          >
            Go to Items Module
          </button>
        </div>
      </div>
    </div>
  );
};
