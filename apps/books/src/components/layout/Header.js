import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Plus, Settings, User as UserIcon } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { initials } from '@/utils/format';
const NOTIFICATION_ROUTES = {
    invoice: '/invoices',
    bill: '/bills',
    item: '/items',
    banking: '/banking',
};
export function Header({ onToggleSidebar }) {
    const { user, organization, logout, canWrite } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [openMenu, setOpenMenu] = useState('none');
    const headerRef = useRef(null);
    useEffect(() => {
        let active = true;
        const load = () => dashboardApi
            .notifications()
            .then((data) => {
            if (active)
                setNotifications(data.items);
        })
            .catch(() => undefined);
        load();
        const timer = window.setInterval(load, 120000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);
    useEffect(() => {
        const onClickAway = (event) => {
            if (headerRef.current && !headerRef.current.contains(event.target))
                setOpenMenu('none');
        };
        document.addEventListener('mousedown', onClickAway);
        return () => document.removeEventListener('mousedown', onClickAway);
    }, []);
    return (_jsxs("header", { className: "app-header", ref: headerRef, children: [_jsxs("div", { className: "header-left", children: [_jsx("button", { type: "button", className: "icon-btn menu-btn", onClick: onToggleSidebar, "aria-label": "Toggle navigation", children: _jsx(Menu, { size: 19 }) }), _jsxs(Link, { to: "/", className: "brand", children: [_jsx("img", { src: "/rooman-logo.png", alt: "", className: "brand-logo", width: 28, height: 28 }), _jsxs("span", { className: "brand-text", children: [_jsx("strong", { children: "Rooman Books" }), _jsx("small", { children: organization?.name ?? 'Accounting' })] })] })] }), _jsxs("div", { className: "header-right", children: [canWrite ? (_jsxs("div", { className: "menu-anchor", children: [_jsxs("button", { type: "button", className: "btn btn-primary btn-sm", onClick: () => setOpenMenu(openMenu === 'create' ? 'none' : 'create'), "aria-expanded": openMenu === 'create', children: [_jsx(Plus, { size: 15 }), _jsx("span", { children: "Create" })] }), openMenu === 'create' ? (_jsxs("div", { className: "dropdown", role: "menu", children: [_jsx("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/invoices/new'); }, children: "Invoice" }), _jsx("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/bills/new'); }, children: "Bill" }), _jsx("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/expenses?new=1'); }, children: "Expense" }), _jsx("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/items?new=1'); }, children: "Item" }), _jsx("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/customers?new=1'); }, children: "Customer" })] })) : null] })) : null, _jsxs("div", { className: "menu-anchor", children: [_jsxs("button", { type: "button", className: "icon-btn", onClick: () => setOpenMenu(openMenu === 'bell' ? 'none' : 'bell'), "aria-label": `Notifications (${notifications.length})`, "aria-expanded": openMenu === 'bell', children: [_jsx(Bell, { size: 18 }), notifications.length ? _jsx("span", { className: "badge-dot", children: notifications.length > 9 ? '9+' : notifications.length }) : null] }), openMenu === 'bell' ? (_jsxs("div", { className: "dropdown dropdown-wide", role: "menu", children: [_jsx("div", { className: "dropdown-header", children: "Needs attention" }), notifications.length === 0 ? (_jsx("p", { className: "dropdown-empty", children: "Nothing needs your attention right now." })) : (notifications.slice(0, 8).map((item) => (_jsxs("button", { type: "button", role: "menuitem", className: `notification notification-${item.severity}`, onClick: () => {
                                            setOpenMenu('none');
                                            navigate(NOTIFICATION_ROUTES[item.entityType] ?? '/');
                                        }, children: [_jsx("strong", { children: item.title }), _jsx("span", { children: item.body })] }, item.id))))] })) : null] }), _jsxs("div", { className: "menu-anchor", children: [_jsxs("button", { type: "button", className: "profile-btn", onClick: () => setOpenMenu(openMenu === 'profile' ? 'none' : 'profile'), "aria-expanded": openMenu === 'profile', children: [_jsx("span", { className: "avatar", children: initials(user?.name ?? '') }), _jsx(ChevronDown, { size: 14, "aria-hidden": "true" })] }), openMenu === 'profile' ? (_jsxs("div", { className: "dropdown", role: "menu", children: [_jsxs("div", { className: "dropdown-profile", children: [_jsx("strong", { children: user?.name }), _jsx("span", { children: user?.email }), _jsx("span", { className: "role-pill", children: user?.role })] }), _jsxs("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/profile'); }, children: [_jsx(UserIcon, { size: 14 }), " My profile"] }), user?.role === 'admin' ? (_jsxs("button", { type: "button", role: "menuitem", onClick: () => { setOpenMenu('none'); navigate('/settings'); }, children: [_jsx(Settings, { size: 14 }), " Organization settings"] })) : null, _jsxs("button", { type: "button", role: "menuitem", className: "danger", onClick: () => void logout(), children: [_jsx(LogOut, { size: 14 }), " Sign out"] })] })) : null] })] })] }));
}
