import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { expensesApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatPercent, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';
const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));
export function ExpenseFormModal({ refs, expense, onClose, onSaved }) {
    const toast = useToast();
    const { submitting, error, fieldErrors, run, setError } = useSubmit();
    const [date, setDate] = useState(expense?.date ?? todayIso());
    const [accountId, setAccountId] = useState(expense?.accountId ?? '');
    const [paidThroughAccountId, setPaidThroughAccountId] = useState(expense?.paidThroughAccountId ?? refs.bankAccounts[0]?.id ?? '');
    const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
    const [taxRate, setTaxRate] = useState(expense ? String(expense.taxRate) : '0');
    const [vendorId, setVendorId] = useState(expense?.vendorId ?? '');
    const [customerId, setCustomerId] = useState(expense?.customerId ?? '');
    const [isBillable, setIsBillable] = useState(expense?.isBillable ?? false);
    const [reference, setReference] = useState(expense?.reference ?? '');
    const [notes, setNotes] = useState(expense?.notes ?? '');
    const parsedAmount = parseNumber(amount, 0);
    const taxAmount = round2((parsedAmount * parseNumber(taxRate, 0)) / 100);
    const total = round2(parsedAmount + taxAmount);
    const save = async () => {
        if (!accountId) {
            setError('Choose the expense account this cost belongs to.');
            return;
        }
        if (!paidThroughAccountId) {
            setError('Choose the account the expense was paid from.');
            return;
        }
        if (parsedAmount <= 0) {
            setError('Enter an amount greater than zero.');
            return;
        }
        if (isBillable && !customerId) {
            setError('Pick the customer this expense will be billed to.');
            return;
        }
        const body = {
            date,
            accountId,
            paidThroughAccountId,
            vendorId: vendorId || null,
            customerId: customerId || null,
            amount: parsedAmount,
            taxRate: parseNumber(taxRate, 0),
            reference: reference.trim() || null,
            notes: notes.trim() || null,
            isBillable,
        };
        const result = await run(() => (expense ? expensesApi.update(expense.id, body) : expensesApi.create(body)));
        if (result) {
            toast.success(expense ? `Expense ${result.expenseNumber} updated` : `Expense ${result.expenseNumber} recorded`);
            onSaved();
        }
    };
    return (_jsxs(Modal, { open: true, title: expense ? `Edit expense ${expense.expenseNumber}` : 'Record expense', subtitle: "Posts a journal entry and a withdrawal on the paying account.", size: "md", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: save, loading: submitting, children: expense ? 'Save changes' : 'Record expense' })] }), children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(SelectField, { label: "Expense account", required: true, value: accountId, placeholder: "Select an expense account", error: fieldErrors.accountId, options: refs.expenseAccounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })), onChange: (event) => setAccountId(event.target.value) })] }), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Paid through", required: true, value: paidThroughAccountId, placeholder: "Select an account", error: fieldErrors.paidThroughAccountId, options: refs.bankAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${formatCurrency(account.currentBalance)}` })), onChange: (event) => setPaidThroughAccountId(event.target.value) }), _jsx(SelectField, { label: "Vendor", value: vendorId, placeholder: "No vendor", error: fieldErrors.vendorId, options: refs.vendors.map((vendor) => ({ value: vendor.id, label: vendor.displayName })), onChange: (event) => setVendorId(event.target.value) })] }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Amount", type: "number", min: "0", step: "0.01", required: true, value: amount, error: fieldErrors.amount, onChange: (event) => setAmount(event.target.value) }), _jsx(SelectField, { label: "Tax rate", value: taxRate, error: fieldErrors.taxRate, options: TAX_OPTIONS, onChange: (event) => setTaxRate(event.target.value) })] }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Amount" }), _jsx("span", { children: formatCurrency(parsedAmount) })] }), _jsxs("div", { children: [_jsxs("span", { children: ["Tax (", formatPercent(parseNumber(taxRate, 0)), ")"] }), _jsx("span", { children: formatCurrency(taxAmount) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(total) })] })] }), _jsxs("div", { className: "form-section", children: [_jsx(CheckboxField, { label: "Billable to a customer", checked: isBillable, onChange: (event) => setIsBillable(event.target.checked) }), _jsx(SelectField, { label: "Customer", value: customerId, placeholder: "No customer", error: fieldErrors.customerId, hint: "Used to rebill this cost later.", options: refs.customers.map((customer) => ({ value: customer.id, label: customer.displayName })), onChange: (event) => setCustomerId(event.target.value) })] }), _jsx(TextField, { label: "Reference", value: reference, error: fieldErrors.reference, hint: "Bill number, receipt number or transaction id.", onChange: (event) => setReference(event.target.value) }), _jsx(TextAreaField, { label: "Notes", value: notes, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) }), expense ? (_jsxs("p", { className: "text-subtle small", children: ["Saving reverses the original journal entry and bank transaction, then reposts them. ", _jsx(Badge, { tone: "info", children: expense.expenseNumber })] })) : null] }));
}
