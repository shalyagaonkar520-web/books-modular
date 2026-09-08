import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from 'react';
import { accountingApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
export const ACCOUNT_TYPE_OPTIONS = [
    { value: 'asset', label: 'Asset' },
    { value: 'liability', label: 'Liability' },
    { value: 'equity', label: 'Equity' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
];
const BLANK = { code: '', name: '', type: 'asset', subtype: '', description: '', isActive: true };
export function AccountModal({ open, account, onClose, onSaved }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [form, setForm] = useState(BLANK);
    useEffect(() => {
        if (!open)
            return;
        reset();
        setForm(account
            ? {
                code: account.code,
                name: account.name,
                type: account.type,
                subtype: account.subtype ?? '',
                description: account.description ?? '',
                isActive: account.isActive,
            }
            : BLANK);
    }, [open, account, reset]);
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const onSubmit = async (event) => {
        event.preventDefault();
        const saved = await run(() => account
            ? accountingApi.updateAccount(account.id, {
                name: form.name.trim(),
                subtype: form.subtype.trim() || null,
                description: form.description.trim() || null,
                ...(account.isSystem ? {} : { isActive: form.isActive }),
            })
            : accountingApi.createAccount({
                code: form.code.trim(),
                name: form.name.trim(),
                type: form.type,
                subtype: form.subtype.trim() || null,
                description: form.description.trim() || null,
            }));
        if (saved)
            onSaved(account ? 'Account updated.' : 'Account created.');
    };
    return (_jsx(Modal, { open: open, title: account ? 'Edit account' : 'New account', subtitle: account ? `${account.code} · ${account.name}` : 'Add a ledger account to your chart of accounts.', onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, children: account ? 'Save changes' : 'Create account' })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [account ? null : (_jsx(TextField, { label: "Code", required: true, value: form.code, error: fieldErrors.code, hint: "Must be unique in your chart of accounts.", onChange: (event) => set('code', event.target.value) })), _jsx(TextField, { label: "Name", required: true, value: form.name, error: fieldErrors.name, onChange: (event) => set('name', event.target.value) }), account ? null : (_jsx(SelectField, { label: "Type", required: true, options: ACCOUNT_TYPE_OPTIONS, value: form.type, error: fieldErrors.type, onChange: (event) => set('type', event.target.value) })), _jsx(TextField, { label: "Subtype", value: form.subtype, error: fieldErrors.subtype, onChange: (event) => set('subtype', event.target.value) })] }), _jsx(TextAreaField, { label: "Description", rows: 2, value: form.description, error: fieldErrors.description, onChange: (event) => set('description', event.target.value) }), account && !account.isSystem ? (_jsx(CheckboxField, { label: "Active", checked: form.isActive, onChange: (event) => set('isActive', event.target.checked) })) : null, account?.isSystem ? _jsx("p", { className: "small text-muted", children: "This is a system account, so it cannot be deactivated or deleted." }) : null] }) }));
}
