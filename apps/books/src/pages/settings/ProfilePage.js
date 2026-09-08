import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { TextField } from '@/components/ui/Field';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, titleCase } from '@/utils/format';
import { PASSWORD_HINT, validatePassword } from './passwordRules';
export function ProfilePage() {
    const toast = useToast();
    const { user, organization, updateUser } = useAuth();
    const profile = useSubmit();
    const password = useSubmit();
    const [name, setName] = useState(user?.name ?? '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [passwordProblem, setPasswordProblem] = useState(null);
    if (!user)
        return null;
    const saveName = async () => {
        const updated = await profile.run(() => authApi.updateProfile({ name: name.trim() }));
        if (updated) {
            updateUser(updated);
            toast.success('Your name has been updated.');
        }
    };
    const changePassword = async () => {
        if (newPassword !== confirmNewPassword) {
            setPasswordProblem('The new passwords do not match.');
            return;
        }
        const problem = validatePassword(newPassword);
        if (problem) {
            setPasswordProblem(problem);
            return;
        }
        if (newPassword === currentPassword) {
            setPasswordProblem('Choose a password different from your current one.');
            return;
        }
        setPasswordProblem(null);
        const result = await password.run(() => authApi.changePassword({ currentPassword, newPassword }));
        if (result) {
            toast.success(result.message);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        }
    };
    return (_jsxs("div", { className: "stack", children: [_jsx(PageHeader, { title: "Your profile", subtitle: "Update your details and password" }), _jsxs("div", { className: "grid-2", children: [_jsx(Card, { title: "Account details", subtitle: "Only your name can be changed here", footer: _jsxs("div", { className: "row-between", children: [_jsx("span", { className: "text-muted small", children: "Ask an administrator to change your email or role." }), _jsx(Button, { variant: "primary", onClick: saveName, loading: profile.submitting, disabled: name.trim().length < 2 || name.trim() === user.name, children: "Save name" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: profile.error }), _jsx(TextField, { label: "Full name", value: name, required: true, maxLength: 120, error: profile.fieldErrors.name, onChange: (event) => setName(event.target.value) }), _jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Email" }), _jsx("dd", { className: "detail-value", children: user.email })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Role" }), _jsx("dd", { className: "detail-value", children: _jsx(Badge, { tone: user.role === 'admin' ? 'success' : user.role === 'staff' ? 'info' : 'neutral', children: titleCase(user.role) }) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Organization" }), _jsx("dd", { className: "detail-value", children: organization?.name ?? '—' })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Last login" }), _jsx("dd", { className: "detail-value", children: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'This is your first session' })] })] })] }) }), _jsx(Card, { title: "Change password", subtitle: "You stay signed in on this device", footer: _jsxs("div", { className: "row-between", children: [_jsx("span", { className: "text-muted small", children: "Every other session is signed out." }), _jsx(Button, { variant: "primary", onClick: changePassword, loading: password.submitting, disabled: !currentPassword || !newPassword || !confirmNewPassword, children: "Update password" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: passwordProblem ?? password.error }), _jsx("p", { className: "text-warning small", children: "Changing your password signs you out of every other browser and device." }), _jsx(TextField, { label: "Current password", type: "password", value: currentPassword, required: true, autoComplete: "current-password", error: password.fieldErrors.currentPassword, onChange: (event) => setCurrentPassword(event.target.value) }), _jsx(TextField, { label: "New password", type: "password", value: newPassword, required: true, hint: PASSWORD_HINT, autoComplete: "new-password", error: password.fieldErrors.newPassword, onChange: (event) => setNewPassword(event.target.value) }), _jsx(TextField, { label: "Confirm new password", type: "password", value: confirmNewPassword, required: true, autoComplete: "new-password", onChange: (event) => setConfirmNewPassword(event.target.value) })] }) })] })] }));
}
