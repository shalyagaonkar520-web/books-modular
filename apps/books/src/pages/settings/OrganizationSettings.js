import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];
function toForm(org) {
    return {
        name: org.name,
        legalName: org.legalName ?? '',
        gstin: org.gstin ?? '',
        pan: org.pan ?? '',
        email: org.email ?? '',
        phone: org.phone ?? '',
        address: org.address ?? '',
        city: org.city ?? '',
        state: org.state ?? '',
        postalCode: org.postalCode ?? '',
        country: org.country,
        fiscalYearStartMonth: String(org.fiscalYearStartMonth),
        invoiceTerms: org.invoiceTerms ?? '',
        invoiceNotes: org.invoiceNotes ?? '',
    };
}
export function OrganizationSettings() {
    const toast = useToast();
    const { refreshOrganization } = useAuth();
    const { submitting, error, fieldErrors, run } = useSubmit();
    const { data, loading, error: loadError, reload, setData } = useAsync(() => orgApi.get(), []);
    const [form, setForm] = useState(null);
    useEffect(() => {
        if (data)
            setForm(toForm(data));
    }, [data]);
    const set = (key) => (event) => setForm((current) => (current ? { ...current, [key]: event.target.value } : current));
    if (loading)
        return _jsx(LoadingBlock, { label: "Loading organization profile\u2026" });
    if (loadError)
        return _jsx(ErrorBlock, { message: loadError, onRetry: reload });
    if (!data || !form)
        return null;
    const save = async () => {
        const body = {
            name: form.name.trim(),
            legalName: form.legalName.trim() || null,
            gstin: form.gstin.trim().toUpperCase() || null,
            pan: form.pan.trim().toUpperCase() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            postalCode: form.postalCode.trim() || null,
            country: form.country.trim() || 'India',
            fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
            invoiceTerms: form.invoiceTerms.trim() || null,
            invoiceNotes: form.invoiceNotes.trim() || null,
        };
        const saved = await run(() => orgApi.update(body));
        if (saved) {
            setData(saved);
            await refreshOrganization();
            toast.success('Organization profile saved.');
        }
    };
    return (_jsx(Card, { title: "Organization profile", subtitle: "These details appear on invoices, bills and payslips", footer: _jsxs("div", { className: "row-between", children: [_jsxs("span", { className: "text-muted small", children: ["Base currency: ", data.currency] }), _jsx(Button, { variant: "primary", onClick: save, loading: submitting, disabled: form.name.trim().length < 2, children: "Save changes" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Display name", value: form.name, onChange: set('name'), error: fieldErrors.name, required: true, maxLength: 200 }), _jsx(TextField, { label: "Legal name", value: form.legalName, onChange: set('legalName'), error: fieldErrors.legalName }), _jsx(TextField, { label: "GSTIN", value: form.gstin, onChange: set('gstin'), error: fieldErrors.gstin, maxLength: 20 }), _jsx(TextField, { label: "PAN", value: form.pan, onChange: set('pan'), error: fieldErrors.pan, maxLength: 20 }), _jsx(TextField, { label: "Email", type: "email", value: form.email, onChange: set('email'), error: fieldErrors.email }), _jsx(TextField, { label: "Phone", value: form.phone, onChange: set('phone'), error: fieldErrors.phone })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Registered address" }), _jsx(TextAreaField, { label: "Address", value: form.address, rows: 2, onChange: set('address'), error: fieldErrors.address }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "City", value: form.city, onChange: set('city'), error: fieldErrors.city }), _jsx(TextField, { label: "State", value: form.state, onChange: set('state'), error: fieldErrors.state }), _jsx(TextField, { label: "Postal code", value: form.postalCode, onChange: set('postalCode'), error: fieldErrors.postalCode }), _jsx(TextField, { label: "Country", value: form.country, onChange: set('country'), error: fieldErrors.country })] })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Accounting and invoicing defaults" }), _jsx("div", { className: "form-grid", children: _jsx(SelectField, { label: "Fiscal year starts in", value: form.fiscalYearStartMonth, options: MONTHS.map((label, index) => ({ value: String(index + 1), label })), onChange: set('fiscalYearStartMonth'), error: fieldErrors.fiscalYearStartMonth, hint: "Used for fiscal-year reports and the dashboard" }) }), _jsx(TextAreaField, { label: "Default invoice terms", value: form.invoiceTerms, rows: 3, onChange: set('invoiceTerms'), error: fieldErrors.invoiceTerms }), _jsx(TextAreaField, { label: "Default invoice notes", value: form.invoiceNotes, rows: 3, onChange: set('invoiceNotes'), error: fieldErrors.invoiceNotes })] })] }) }));
}
