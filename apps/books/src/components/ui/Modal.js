import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Modal({ open, title, subtitle, size = 'md', onClose, footer, children }) {
    const cardRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        cardRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsx("div", { className: "modal-overlay", onMouseDown: (event) => event.target === event.currentTarget && onClose(), children: _jsxs("div", { className: `modal-card modal-${size}`, role: "dialog", "aria-modal": "true", "aria-label": title, tabIndex: -1, ref: cardRef, children: [_jsxs("header", { className: "modal-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "modal-title", children: title }), subtitle ? _jsx("p", { className: "modal-subtitle", children: subtitle }) : null] }), _jsx("button", { type: "button", className: "icon-btn", onClick: onClose, "aria-label": "Close dialog", children: _jsx(X, { size: 18 }) })] }), _jsx("div", { className: "modal-body", children: children }), footer ? _jsx("footer", { className: "modal-footer", children: footer }) : null] }) }));
}
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }) {
    return (_jsx(Modal, { open: open, title: title, size: "sm", onClose: onCancel, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn btn-secondary btn-md", onClick: onCancel, disabled: busy, children: _jsx("span", { children: "Cancel" }) }), _jsxs("button", { type: "button", className: `btn btn-${tone} btn-md ${busy ? 'is-loading' : ''}`, onClick: onConfirm, disabled: busy, children: [busy ? _jsx("span", { className: "btn-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: confirmLabel })] })] }), children: _jsx("div", { className: "confirm-message", children: message }) }));
}
