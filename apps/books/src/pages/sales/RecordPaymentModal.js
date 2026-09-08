import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Shared "record customer payment" dialog used by the sales pages. */
import { useEffect, useMemo, useState } from 'react';
import { emptyPage } from '@/api/client';
import { bankingApi, customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';
export function RecordPaymentModal({ open, onClose, onSaved, invoice, customers = [] }) {
    const toast = useToast();
    const { submitting, error, fieldErrors, run, reset, setError } = useSubmit();
    const customerMode = !invoice;
    const [customerId, setCustomerId] = useState('');
    const [invoiceId, setInvoiceId] = useState('');
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(todayIso());
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState(PAYMENT_MODES[0].value);
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const accounts = useAsync(async () => (open ? bankingApi.accounts() : []), [open]);
    const openInvoices = useAsync(async (signal) => open && customerMode && customerId
        ? invoicesApi.list({ customer_id: customerId, status: 'unpaid', page_size: 200 }, signal)
        : emptyPage(), [open, customerMode, customerId]);
    // Fresh form every time the dialog opens.
    useEffect(() => {
        if (!open)
            return;
        reset();
        setCustomerId(invoice?.customerId ?? '');
        setInvoiceId('');
        setDate(todayIso());
        setAmount(invoice ? String(invoice.balanceDue) : '');
        setMode(PAYMENT_MODES[0].value);
        setReference('');
        setNotes('');
    }, [open, invoice, reset]);
    // Default to the primary bank account once the list arrives.
    useEffect(() => {
        const list = accounts.data;
        if (!list?.length)
            return;
        setBankAccountId((current) => (current && list.some((account) => account.id === current) ? current : (list.find((a) => a.isPrimary) ?? list[0]).id));
    }, [accounts.data]);
    const selectedInvoice = useMemo(() => (customerMode ? openInvoices.data?.items.find((item) => item.id === invoiceId) ?? null : null), [customerMode, openInvoices.data, invoiceId]);
    const maxAmount = invoice ? invoice.balanceDue : selectedInvoice?.balanceDue ?? null;
    const chooseInvoice = (value) => {
        setInvoiceId(value);
        const picked = openInvoices.data?.items.find((item) => item.id === value);
        setAmount(picked ? String(picked.balanceDue) : '');
    };
    const submit = async () => {
        const payerId = invoice ? invoice.customerId : customerId;
        if (!payerId) {
            setError('Select the customer who paid.');
            return;
        }
        if (!bankAccountId) {
            setError('Select the bank or cash account the money landed in.');
            return;
        }
        const value = round2(parseNumber(amount));
        if (value <= 0) {
            setError('Enter a payment amount greater than zero.');
            return;
        }
        if (maxAmount !== null && value > round2(maxAmount)) {
            setError(`Payment cannot exceed the invoice balance of ${formatCurrency(maxAmount)}.`);
            return;
        }
        const result = await run(() => customerPaymentsApi.create({
            customerId: payerId,
            invoiceId: invoice ? invoice.id : invoiceId || null,
            bankAccountId,
            date,
            amount: value,
            mode,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
        }));
        if (result) {
            toast.success(`Payment ${result.paymentNumber} recorded`);
            onSaved();
            onClose();
        }
    };
    const bankOptions = (accounts.data ?? []).map((account) => ({
        value: account.id,
        label: account.bankName ? `${account.name} · ${account.bankName}` : account.name,
    }));
    return (_jsx(Modal, { open: open, title: "Record payment", subtitle: invoice ? `Against invoice ${invoice.invoiceNumber}` : 'Money received from a customer', onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: submit, loading: submitting, children: "Record payment" })] }), children: accounts.loading ? (_jsx(LoadingBlock, { label: "Loading accounts\u2026" })) : accounts.error ? (_jsx(ErrorBlock, { message: accounts.error, onRetry: accounts.reload })) : !bankOptions.length ? (_jsx(ErrorBlock, { message: "Add a bank or cash account in Banking before recording payments." })) : (_jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), invoice ? (_jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Invoice" }), _jsx("dd", { className: "strong", children: invoice.invoiceNumber })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Balance due" }), _jsx("dd", { className: "num strong", children: formatCurrency(invoice.balanceDue) })] })] })) : (_jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Customer", required: true, value: customerId, placeholder: "Select a customer", error: fieldErrors.customerId, options: customers.map((customer) => ({ value: customer.id, label: customer.displayName })), onChange: (event) => {
                                setCustomerId(event.target.value);
                                setInvoiceId('');
                                setAmount('');
                            } }), _jsx(SelectField, { label: "Apply to invoice", value: invoiceId, placeholder: openInvoices.loading ? 'Loading invoices…' : 'Unapplied advance', hint: customerId ? 'Leave blank to hold the money as a customer advance.' : 'Pick a customer first.', error: fieldErrors.invoiceId, disabled: !customerId || openInvoices.loading, options: (openInvoices.data?.items ?? []).map((item) => ({
                                value: item.id,
                                label: `${item.invoiceNumber} · ${formatCurrency(item.balanceDue)} due`,
                            })), onChange: (event) => chooseInvoice(event.target.value) })] })), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Deposit to", required: true, value: bankAccountId, options: bankOptions, error: fieldErrors.bankAccountId, onChange: (event) => setBankAccountId(event.target.value) }), _jsx(TextField, { label: "Payment date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(TextField, { label: "Amount", type: "number", min: "0", step: "0.01", max: maxAmount !== null ? String(maxAmount) : undefined, required: true, value: amount, prefix: "\u20B9", error: fieldErrors.amount, hint: maxAmount !== null ? `Up to ${formatCurrency(maxAmount)}` : undefined, onChange: (event) => setAmount(event.target.value) }), _jsx(SelectField, { label: "Payment mode", value: mode, options: PAYMENT_MODES.map((option) => ({ value: option.value, label: option.label })), error: fieldErrors.mode, onChange: (event) => setMode(event.target.value) }), _jsx(TextField, { label: "Reference", value: reference, placeholder: "UTR, cheque or transaction number", error: fieldErrors.reference, onChange: (event) => setReference(event.target.value) })] }), _jsx(TextAreaField, { label: "Notes", value: notes, rows: 2, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) })] })) }));
}
