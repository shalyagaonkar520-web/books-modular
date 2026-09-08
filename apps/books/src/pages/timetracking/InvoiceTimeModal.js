import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useState } from 'react';
import { projectsApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, formatDate, formatNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';
const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));
export function InvoiceTimeModal({ open, project, onClose, onInvoiced }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [date, setDate] = useState(todayIso());
    const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 15));
    const [taxRate, setTaxRate] = useState('0');
    const [selectedIds, setSelectedIds] = useState([]);
    const projectId = open ? project?.id : undefined;
    const entries = useAsync(() => projectId
        ? projectsApi.timeEntries({ project_id: projectId, unbilled_only: true, page_size: 200 })
        : Promise.resolve(null), [projectId]);
    useEffect(() => {
        if (!open)
            return;
        reset();
        const today = todayIso();
        setDate(today);
        setDueDate(addDaysIso(today, 15));
        setTaxRate('0');
    }, [open, reset]);
    const items = useMemo(() => entries.data?.items ?? [], [entries.data]);
    useEffect(() => {
        setSelectedIds(items.map((entry) => entry.id));
    }, [items]);
    const totals = useMemo(() => {
        const rate = project?.hourlyRate ?? 0;
        const hours = round2(items.filter((entry) => selectedIds.includes(entry.id)).reduce((sum, entry) => sum + entry.hours, 0));
        const subtotal = round2(hours * rate);
        const tax = round2((subtotal * Number(taxRate)) / 100);
        return { hours, subtotal, tax, total: round2(subtotal + tax) };
    }, [items, selectedIds, project, taxRate]);
    const toggle = (id) => setSelectedIds((current) => (current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id]));
    const onSubmit = async (event) => {
        event.preventDefault();
        if (!project || !selectedIds.length)
            return;
        const invoice = await run(() => projectsApi.invoiceTime({
            projectId: project.id,
            date,
            dueDate,
            timeEntryIds: selectedIds,
            taxRate: Number(taxRate),
        }));
        if (invoice)
            onInvoiced(invoice);
    };
    return (_jsx(Modal, { open: open, title: "Invoice unbilled time", subtitle: project ? `${project.name} · ${formatCurrency(project.hourlyRate)} / hour` : undefined, size: "lg", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, disabled: !selectedIds.length, children: "Create invoice" })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "Invoice date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(TextField, { label: "Due date", type: "date", required: true, value: dueDate, error: fieldErrors.dueDate, onChange: (event) => setDueDate(event.target.value) }), _jsx(SelectField, { label: "Tax rate", options: TAX_OPTIONS, value: taxRate, error: fieldErrors.taxRate, onChange: (event) => setTaxRate(event.target.value) })] }), entries.loading ? (_jsx(LoadingBlock, { label: "Loading unbilled time\u2026" })) : entries.error ? (_jsx(ErrorBlock, { message: entries.error, onRetry: entries.reload })) : !items.length ? (_jsx(EmptyState, { title: "No unbilled time", description: "Every billable entry on this project has already been invoiced." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row-between", children: [_jsx("span", { className: "strong", children: "Unbilled entries" }), _jsxs("div", { className: "row", children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: () => setSelectedIds(items.map((entry) => entry.id)), children: "Select all" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setSelectedIds([]), disabled: !selectedIds.length, children: "Clear" })] })] }), _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Include" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Description" }), _jsx("th", { children: "Logged by" }), _jsx("th", { className: "align-right", children: "Hours" })] }) }), _jsx("tbody", { children: items.map((entry) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", className: "checkbox", checked: selectedIds.includes(entry.id), "aria-label": `Include ${entry.hours} hours on ${formatDate(entry.date)}`, onChange: () => toggle(entry.id) }) }), _jsx("td", { children: formatDate(entry.date) }), _jsx("td", { className: "text-muted", children: entry.description ?? '—' }), _jsx("td", { children: entry.userName }), _jsx("td", { className: "align-right num", children: formatNumber(entry.hours) })] }, entry.id))) })] }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Selected hours" }), _jsx("span", { className: "num", children: formatNumber(totals.hours) })] }), _jsxs("div", { children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { className: "num", children: formatCurrency(totals.subtotal) })] }), _jsxs("div", { children: [_jsxs("span", { children: ["Tax (", taxRate, "%)"] }), _jsx("span", { className: "num", children: formatCurrency(totals.tax) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Invoice total" }), _jsx("span", { className: "num", children: formatCurrency(totals.total) })] })] })] }))] }) }));
}
