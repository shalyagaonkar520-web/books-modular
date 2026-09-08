import { jsx as _jsx } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Feedback';
export function NotFoundPage() {
    return (_jsx(EmptyState, { title: "Page not found", description: "The page you were looking for does not exist or has moved.", action: _jsx(Link, { to: "/", className: "btn btn-primary btn-md", children: _jsx("span", { children: "Back to dashboard" }) }) }));
}
