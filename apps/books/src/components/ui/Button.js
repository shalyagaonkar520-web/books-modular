import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Button({ variant = 'secondary', size = 'md', loading = false, icon, children, className = '', disabled, ...rest }) {
    return (_jsxs("button", { type: "button", className: `btn btn-${variant} btn-${size} ${loading ? 'is-loading' : ''} ${className}`.trim(), disabled: disabled || loading, ...rest, children: [loading ? _jsx("span", { className: "btn-spinner", "aria-hidden": "true" }) : icon, children ? _jsx("span", { children: children }) : null] }));
}
