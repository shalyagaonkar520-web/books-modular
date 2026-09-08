import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useState } from 'react';
import { bankingApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';
const ACCOUNT_TYPES = [
    { value: 'bank', label: 'Bank' },
    { value: 'cash', label: 'Cash' },
    { value: 'credit_card', label: 'Credit card' },
];
const BLANK = {
    name: '',
    type: 'bank',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    openingBalance: '0',
    openingBalanceDate: todayIso(),
    isPrimary: false,
    isActive: true,
};
export function BankAccountModal({ open, account, onClose, onSaved }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [form, setForm] = useState(BLANK);
    useEffect(() => {
        if (!open)
            return;
        reset();
        setForm(account
            ? {
                name: account.name,
                type: account.type,
                bankName: account.bankName ?? '',
                accountNumber: '',
                ifsc: account.ifsc ?? '',
                openingBalance: String(account.openingBalance),
                openingBalanceDate: account.openingBalanceDate,
                isPrimary: account.isPrimary,
                isActive: account.isActive,
            }
            : { ...BLANK, openingBalanceDate: todayIso() });
    }, [open, account, reset]);
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const onSubmit = async (event) => {
        event.preventDefault();
        const saved = await run(() => account
            ? bankingApi.updateAccount(account.id, {
                name: form.name.trim(),
                bankName: form.bankName.trim() || null,
                ifsc: form.ifsc.trim() || null,
                isPrimary: form.isPrimary,
                isActive: form.isActive,
                ...(form.accountNumber.trim() ? { accountNumber: form.accountNumber.trim() } : {}),
            })
            : bankingApi.createAccount({
                name: form.name.trim(),
                type: form.type,
                bankName: form.bankName.trim() || null,
                accountNumber: form.accountNumber.trim() || null,
                ifsc: form.ifsc.trim() || null,
                openingBalance: parseNumber(form.openingBalance),
                openingBalanceDate: form.openingBalanceDate,
                isPrimary: form.isPrimary,
            }));
        if (saved)
            onSaved(account ? 'Bank account updated.' : 'Bank account added.');
    };
    return (_jsx(Modal, { open: open, title: account ? 'Edit account' : 'Add account', subtitle: account ? account.name : 'Cash, bank and credit card accounts feed the ledger automatically.', onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, children: account ? 'Save changes' : 'Add account' })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Account name", required: true, value: form.name, error: fieldErrors.name, onChange: (event) => set('name', event.target.value) }), account ? null : (_jsx(SelectField, { label: "Type", required: true, options: ACCOUNT_TYPES, value: form.type, error: fieldErrors.type, onChange: (event) => set('type', event.target.value) })), _jsx(TextField, { label: "Bank name", value: form.bankName, error: fieldErrors.bankName, onChange: (event) => set('bankName', event.target.value) }), _jsx(TextField, { label: "Account number", value: form.accountNumber, error: fieldErrors.accountNumber, hint: account ? 'Leave blank to keep the stored number' : undefined, onChange: (event) => set('accountNumber', event.target.value) }), _jsx(TextField, { label: "IFSC", value: form.ifsc, error: fieldErrors.ifsc, onChange: (event) => set('ifsc', event.target.value.toUpperCase()) }), account ? null : (_jsxs(_Fragment, { children: [_jsx(TextField, { label: "Opening balance", type: "number", step: "0.01", value: form.openingBalance, error: fieldErrors.openingBalance, onChange: (event) => set('openingBalance', event.target.value) }), _jsx(TextField, { label: "Opening balance date", type: "date", required: true, value: form.openingBalanceDate, error: fieldErrors.openingBalanceDate, onChange: (event) => set('openingBalanceDate', event.target.value) })] }))] }), _jsx(CheckboxField, { label: "Primary account", checked: form.isPrimary, onChange: (event) => set('isPrimary', event.target.checked) }), account ? _jsx(CheckboxField, { label: "Active", checked: form.isActive, onChange: (event) => set('isActive', event.target.checked) }) : null] }) }));
}
