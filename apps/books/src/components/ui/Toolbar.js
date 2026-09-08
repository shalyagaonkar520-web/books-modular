import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Search, X } from 'lucide-react';
export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
    return (_jsxs("div", { className: "search-input", children: [_jsx(Search, { size: 15, "aria-hidden": "true" }), _jsx("input", { type: "search", value: value, placeholder: placeholder, "aria-label": label, onChange: (event) => onChange(event.target.value) }), value ? (_jsx("button", { type: "button", onClick: () => onChange(''), "aria-label": "Clear search", children: _jsx(X, { size: 14 }) })) : null] }));
}
export function Toolbar({ children }) {
    return _jsx("div", { className: "toolbar", children: children });
}
export function FilterSelect({ label, value, onChange, options }) {
    return (_jsxs("label", { className: "filter-select", children: [_jsx("span", { children: label }), _jsx("select", { className: "select select-sm", value: value, onChange: (event) => onChange(event.target.value), children: options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }));
}
export function Tabs({ tabs, active, onChange }) {
    return (_jsx("div", { className: "tabs", role: "tablist", children: tabs.map((tab) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": active === tab.id, className: `tab ${active === tab.id ? 'is-active' : ''}`, onClick: () => onChange(tab.id), children: [tab.label, typeof tab.count === 'number' ? _jsx("span", { className: "tab-count", children: tab.count }) : null] }, tab.id))) }));
}
