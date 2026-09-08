import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';
export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { submitting, error, fieldErrors, run } = useSubmit();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const onSubmit = async (event) => {
        event.preventDefault();
        const result = await run(async () => {
            await login(email.trim(), password);
            return true;
        });
        if (result) {
            const from = location.state?.from;
            navigate(from && from !== '/login' ? from : '/', { replace: true });
        }
    };
    return (_jsx("div", { className: "auth-shell", children: _jsxs("div", { className: "auth-card", children: [_jsxs("div", { className: "auth-brand", children: [_jsx("img", { src: "/rooman-logo.png", alt: "" }), _jsx("div", { children: _jsx("h1", { className: "auth-title", children: "Rooman Books" }) })] }), _jsx("p", { className: "auth-subtitle", children: "Sign in to your organization's books." }), _jsxs("form", { onSubmit: onSubmit, noValidate: true, children: [_jsx(FormError, { message: error }), _jsx(TextField, { label: "Work email", type: "email", name: "email", autoComplete: "email", required: true, value: email, error: fieldErrors.email, onChange: (event) => setEmail(event.target.value), autoFocus: true }), _jsxs("div", { className: "password-row", children: [_jsx(TextField, { label: "Password", type: showPassword ? 'text' : 'password', name: "password", autoComplete: "current-password", required: true, value: password, error: fieldErrors.password, onChange: (event) => setPassword(event.target.value) }), _jsx("button", { type: "button", className: "password-toggle", onClick: () => setShowPassword((visible) => !visible), "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeOff, { size: 16 }) : _jsx(Eye, { size: 16 }) })] }), _jsx(Button, { type: "submit", variant: "primary", size: "md", loading: submitting, icon: _jsx(LogIn, { size: 15 }), className: "btn-block", children: "Sign in" })] }), _jsxs("p", { className: "auth-footer", children: ["New to Rooman Books? ", _jsx(Link, { to: "/register", children: "Create an organization" })] })] }) }));
}
