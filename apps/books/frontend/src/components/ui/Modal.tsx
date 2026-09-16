import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, title, subtitle, size = 'md', onClose, footer, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  onCloseRef.current = onClose;

  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stableOnClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Only focus the card on initial open, not on every re-render
    if (!wasOpenRef.current) {
      cardRef.current?.focus();
      wasOpenRef.current = true;
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, stableOnClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal-card modal-${size}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={cardRef}>
        <header className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-md" onClick={onCancel} disabled={busy}>
            <span>Cancel</span>
          </button>
          <button type="button" className={`btn btn-${tone} btn-md ${busy ? 'is-loading' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
            <span>{confirmLabel}</span>
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
    </Modal>
  );
}
