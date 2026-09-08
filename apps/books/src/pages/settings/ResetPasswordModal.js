import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { PASSWORD_HINT, validatePassword } from './passwordRules';
export function ResetPasswordModal({ user, onClose }) {
    const toast = useToast();
    const { submitting, error, fieldErrors, run } = useSubmit();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [localError, setLocalError] = useState(null);
    const reset = async () => {
        if (password !== confirm) {
            setLocalError('The two passwords do not match.');
            return;
        }
        const problem = validatePassword(password);
        if (problem) {
            setLocalError(problem);
            return;
        }
        setLocalError(null);
        const result = await run(() => orgApi.resetUserPassword(user.id, password));
        if (result) {
            toast.success(`${user.name}'s password was reset.`);
            onClose();
        }
    };
    return (_jsx(Modal, { open: true, title: `Reset password · ${user.name}`, subtitle: user.email, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: reset, loading: submitting, disabled: !password || !confirm, children: "Reset password" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: localError ?? error }), _jsx("p", { className: "text-muted small", children: "Their existing sessions keep working until they sign out. Share the new password securely." }), _jsx(TextField, { label: "New password", type: "password", value: password, required: true, hint: PASSWORD_HINT, error: fieldErrors.new_password ?? fieldErrors.newPassword, autoComplete: "new-password", onChange: (event) => setPassword(event.target.value) }), _jsx(TextField, { label: "Confirm new password", type: "password", value: confirm, required: true, autoComplete: "new-password", onChange: (event) => setConfirm(event.target.value) })] }) }));
}
