import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
export function Spinner({ label = 'Loading' }) {
    return (_jsx("span", { className: "spinner", role: "status", "aria-label": label, children: _jsx(Loader2, { size: 18, className: "spin", "aria-hidden": "true" }) }));
}
export function LoadingBlock({ label = 'Loading…' }) {
    return (_jsxs("div", { className: "state-block", role: "status", children: [_jsx(Loader2, { size: 24, className: "spin", "aria-hidden": "true" }), _jsx("p", { children: label })] }));
}
export function SkeletonRows({ rows = 5, columns = 4 }) {
    return (_jsx("div", { className: "skeleton-table", "aria-hidden": "true", children: Array.from({ length: rows }).map((_, rowIndex) => (_jsx("div", { className: "skeleton-row", children: Array.from({ length: columns }).map((__, colIndex) => (_jsx("span", { className: "skeleton-cell" }, colIndex))) }, rowIndex))) }));
}
export function ErrorBlock({ message, onRetry }) {
    return (_jsxs("div", { className: "state-block state-error", role: "alert", children: [_jsx(AlertCircle, { size: 24, "aria-hidden": "true" }), _jsx("p", { children: message }), onRetry ? (_jsxs("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: onRetry, children: [_jsx(RefreshCw, { size: 14 }), _jsx("span", { children: "Try again" })] })) : null] }));
}
export function EmptyState({ title, description, action, icon }) {
    return (_jsxs("div", { className: "state-block state-empty", children: [icon ?? _jsx(Inbox, { size: 28, "aria-hidden": "true" }), _jsx("h3", { children: title }), description ? _jsx("p", { children: description }) : null, action] }));
}
export function FormError({ message }) {
    if (!message)
        return null;
    return (_jsxs("div", { className: "form-error", role: "alert", children: [_jsx(AlertCircle, { size: 16, "aria-hidden": "true" }), _jsx("div", { children: message.split('\n').map((line, index) => (_jsx("p", { children: line }, index))) })] }));
}
