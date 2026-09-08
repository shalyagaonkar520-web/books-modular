import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingBlock } from '@/components/ui/Feedback';
import { useAuth } from './AuthContext';
export function RequireAuth() {
    const { user, initializing } = useAuth();
    const location = useLocation();
    if (initializing)
        return _jsx(LoadingBlock, { label: "Restoring your session\u2026" });
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location.pathname } });
    return _jsx(Outlet, {});
}
export function RequireGuest() {
    const { user, initializing } = useAuth();
    if (initializing)
        return _jsx(LoadingBlock, { label: "Loading\u2026" });
    if (user)
        return _jsx(Navigate, { to: "/", replace: true });
    return _jsx(Outlet, {});
}
export function RequireRole({ roles, children }) {
    const { can } = useAuth();
    if (!can(...roles)) {
        return (_jsxs("div", { className: "state-block state-empty", children: [_jsx("h3", { children: "You do not have access to this page" }), _jsx("p", { children: "Ask an administrator in your organization if you need access." })] }));
    }
    return _jsx(_Fragment, { children: children });
}
/** Hides an action (rather than a whole page) from read-only users. */
export function IfCanWrite({ children }) {
    const { canWrite } = useAuth();
    return canWrite ? _jsx(_Fragment, { children: children }) : null;
}
