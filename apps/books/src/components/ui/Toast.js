import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
const ToastContext = createContext(null);
const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};
let nextId = 1;
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const dismiss = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);
    const notify = useCallback((message, tone = 'info') => {
        const id = nextId++;
        setToasts((current) => [...current, { id, tone, message }]);
        window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    }, [dismiss]);
    const value = useMemo(() => ({
        notify,
        success: (message) => notify(message, 'success'),
        error: (message) => notify(message, 'error'),
    }), [notify]);
    return (_jsxs(ToastContext.Provider, { value: value, children: [children, _jsx("div", { className: "toast-stack", role: "region", "aria-label": "Notifications", children: toasts.map((toast) => {
                    const Icon = ICONS[toast.tone];
                    return (_jsxs("div", { className: `toast toast-${toast.tone}`, role: "status", children: [_jsx(Icon, { size: 18, "aria-hidden": "true" }), _jsx("span", { className: "toast-message", children: toast.message }), _jsx("button", { type: "button", className: "toast-close", onClick: () => dismiss(toast.id), "aria-label": "Dismiss notification", children: _jsx(X, { size: 14 }) })] }, toast.id));
                }) })] }));
}
export function useToast() {
    const context = useContext(ToastContext);
    if (!context)
        throw new Error('useToast must be used inside a ToastProvider');
    return context;
}
