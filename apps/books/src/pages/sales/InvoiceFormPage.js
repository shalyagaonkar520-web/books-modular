import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Create or edit a sales invoice, with a live line editor and totals that mirror the server. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { contactsApi, invoicesApi, itemsApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, formatQuantity, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';
let lineCounter = 0;
const newLine = () => ({ key: `line-${++lineCounter}`, itemId: '', description: '', quantity: '1', rate: '0', taxRate: '0' });
const lineAmount = (line) => round2(parseNumber(line.quantity) * parseNumber(line.rate));
const lineTax = (line) => round2((lineAmount(line) * parseNumber(line.taxRate)) / 100);
export function InvoiceFormPage() {
    const { invoiceId } = useParams();
    const isEdit = Boolean(invoiceId);
    const navigate = useNavigate();
    const toast = useToast();
    const { organization, canWrite } = useAuth();
    const { submitting, error, fieldErrors, run, setError } = useSubmit();
    const [customerId, setCustomerId] = useState('');
    const [date, setDate] = useState(todayIso());
    const [dueDate, setDueDate] = useState(todayIso());
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState(() => organization?.invoiceNotes ?? '');
    const [terms, setTerms] = useState(() => organization?.invoiceTerms ?? '');
    const [discountAmount, setDiscountAmount] = useState('0');
    const [lines, setLines] = useState(() => [newLine()]);
    const [keepSent, setKeepSent] = useState(false);
    const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
    const items = useAsync((signal) => itemsApi.list({ page_size: 200 }, signal), []);
    const existing = useAsync(async () => (invoiceId ? invoicesApi.get(invoiceId) : null), [invoiceId]);
    const customerList = useMemo(() => customers.data?.items ?? [], [customers.data]);
    const itemList = useMemo(() => items.data?.items ?? [], [items.data]);
    const loaded = existing.data;
    const blocked = loaded ? loaded.status === 'paid' || loaded.status === 'partially_paid' || loaded.status === 'void' || loaded.amountPaid > 0 : false;
    // Prefill from the loaded invoice exactly once.
    useEffect(() => {
        if (!loaded)
            return;
        setCustomerId(loaded.customerId);
        setDate(loaded.date);
        setDueDate(loaded.dueDate);
        setReference(loaded.reference ?? '');
        setNotes(loaded.notes ?? '');
        setTerms(loaded.terms ?? '');
        setDiscountAmount(String(loaded.discountAmount));
        setKeepSent(loaded.status === 'sent' || loaded.status === 'overdue');
        setLines(loaded.lines.length
            ? loaded.lines.map((line) => ({
                key: line.id ?? `line-${++lineCounter}`,
                itemId: line.itemId ?? '',
                description: line.description,
                quantity: String(line.quantity),
                rate: String(line.rate),
                taxRate: String(line.taxRate),
            }))
            : [newLine()]);
    }, [loaded]);
    /** Due date follows `date` + the customer's payment terms, but stays editable. */
    const syncDueDate = (nextCustomerId, nextDate) => {
        const customer = customerList.find((entry) => entry.id === nextCustomerId);
        if (customer && nextDate)
            setDueDate(addDaysIso(nextDate, customer.paymentTermsDays));
    };
    const updateLine = (key, patch) => {
        setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    };
    const chooseItem = (key, itemId) => {
        const item = itemList.find((entry) => entry.id === itemId);
        if (!item) {
            updateLine(key, { itemId: '' });
            return;
        }
        updateLine(key, {
            itemId,
            description: item.salesDescription || item.description || item.name,
            rate: String(item.sellingPrice),
            taxRate: String(item.taxRate),
        });
    };
    const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
    const taxTotal = round2(lines.reduce((sum, line) => sum + lineTax(line), 0));
    const discount = round2(parseNumber(discountAmount));
    const total = round2(subtotal - discount + taxTotal);
    const submit = async (status) => {
        if (!customerId) {
            setError('Select the customer this invoice is for.');
            return;
        }
        if (!lines.length) {
            setError('Add at least one line item.');
            return;
        }
        if (lines.some((line) => !line.description.trim())) {
            setError('Every line needs a description.');
            return;
        }
        if (lines.some((line) => parseNumber(line.quantity) <= 0)) {
            setError('Every line needs a quantity greater than zero.');
            return;
        }
        if (discount > subtotal) {
            setError('The discount cannot exceed the subtotal.');
            return;
        }
        const payload = {
            customerId,
            date,
            dueDate,
            reference: reference.trim() || null,
            discountAmount: discount,
            notes: notes.trim() || null,
            terms: terms.trim() || null,
            status,
            lines: lines.map((line) => ({
                itemId: line.itemId || null,
                description: line.description.trim(),
                quantity: parseNumber(line.quantity),
                rate: round2(parseNumber(line.rate)),
                taxRate: parseNumber(line.taxRate),
            })),
        };
        const saved = await run(() => (invoiceId ? invoicesApi.update(invoiceId, payload) : invoicesApi.create(payload)));
        if (saved) {
            toast.success(`Invoice ${saved.invoiceNumber} ${isEdit ? 'updated' : 'created'}`);
            navigate(`/invoices/${saved.id}`);
        }
    };
    if (!canWrite) {
        return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "New invoice" }), _jsx(ErrorBlock, { message: "Your account has read-only access, so you cannot create or edit invoices." })] }));
    }
    if (isEdit && existing.loading)
        return _jsx(LoadingBlock, { label: "Loading invoice\u2026" });
    if (isEdit && existing.error) {
        return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Edit invoice" }), _jsx(ErrorBlock, { message: existing.error, onRetry: existing.reload })] }));
    }
    if (blocked && loaded) {
        return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: `Invoice ${loaded.invoiceNumber}`, actions: _jsx(Button, { onClick: () => navigate(`/invoices/${loaded.id}`), children: "Back to invoice" }) }), _jsx(ErrorBlock, { message: loaded.status === 'void'
                        ? 'This invoice has been voided, so it can no longer be edited. Create a new invoice instead.'
                        : 'This invoice already has payments recorded against it. Delete those payments first if you need to change it.' })] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: isEdit && loaded ? `Edit invoice ${loaded.invoiceNumber}` : 'New invoice', subtitle: isEdit ? 'Changes re-post this invoice to your books.' : 'Bill a customer for goods or services.', breadcrumb: ['Sales', 'Invoices'], actions: _jsx(Button, { onClick: () => navigate(isEdit && loaded ? `/invoices/${loaded.id}` : '/invoices'), children: "Cancel" }) }), customers.error ? _jsx(ErrorBlock, { message: customers.error, onRetry: customers.reload }) : null, items.error ? _jsx(ErrorBlock, { message: items.error, onRetry: items.reload }) : null, _jsxs("div", { className: "stack", children: [_jsxs(Card, { title: "Invoice details", children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Customer", required: true, value: customerId, placeholder: customers.loading ? 'Loading customers…' : 'Select a customer', disabled: customers.loading, error: fieldErrors.customerId, options: customerList.map((customer) => ({ value: customer.id, label: customer.displayName })), onChange: (event) => {
                                            setCustomerId(event.target.value);
                                            syncDueDate(event.target.value, date);
                                        } }), _jsx(TextField, { label: "Invoice date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => {
                                            setDate(event.target.value);
                                            syncDueDate(customerId, event.target.value);
                                        } }), _jsx(TextField, { label: "Due date", type: "date", required: true, value: dueDate, min: date, hint: "Prefilled from the customer's payment terms.", error: fieldErrors.dueDate, onChange: (event) => setDueDate(event.target.value) }), _jsx(TextField, { label: "Reference", value: reference, placeholder: "PO number or internal reference", error: fieldErrors.reference, onChange: (event) => setReference(event.target.value) })] })] }), _jsxs(Card, { title: "Line items", subtitle: "Amounts are calculated as quantity \u00D7 rate, with tax applied per line.", footer: _jsx(Button, { icon: _jsx(Plus, { size: 15 }), onClick: () => setLines((current) => [...current, newLine()]), children: "Add line" }), children: [_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Item" }), _jsx("th", { scope: "col", children: "Description" }), _jsx("th", { scope: "col", children: "Qty" }), _jsx("th", { scope: "col", children: "Rate" }), _jsx("th", { scope: "col", children: "Tax %" }), _jsx("th", { scope: "col", children: "Amount" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Remove" }) })] }) }), _jsx("tbody", { children: lines.map((line, index) => {
                                                const item = itemList.find((entry) => entry.id === line.itemId);
                                                return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsxs("select", { className: "select", "aria-label": `Item for line ${index + 1}`, value: line.itemId, disabled: items.loading, onChange: (event) => chooseItem(line.key, event.target.value), children: [_jsx("option", { value: "", children: "Custom line" }), itemList.map((entry) => (_jsx("option", { value: entry.id, children: entry.name }, entry.id)))] }), item?.trackInventory ? (_jsxs("small", { className: item.stockOnHand > 0 ? 'text-subtle' : 'text-danger', children: [formatQuantity(item.stockOnHand), " ", item.unit, " in stock"] })) : null] }), _jsx("td", { children: _jsx("input", { className: "input", "aria-label": `Description for line ${index + 1}`, value: line.description, required: true, onChange: (event) => updateLine(line.key, { description: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "input num", type: "number", min: "0", step: "0.001", "aria-label": `Quantity for line ${index + 1}`, value: line.quantity, onChange: (event) => updateLine(line.key, { quantity: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "input num", type: "number", min: "0", step: "0.01", "aria-label": `Rate for line ${index + 1}`, value: line.rate, onChange: (event) => updateLine(line.key, { rate: event.target.value }) }) }), _jsx("td", { children: _jsx("select", { className: "select", "aria-label": `Tax rate for line ${index + 1}`, value: line.taxRate, onChange: (event) => updateLine(line.key, { taxRate: event.target.value }), children: TAX_RATES.map((rate) => (_jsxs("option", { value: String(rate), children: [rate, "%"] }, rate))) }) }), _jsx("td", { className: "align-right num", children: formatCurrency(lineAmount(line)) }), _jsx("td", { className: "align-right", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Remove line ${index + 1}`, disabled: lines.length === 1, onClick: () => setLines((current) => current.filter((entry) => entry.key !== line.key)), children: _jsx(Trash2, { size: 15 }) }) })] }, line.key));
                                            }) })] }) }), fieldErrors.lines ? _jsx(FormError, { message: fieldErrors.lines }) : null] }), _jsxs("div", { className: "grid-2", children: [_jsxs(Card, { title: "Notes and terms", children: [_jsx(TextAreaField, { label: "Notes", value: notes, hint: "Shown to the customer on the invoice.", error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) }), _jsx(TextAreaField, { label: "Terms", value: terms, error: fieldErrors.terms, onChange: (event) => setTerms(event.target.value) })] }), _jsxs(Card, { title: "Totals", children: [_jsx(TextField, { label: "Discount", type: "number", min: "0", step: "0.01", prefix: "\u20B9", value: discountAmount, error: fieldErrors.discountAmount, onChange: (event) => setDiscountAmount(event.target.value) }), _jsx("div", { className: "form-section", children: _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(subtotal) })] }), _jsxs("div", { children: [_jsx("span", { children: "Discount" }), _jsx("span", { children: discount > 0 ? `- ${formatCurrency(discount)}` : formatCurrency(0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Tax total" }), _jsx("span", { children: formatCurrency(taxTotal) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(total) })] })] }) })] })] }), _jsxs("div", { className: "row-between", children: [_jsxs("span", { className: "text-subtle small", children: [lines.length, " ", lines.length === 1 ? 'line' : 'lines', " \u00B7 ", formatCurrency(total), " payable"] }), _jsx("div", { className: "row", children: keepSent ? (_jsx(Button, { variant: "primary", loading: submitting, onClick: () => submit('sent'), children: "Save changes" })) : (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", disabled: submitting, onClick: () => submit('draft'), children: "Save as draft" }), _jsx(Button, { variant: "primary", loading: submitting, onClick: () => submit('sent'), children: "Save and mark as sent" })] })) })] })] })] }));
}
