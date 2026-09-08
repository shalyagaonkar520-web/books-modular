import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from 'react';
import { bankingApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';
const TRANSACTION_TYPES = [
    { value: 'deposit', label: 'Deposit (money in)' },
    { value: 'withdrawal', label: 'Withdrawal (money out)' },
];
export function BankTransactionModal({ open, account, ledgerAccounts, onClose, onSaved }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [form, setForm] = useState({
        date: todayIso(),
        type: 'deposit',
        amount: '',
        description: '',
        reference: '',
        counterAccountId: '',
    });
    useEffect(() => {
        if (!open)
            return;
        reset();
        setForm({ date: todayIso(), type: 'deposit', amount: '', description: '', reference: '', counterAccountId: '' });
    }, [open, reset]);
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const counterOptions = ledgerAccounts
        .filter((ledgerAccount) => ledgerAccount.id !== account?.ledgerAccountId)
        .map((ledgerAccount) => ({ value: ledgerAccount.id, label: `${ledgerAccount.code} · ${ledgerAccount.name}` }));
    const onSubmit = async (event) => {
        event.preventDefault();
        if (!account)
            return;
        const saved = await run(() => bankingApi.createTransaction(account.id, {
            date: form.date,
            type: form.type,
            amount: parseNumber(form.amount),
            description: form.description.trim(),
            reference: form.reference.trim() || null,
            counterAccountId: form.counterAccountId,
        }));
        if (saved)
            onSaved('Transaction recorded.');
    };
    return (_jsx(Modal, { open: open, title: "Add transaction", subtitle: account ? account.name : undefined, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, children: "Record transaction" })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Date", type: "date", required: true, value: form.date, error: fieldErrors.date, onChange: (event) => set('date', event.target.value) }), _jsx(SelectField, { label: "Type", required: true, options: TRANSACTION_TYPES, value: form.type, error: fieldErrors.type, onChange: (event) => set('type', event.target.value) }), _jsx(TextField, { label: "Amount", type: "number", step: "0.01", min: "0", required: true, value: form.amount, error: fieldErrors.amount, onChange: (event) => set('amount', event.target.value) }), _jsx(TextField, { label: "Reference", value: form.reference, error: fieldErrors.reference, onChange: (event) => set('reference', event.target.value) }), _jsx(SelectField, { label: "Counter account", required: true, placeholder: "Select the other side of the entry", options: counterOptions, value: form.counterAccountId, error: fieldErrors.counterAccountId, hint: "Income, expense or balance sheet account this money came from or went to.", onChange: (event) => set('counterAccountId', event.target.value) })] }), _jsx(TextAreaField, { label: "Description", required: true, rows: 2, value: form.description, error: fieldErrors.description, onChange: (event) => set('description', event.target.value) })] }) }));
}
export function BankTransferModal({ open, accounts, defaultFromAccountId, onClose, onSaved }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [form, setForm] = useState({
        fromAccountId: '',
        toAccountId: '',
        date: todayIso(),
        amount: '',
        description: '',
        reference: '',
    });
    useEffect(() => {
        if (!open)
            return;
        reset();
        setForm({
            fromAccountId: defaultFromAccountId ?? '',
            toAccountId: '',
            date: todayIso(),
            amount: '',
            description: '',
            reference: '',
        });
    }, [open, defaultFromAccountId, reset]);
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const options = accounts.map((account) => ({ value: account.id, label: account.name }));
    const onSubmit = async (event) => {
        event.preventDefault();
        const saved = await run(() => bankingApi.transfer({
            fromAccountId: form.fromAccountId,
            toAccountId: form.toAccountId,
            date: form.date,
            amount: parseNumber(form.amount),
            description: form.description.trim() || null,
            reference: form.reference.trim() || null,
        }));
        if (saved)
            onSaved(saved.message);
    };
    return (_jsx(Modal, { open: open, title: "Transfer between accounts", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, children: "Record transfer" })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "From account", required: true, placeholder: "Select an account", options: options, value: form.fromAccountId, error: fieldErrors.fromAccountId, onChange: (event) => set('fromAccountId', event.target.value) }), _jsx(SelectField, { label: "To account", required: true, placeholder: "Select an account", options: options.filter((option) => option.value !== form.fromAccountId), value: form.toAccountId, error: fieldErrors.toAccountId, onChange: (event) => set('toAccountId', event.target.value) }), _jsx(TextField, { label: "Date", type: "date", required: true, value: form.date, error: fieldErrors.date, onChange: (event) => set('date', event.target.value) }), _jsx(TextField, { label: "Amount", type: "number", step: "0.01", min: "0", required: true, value: form.amount, error: fieldErrors.amount, onChange: (event) => set('amount', event.target.value) }), _jsx(TextField, { label: "Reference", value: form.reference, error: fieldErrors.reference, onChange: (event) => set('reference', event.target.value) }), _jsx(TextField, { label: "Description", value: form.description, error: fieldErrors.description, onChange: (event) => set('description', event.target.value) })] })] }) }));
}
