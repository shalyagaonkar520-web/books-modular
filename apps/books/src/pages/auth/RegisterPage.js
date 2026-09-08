import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';
/** Server-side rules, mirrored here so the user gets feedback before submitting. */
function passwordProblem(password) {
    if (password.length < 8)
        return 'Use at least 8 characters.';
    if (password === password.toLowerCase() || password === password.toUpperCase()) {
        return 'Include both upper and lower case letters.';
    }
    if (!/\d/.test(password))
        return 'Include at least one digit.';
    return null;
}
export function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const { submitting, error, fieldErrors, run, setError } = useSubmit();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [gstin, setGstin] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [touched, setTouched] = useState(false);
    const passwordHint = touched ? passwordProblem(password) : null;
    const onSubmit = async (event) => {
        event.preventDefault();
        setTouched(true);
        const problem = passwordProblem(password);
        if (problem) {
            setError(`Password: ${problem}`);
            return;
        }
        if (password !== confirm) {
            setError('The two passwords do not match.');
            return;
        }
        const result = await run(async () => {
            await register({
                name: name.trim(),
                email: email.trim(),
                password,
                organizationName: organizationName.trim(),
                gstin: gstin.trim() || undefined,
            });
            return true;
        });
        if (result)
            navigate('/', { replace: true });
    };
    return (_jsx("div", { className: "auth-shell", children: _jsxs("div", { className: "auth-card", children: [_jsxs("div", { className: "auth-brand", children: [_jsx("img", { src: "/rooman-logo.png", alt: "" }), _jsx("h1", { className: "auth-title", children: "Create your organization" })] }), _jsx("p", { className: "auth-subtitle", children: "You will be the administrator. Your chart of accounts and a petty cash account are set up automatically, with no sample data." }), _jsxs("form", { onSubmit: onSubmit, noValidate: true, children: [_jsx(FormError, { message: error }), _jsx(TextField, { label: "Organization name", required: true, value: organizationName, error: fieldErrors.organizationName, onChange: (event) => setOrganizationName(event.target.value), autoFocus: true }), _jsx(TextField, { label: "GSTIN", hint: "Optional. You can add it later in settings.", value: gstin, error: fieldErrors.gstin, onChange: (event) => setGstin(event.target.value.toUpperCase()) }), _jsx(TextField, { label: "Your name", required: true, value: name, error: fieldErrors.name, onChange: (event) => setName(event.target.value) }), _jsx(TextField, { label: "Work email", type: "email", autoComplete: "email", required: true, value: email, error: fieldErrors.email, onChange: (event) => setEmail(event.target.value) }), _jsxs("div", { className: "password-row", children: [_jsx(TextField, { label: "Password", type: showPassword ? 'text' : 'password', autoComplete: "new-password", required: true, value: password, error: passwordHint ?? fieldErrors.password, hint: passwordHint ? undefined : 'At least 8 characters, mixed case, with a digit.', onChange: (event) => setPassword(event.target.value), onBlur: () => setTouched(true) }), _jsx("button", { type: "button", className: "password-toggle", onClick: () => setShowPassword((visible) => !visible), "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeOff, { size: 16 }) : _jsx(Eye, { size: 16 }) })] }), _jsx(TextField, { label: "Confirm password", type: showPassword ? 'text' : 'password', autoComplete: "new-password", required: true, value: confirm, error: confirm && confirm !== password ? 'Passwords do not match.' : undefined, onChange: (event) => setConfirm(event.target.value) }), _jsx(Button, { type: "submit", variant: "primary", size: "md", loading: submitting, icon: _jsx(UserPlus, { size: 15 }), className: "btn-block", children: "Create organization" })] }), _jsxs("p", { className: "auth-footer", children: ["Already have an account? ", _jsx(Link, { to: "/login", children: "Sign in" })] })] }) }));
}
