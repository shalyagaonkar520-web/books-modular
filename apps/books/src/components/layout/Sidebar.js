import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Building2, ChevronDown, CreditCard, FileText, FolderOpen, Home, Landmark, Package, Receipt, ShoppingBag, ShoppingCart, Users, Wallet, } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
const GROUPS = [
    {
        id: 'sales',
        label: 'Sales',
        icon: ShoppingCart,
        entries: [
            { to: '/customers', label: 'Customers', icon: Users },
            { to: '/invoices', label: 'Invoices', icon: FileText },
            { to: '/payments-received', label: 'Payments received', icon: Wallet },
        ],
    },
    {
        id: 'purchases',
        label: 'Purchases',
        icon: ShoppingBag,
        entries: [
            { to: '/vendors', label: 'Vendors', icon: Building2 },
            { to: '/bills', label: 'Bills', icon: Receipt },
            { to: '/expenses', label: 'Expenses', icon: CreditCard },
            { to: '/payments-made', label: 'Payments made', icon: Wallet },
        ],
    },
];
const SINGLE_LINKS = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/items', label: 'Items', icon: Package },
];
const LOWER_LINKS = [
    { to: '/banking', label: 'Banking', icon: Landmark },
    { to: '/time-tracking', label: 'Time tracking', icon: FolderOpen },
    { to: '/accounting', label: 'Accountant', icon: BarChart3 },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/documents', label: 'Documents', icon: FolderOpen },
    { to: '/payroll', label: 'Payroll', icon: Users },
];
export function Sidebar({ open, onNavigate }) {
    const { isAdmin } = useAuth();
    const [collapsed, setCollapsed] = useState({});
    const toggle = (id) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));
    return (_jsxs(_Fragment, { children: [open ? _jsx("div", { className: "sidebar-backdrop", onClick: onNavigate, "aria-hidden": "true" }) : null, _jsx("aside", { className: `sidebar ${open ? 'is-open' : ''}`, "aria-label": "Main navigation", children: _jsxs("nav", { className: "sidebar-nav", children: [SINGLE_LINKS.map((entry) => (_jsxs(NavLink, { to: entry.to, end: entry.to === '/', className: "nav-link", onClick: onNavigate, children: [_jsx(entry.icon, { size: 17, "aria-hidden": "true" }), _jsx("span", { children: entry.label })] }, entry.to))), GROUPS.map((group) => {
                            const isCollapsed = collapsed[group.id];
                            return (_jsxs("div", { className: "nav-group", children: [_jsxs("button", { type: "button", className: "nav-group-toggle", onClick: () => toggle(group.id), "aria-expanded": !isCollapsed, children: [_jsx(group.icon, { size: 17, "aria-hidden": "true" }), _jsx("span", { children: group.label }), _jsx(ChevronDown, { size: 14, className: `chevron ${isCollapsed ? 'is-collapsed' : ''}`, "aria-hidden": "true" })] }), !isCollapsed ? (_jsx("div", { className: "nav-sublist", children: group.entries.map((entry) => (_jsxs(NavLink, { to: entry.to, className: "nav-link nav-sublink", onClick: onNavigate, children: [_jsx(entry.icon, { size: 15, "aria-hidden": "true" }), _jsx("span", { children: entry.label })] }, entry.to))) })) : null] }, group.id));
                        }), LOWER_LINKS.map((entry) => (_jsxs(NavLink, { to: entry.to, className: "nav-link", onClick: onNavigate, children: [_jsx(entry.icon, { size: 17, "aria-hidden": "true" }), _jsx("span", { children: entry.label })] }, entry.to))), isAdmin ? (_jsxs(NavLink, { to: "/settings", className: "nav-link", onClick: onNavigate, children: [_jsx(Building2, { size: 17, "aria-hidden": "true" }), _jsx("span", { children: "Settings" })] })) : null] }) })] }));
}
