import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
export function AppLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);
    return (_jsxs("div", { className: "app-shell", children: [_jsx(Header, { onToggleSidebar: () => setSidebarOpen((open) => !open) }), _jsxs("div", { className: "app-body", children: [_jsx(Sidebar, { open: sidebarOpen, onNavigate: () => setSidebarOpen(false) }), _jsx("main", { className: "app-main", id: "main-content", children: _jsx(Outlet, {}) })] })] }));
}
