import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { accountingApi, billsApi, contactsApi, itemsApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';
let nextLineKey = 1;
function emptyLine() {
    return { key: `line-${nextLineKey++}`, itemId: '', accountId: '', description: '', quantity: '1', rate: '0', taxRate: '0' };
}
const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));
function lineAmount(line) {
    return round2(parseNumber(line.quantity, 0) * parseNumber(line.rate, 0));
}
export function BillFormPage() {
    const { billId } = useParams();
    const isEdit = Boolean(billId);
    const navigate = useNavigate();
    const toast = useToast();
    const { submitting, error, fieldErrors, run, setError } = useSubmit();
    const refs = useAsync(async () => {
        const [vendorPage, itemPage, accounts] = await Promise.all([
            contactsApi.list({ type: 'vendor', page_size: 200 }),
            itemsApi.list({ page_size: 200 }),
            accountingApi.accounts(),
        ]);
        return {
            vendors: vendorPage.items,
            items: itemPage.items,
            accounts: accounts.filter((account) => account.type === 'expense' || account.type === 'asset'),
        };
    }, []);
    const existing = useAsync(async () => (billId ? billsApi.get(billId) : null), [billId]);
    const [vendorId, setVendorId] = useState('');
    const [vendorBillNumber, setVendorBillNumber] = useState('');
    const [date, setDate] = useState(todayIso);
    const [dueDate, setDueDate] = useState('');
    const [dueDateTouched, setDueDateTouched] = useState(false);
    const [discountAmount, setDiscountAmount] = useState('0');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState(() => [emptyLine()]);
    const [loadedId, setLoadedId] = useState(null);
    const bill = existing.data;
    const editBlocked = bill ? bill.status === 'paid' || bill.status === 'partially_paid' || bill.status === 'void' || bill.amountPaid > 0 : false;
    // Hydrate the form once the bill arrives.
    useEffect(() => {
        if (!bill || loadedId === bill.id)
            return;
        setLoadedId(bill.id);
        setVendorId(bill.vendorId);
        setVendorBillNumber(bill.vendorBillNumber ?? '');
        setDate(bill.date);
        setDueDate(bill.dueDate);
        setDueDateTouched(true);
        setDiscountAmount(String(bill.discountAmount));
        setNotes(bill.notes ?? '');
        setLines(bill.lines.length > 0
            ? bill.lines.map((line) => ({
                key: `line-${nextLineKey++}`,
                itemId: line.itemId ?? '',
                accountId: line.accountId ?? '',
                description: line.description,
                quantity: String(line.quantity),
                rate: String(line.rate),
                taxRate: String(line.taxRate),
            }))
            : [emptyLine()]);
    }, [bill, loadedId]);
    const vendor = useMemo(() => refs.data?.vendors.find((candidate) => candidate.id === vendorId) ?? null, [refs.data, vendorId]);
    // Default the due date from the vendor's payment terms until the user edits it.
    useEffect(() => {
        if (dueDateTouched || !vendor || !date)
            return;
        setDueDate(addDaysIso(date, vendor.paymentTermsDays));
    }, [vendor, date, dueDateTouched]);
    const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
    const taxTotal = round2(lines.reduce((sum, line) => sum + round2((lineAmount(line) * parseNumber(line.taxRate, 0)) / 100), 0));
    const discount = round2(parseNumber(discountAmount, 0));
    const grandTotal = round2(subtotal - discount + taxTotal);
    const updateLine = (key, patch) => {
        setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    };
    const pickItem = (key, itemId) => {
        const item = refs.data?.items.find((candidate) => candidate.id === itemId);
        if (!item) {
            updateLine(key, { itemId: '' });
            return;
        }
        updateLine(key, {
            itemId,
            description: item.purchaseDescription || item.description || item.name,
            rate: String(item.costPrice),
            taxRate: String(item.taxRate),
        });
    };
    const validate = () => {
        if (!vendorId)
            return 'Choose the vendor this bill is from.';
        if (lines.length === 0)
            return 'Add at least one line item.';
        for (const [index, line] of lines.entries()) {
            if (!line.description.trim())
                return `Line ${index + 1}: enter a description.`;
            if (parseNumber(line.quantity, 0) <= 0)
                return `Line ${index + 1}: quantity must be greater than zero.`;
        }
        if (discount > subtotal)
            return 'Discount cannot exceed the subtotal.';
        return null;
    };
    const save = async (status) => {
        const message = validate();
        if (message) {
            setError(message);
            return;
        }
        const body = {
            vendorId,
            vendorBillNumber: vendorBillNumber.trim() || null,
            date,
            dueDate: dueDate || null,
            discountAmount: discount,
            notes: notes.trim() || null,
            status,
            lines: lines.map((line) => ({
                itemId: line.itemId || null,
                accountId: line.accountId || null,
                description: line.description.trim(),
                quantity: parseNumber(line.quantity, 0),
                rate: parseNumber(line.rate, 0),
                taxRate: parseNumber(line.taxRate, 0),
            })),
        };
        const result = await run(() => (billId ? billsApi.update(billId, body) : billsApi.create(body)));
        if (result) {
            toast.success(isEdit ? `Bill ${result.billNumber} updated` : `Bill ${result.billNumber} saved as ${result.status}`);
            navigate('/bills');
        }
    };
    if (refs.loading || (isEdit && existing.loading))
        return _jsx(LoadingBlock, { label: "Loading bill form\u2026" });
    if (refs.error)
        return _jsx(ErrorBlock, { message: refs.error, onRetry: refs.reload });
    if (isEdit && existing.error)
        return _jsx(ErrorBlock, { message: existing.error, onRetry: existing.reload });
    if (isEdit && editBlocked) {
        return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: `Bill ${bill?.billNumber ?? ''}`.trim(), subtitle: "This bill can no longer be edited.", breadcrumb: ['Purchases', 'Bills'], actions: _jsx(Button, { variant: "secondary", onClick: () => navigate('/bills'), children: "Back to bills" }) }), _jsx(ErrorBlock, { message: bill?.status === 'void'
                        ? 'This bill has been voided, so it can no longer be edited. Create a new bill instead.'
                        : 'This bill already has payments recorded against it. Delete the payments first, or create a new bill.' })] }));
    }
    const isOpenBill = bill?.status === 'open' || bill?.status === 'overdue';
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: isEdit ? `Edit bill ${bill?.billNumber ?? ''}`.trim() : 'New bill', subtitle: "Record what you owe a vendor. Opening a bill posts it to the ledger.", breadcrumb: ['Purchases', 'Bills'], actions: _jsx(Button, { variant: "secondary", onClick: () => navigate('/bills'), disabled: submitting, children: "Cancel" }) }), _jsxs(Card, { children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-section", children: [_jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Vendor", required: true, value: vendorId, placeholder: "Select a vendor", error: fieldErrors.vendorId, options: (refs.data?.vendors ?? []).map((option) => ({ value: option.id, label: option.displayName })), onChange: (event) => setVendorId(event.target.value) }), _jsx(TextField, { label: "Vendor bill number", value: vendorBillNumber, error: fieldErrors.vendorBillNumber, hint: "The number printed on the vendor's invoice.", onChange: (event) => setVendorBillNumber(event.target.value) })] }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Bill date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(TextField, { label: "Due date", type: "date", value: dueDate, error: fieldErrors.dueDate, hint: vendor ? `${vendor.displayName} terms: ${vendor.paymentTermsDays} days` : 'Defaults from the vendor payment terms.', onChange: (event) => {
                                            setDueDateTouched(true);
                                            setDueDate(event.target.value);
                                        } })] })] }), _jsxs("div", { className: "form-section", children: [_jsx("h2", { className: "form-section-title", children: "Line items" }), _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Item" }), _jsx("th", { children: "Account" }), _jsx("th", { children: "Description" }), _jsx("th", { children: "Qty" }), _jsx("th", { children: "Rate" }), _jsx("th", { children: "Tax" }), _jsx("th", { children: "Amount" }), _jsx("th", { children: _jsx("span", { className: "sr-only", children: "Remove" }) })] }) }), _jsx("tbody", { children: lines.map((line, index) => {
                                            const item = refs.data?.items.find((candidate) => candidate.id === line.itemId) ?? null;
                                            return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsxs("select", { className: "select", value: line.itemId, "aria-label": `Line ${index + 1} item`, onChange: (event) => pickItem(line.key, event.target.value), children: [_jsx("option", { value: "", children: "No item" }), (refs.data?.items ?? []).map((option) => (_jsx("option", { value: option.id, children: option.name }, option.id)))] }), item?.trackInventory ? _jsx("small", { className: "text-muted", children: "Stock will increase when this bill is opened." }) : null] }), _jsx("td", { children: _jsxs("select", { className: "select", value: line.accountId, "aria-label": `Line ${index + 1} account`, onChange: (event) => updateLine(line.key, { accountId: event.target.value }), children: [_jsx("option", { value: "", children: "Default expense account" }), (refs.data?.accounts ?? []).map((account) => (_jsxs("option", { value: account.id, children: [account.code, " \u00B7 ", account.name] }, account.id)))] }) }), _jsx("td", { children: _jsx("input", { className: "input", value: line.description, required: true, "aria-label": `Line ${index + 1} description`, onChange: (event) => updateLine(line.key, { description: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "input num", type: "number", min: "0", step: "0.001", value: line.quantity, "aria-label": `Line ${index + 1} quantity`, onChange: (event) => updateLine(line.key, { quantity: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "input num", type: "number", min: "0", step: "0.01", value: line.rate, "aria-label": `Line ${index + 1} rate`, onChange: (event) => updateLine(line.key, { rate: event.target.value }) }) }), _jsx("td", { children: _jsx("select", { className: "select", value: line.taxRate, "aria-label": `Line ${index + 1} tax rate`, onChange: (event) => updateLine(line.key, { taxRate: event.target.value }), children: TAX_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }) }), _jsx("td", { className: "num", children: formatCurrency(lineAmount(line)) }), _jsx("td", { children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Remove line ${index + 1}`, disabled: lines.length === 1, onClick: () => setLines((current) => current.filter((candidate) => candidate.key !== line.key)), children: _jsx(Trash2, { size: 15 }) }) })] }, line.key));
                                        }) })] }), _jsx("div", { className: "row", children: _jsx(Button, { variant: "secondary", size: "sm", icon: _jsx(Plus, { size: 14 }), onClick: () => setLines((current) => [...current, emptyLine()]), children: "Add line" }) })] }), _jsxs("div", { className: "form-section", children: [_jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Discount amount", type: "number", min: "0", step: "0.01", value: discountAmount, error: fieldErrors.discountAmount, hint: `Cannot exceed the subtotal of ${formatCurrency(subtotal)}.`, onChange: (event) => setDiscountAmount(event.target.value) }), _jsx(TextAreaField, { label: "Notes", value: notes, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) })] }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(subtotal) })] }), _jsxs("div", { children: [_jsx("span", { children: "Discount" }), _jsxs("span", { children: ["-", formatCurrency(discount)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Tax total" }), _jsx("span", { children: formatCurrency(taxTotal) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Grand total" }), _jsx("span", { children: formatCurrency(grandTotal) })] })] })] }), _jsxs("div", { className: "row-between", children: [_jsx("span", { className: "text-subtle small", children: isEdit ? 'Saving re-posts the ledger entries for this bill.' : 'Drafts stay out of the ledger until you open them.' }), _jsx("div", { className: "row", children: isEdit && isOpenBill ? (_jsx(Button, { variant: "primary", loading: submitting, onClick: () => void save('open'), children: "Save changes" })) : (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", loading: submitting, onClick: () => void save('draft'), children: "Save as draft" }), _jsx(Button, { variant: "primary", loading: submitting, onClick: () => void save('open'), children: "Save and open" })] })) })] })] })] }));
}
