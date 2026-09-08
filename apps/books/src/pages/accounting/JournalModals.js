import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { accountingApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, round2, titleCase, todayIso } from '@/utils/format';
export function JournalDetailModal({ entry, onClose }) {
    const totalDebit = entry ? round2(entry.lines.reduce((sum, line) => sum + line.debit, 0)) : 0;
    const totalCredit = entry ? round2(entry.lines.reduce((sum, line) => sum + line.credit, 0)) : 0;
    return (_jsx(Modal, { open: !!entry, title: entry ? `Journal ${entry.entryNumber}` : 'Journal entry', subtitle: entry ? `${formatDate(entry.date)} · ${titleCase(entry.sourceType)}` : undefined, size: "lg", onClose: onClose, footer: _jsx(Button, { onClick: onClose, children: "Close" }), children: entry ? (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Date" }), _jsx("span", { className: "detail-value", children: formatDate(entry.date) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Reference" }), _jsx("span", { className: "detail-value", children: entry.reference ?? '—' })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Source" }), _jsx("span", { className: "detail-value", children: titleCase(entry.sourceType) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Reversal" }), _jsx("span", { className: "detail-value", children: entry.isReversal ? 'Yes' : 'No' })] })] }), entry.notes ? _jsx("p", { className: "text-muted", children: entry.notes }) : null, _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Account" }), _jsx("th", { children: "Description" }), _jsx("th", { className: "align-right", children: "Debit" }), _jsx("th", { className: "align-right", children: "Credit" })] }) }), _jsx("tbody", { children: entry.lines.map((line) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "cell-stack", children: [_jsx("span", { children: line.accountName }), _jsx("small", { children: line.accountCode })] }) }), _jsx("td", { className: "text-muted", children: line.description ?? '—' }), _jsx("td", { className: "align-right num", children: line.debit ? formatCurrency(line.debit) : '—' }), _jsx("td", { className: "align-right num", children: line.credit ? formatCurrency(line.credit) : '—' })] }, line.id))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { className: "strong", colSpan: 2, children: "Totals" }), _jsx("td", { className: "align-right num strong", children: formatCurrency(totalDebit) }), _jsx("td", { className: "align-right num strong", children: formatCurrency(totalCredit) })] }) })] }), _jsx(Badge, { tone: totalDebit === totalCredit ? 'success' : 'danger', children: totalDebit === totalCredit ? 'Balanced' : 'Out of balance' })] })) : null }));
}
let nextLineKey = 1;
const blankLine = () => ({ key: `line-${nextLineKey++}`, accountId: '', description: '', debit: '', credit: '' });
export function NewJournalModal({ open, accounts, onClose, onSaved }) {
    const formId = useId();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [date, setDate] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState([]);
    useEffect(() => {
        if (!open)
            return;
        reset();
        setDate(todayIso());
        setReference('');
        setNotes('');
        setLines([blankLine(), blankLine()]);
    }, [open, reset]);
    const updateLine = (key, patch) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    const totalDebit = round2(lines.reduce((sum, line) => sum + parseNumber(line.debit), 0));
    const totalCredit = round2(lines.reduce((sum, line) => sum + parseNumber(line.credit), 0));
    const difference = round2(totalDebit - totalCredit);
    const filled = lines.filter((line) => line.accountId && (parseNumber(line.debit) > 0 || parseNumber(line.credit) > 0));
    const balanced = difference === 0 && totalDebit > 0;
    const canSubmit = balanced && filled.length >= 2;
    const onSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit)
            return;
        const saved = await run(() => accountingApi.createJournal({
            date,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
            lines: filled.map((line) => ({
                accountId: line.accountId,
                description: line.description.trim() || null,
                debit: parseNumber(line.debit),
                credit: parseNumber(line.credit),
            })),
        }));
        if (saved)
            onSaved(`Journal ${saved.entryNumber} posted.`);
    };
    return (_jsx(Modal, { open: open, title: "New journal entry", subtitle: "Debits and credits must balance before the entry can be posted.", size: "xl", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, disabled: !canSubmit, children: "Post entry" })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "Date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(TextField, { label: "Reference", value: reference, error: fieldErrors.reference, onChange: (event) => setReference(event.target.value) })] }), _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Account" }), _jsx("th", { children: "Description" }), _jsx("th", { className: "align-right", children: "Debit" }), _jsx("th", { className: "align-right", children: "Credit" }), _jsx("th", {})] }) }), _jsx("tbody", { children: lines.map((line) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("select", { className: "select", value: line.accountId, "aria-label": "Account", onChange: (event) => updateLine(line.key, { accountId: event.target.value }), children: [_jsx("option", { value: "", children: "Select an account" }), accounts.map((account) => (_jsxs("option", { value: account.id, children: [account.code, " \u00B7 ", account.name] }, account.id)))] }) }), _jsx("td", { children: _jsx("input", { className: "input", value: line.description, "aria-label": "Line description", onChange: (event) => updateLine(line.key, { description: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "input align-right", type: "number", step: "0.01", min: "0", value: line.debit, "aria-label": "Debit", onChange: (event) => updateLine(line.key, { debit: event.target.value, credit: '' }) }) }), _jsx("td", { children: _jsx("input", { className: "input align-right", type: "number", step: "0.01", min: "0", value: line.credit, "aria-label": "Credit", onChange: (event) => updateLine(line.key, { credit: event.target.value, debit: '' }) }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": "Remove line", disabled: lines.length <= 2, onClick: () => setLines((current) => current.filter((row) => row.key !== line.key)), children: _jsx(Trash2, { size: 15 }) }) })] }, line.key))) })] }), _jsxs("div", { className: "row-between", children: [_jsx(Button, { size: "sm", icon: _jsx(Plus, { size: 14 }), onClick: () => setLines((current) => [...current, blankLine()]), children: "Add line" }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Total debit" }), _jsx("span", { className: "num", children: formatCurrency(totalDebit) })] }), _jsxs("div", { children: [_jsx("span", { children: "Total credit" }), _jsx("span", { className: "num", children: formatCurrency(totalCredit) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Difference" }), _jsx("span", { className: `num ${difference === 0 ? 'text-success' : 'text-danger'}`, children: formatCurrency(difference) })] })] })] }), canSubmit ? (_jsx(Badge, { tone: "success", children: "Balanced \u2014 ready to post" })) : (_jsx(Badge, { tone: "warning", children: filled.length < 2 ? 'Add at least two lines with an account and an amount' : 'Debits and credits must match before posting' })), _jsx(TextAreaField, { label: "Notes", rows: 2, value: notes, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) })] }) }));
}
