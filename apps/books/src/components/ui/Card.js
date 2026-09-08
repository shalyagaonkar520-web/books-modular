import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Card({ title, subtitle, actions, footer, className = '', children }) {
    return (_jsxs("section", { className: `card ${className}`.trim(), children: [title || actions ? (_jsxs("header", { className: "card-header", children: [_jsxs("div", { children: [title ? _jsx("h2", { className: "card-title", children: title }) : null, subtitle ? _jsx("p", { className: "card-subtitle", children: subtitle }) : null] }), actions ? _jsx("div", { className: "card-actions", children: actions }) : null] })) : null, _jsx("div", { className: "card-body", children: children }), footer ? _jsx("footer", { className: "card-footer", children: footer }) : null] }));
}
export function StatTile({ label, value, sublabel, tone = 'neutral', icon }) {
    return (_jsxs("div", { className: `stat-tile tone-${tone}`, children: [_jsxs("div", { className: "stat-tile-head", children: [_jsx("span", { className: "stat-label", children: label }), icon ? _jsx("span", { className: "stat-icon", children: icon }) : null] }), _jsx("div", { className: "stat-value", children: value }), sublabel ? _jsx("div", { className: "stat-sublabel", children: sublabel }) : null] }));
}
