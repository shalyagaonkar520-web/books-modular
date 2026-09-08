import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { bankingApi, billsApi, contactsApi, vendorPaymentsApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, parseNumber, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';
export function RecordVendorPaymentModal({ bill, onClose, onSaved }) {
    const toast = useToast();
    const { submitting, error, fieldErrors, run, setError } = useSubmit();
    const refs = useAsync(async () => {
        const [accounts, vendorPage] = await Promise.all([
            bankingApi.accounts(),
            bill ? Promise.resolve(null) : contactsApi.list({ type: 'vendor', page_size: 200 }),
        ]);
        return { accounts, vendors: vendorPage?.items ?? [] };
    }, [bill?.id]);
    const [vendorId, setVendorId] = useState(bill?.vendorId ?? '');
    const [billId, setBillId] = useState(bill?.id ?? '');
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(todayIso);
    const [amount, setAmount] = useState(bill ? String(bill.balanceDue) : '');
    const [mode, setMode] = useState('bank_transfer');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const openBills = useAsync(async () => {
        if (bill || !vendorId)
            return [];
        const page = await billsApi.list({ vendor_id: vendorId, status: 'unpaid', page_size: 200 });
        return page.items;
    }, [bill?.id, vendorId]);
    useEffect(() => {
        const accounts = refs.data?.accounts;
        if (!bankAccountId && accounts && accounts.length > 0)
            setBankAccountId(accounts[0].id);
    }, [refs.data, bankAccountId]);
    const selectedBill = useMemo(() => {
        if (bill)
            return bill;
        return openBills.data?.find((row) => row.id === billId) ?? null;
    }, [bill, billId, openBills.data]);
    const maxAmount = selectedBill ? selectedBill.balanceDue : null;
    const parsedAmount = parseNumber(amount, 0);
    const chooseBill = (nextBillId) => {
        setBillId(nextBillId);
        const target = openBills.data?.find((row) => row.id === nextBillId);
        setAmount(target ? String(target.balanceDue) : '');
    };
    const submit = async () => {
        if (!vendorId) {
            setError('Choose the vendor being paid.');
            return;
        }
        if (!bankAccountId) {
            setError('Choose the account the money was paid from.');
            return;
        }
        if (parsedAmount <= 0) {
            setError('Enter a payment amount greater than zero.');
            return;
        }
        if (maxAmount !== null && parsedAmount > maxAmount) {
            setError(`Payment cannot exceed the bill balance of ${formatCurrency(maxAmount)}.`);
            return;
        }
        const result = await run(() => vendorPaymentsApi.create({
            vendorId,
            billId: billId || null,
            bankAccountId,
            date,
            amount: parsedAmount,
            mode,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
        }));
        if (result) {
            toast.success(`Payment ${result.paymentNumber} recorded`);
            onSaved();
        }
    };
    return (_jsx(Modal, { open: true, title: "Record payment made", subtitle: bill ? `Against bill ${bill.billNumber} · ${bill.vendorName}` : 'Pay a bill or record an advance to a vendor', size: "md", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: submit, loading: submitting, children: "Record payment" })] }), children: refs.loading ? (_jsx(LoadingBlock, { label: "Loading accounts\u2026" })) : refs.error ? (_jsx(ErrorBlock, { message: refs.error, onRetry: refs.reload })) : (_jsxs(_Fragment, { children: [_jsx(FormError, { message: error }), bill ? (_jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Bill", value: bill.billNumber, readOnly: true, disabled: true }), _jsx(TextField, { label: "Balance due", value: formatCurrency(bill.balanceDue), readOnly: true, disabled: true })] })) : (_jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Vendor", required: true, value: vendorId, placeholder: "Select a vendor", error: fieldErrors.vendorId, options: (refs.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName })), onChange: (event) => {
                                setVendorId(event.target.value);
                                setBillId('');
                                setAmount('');
                            } }), _jsx(SelectField, { label: "Apply to bill", value: billId, placeholder: vendorId ? 'Advance to vendor (no bill)' : 'Select a vendor first', hint: openBills.loading ? 'Loading open bills…' : 'Leave blank to record an advance.', error: fieldErrors.billId, options: (openBills.data ?? []).map((row) => ({
                                value: row.id,
                                label: `${row.billNumber} · ${formatCurrency(row.balanceDue)} due`,
                            })), onChange: (event) => chooseBill(event.target.value) })] })), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Paid through", required: true, value: bankAccountId, placeholder: "Select an account", error: fieldErrors.bankAccountId, options: (refs.data?.accounts ?? []).map((account) => ({
                                value: account.id,
                                label: `${account.name} · ${formatCurrency(account.currentBalance)}`,
                            })), onChange: (event) => setBankAccountId(event.target.value) }), _jsx(TextField, { label: "Payment date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) })] }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Amount", type: "number", min: "0", step: "0.01", max: maxAmount !== null ? String(maxAmount) : undefined, required: true, value: amount, error: fieldErrors.amount, hint: maxAmount !== null ? `Balance due ${formatCurrency(maxAmount)}` : undefined, onChange: (event) => setAmount(event.target.value) }), _jsx(SelectField, { label: "Payment mode", value: mode, error: fieldErrors.mode, options: PAYMENT_MODES.map((option) => ({ value: option.value, label: option.label })), onChange: (event) => setMode(event.target.value) })] }), _jsx(TextField, { label: "Reference", value: reference, error: fieldErrors.reference, hint: "Cheque number, UTR or transaction id.", onChange: (event) => setReference(event.target.value) }), _jsx(TextAreaField, { label: "Notes", value: notes, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) })] })) }));
}
