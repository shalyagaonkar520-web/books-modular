import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Customers and vendors share this page; every label follows the `type` prop. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { contactsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDateTime, formatNumber } from '@/utils/format';
import { GST_TREATMENTS } from '@/utils/status';
const PAGE_SIZE = 25;
const GST_OPTIONS = GST_TREATMENTS.map((treatment) => ({ value: treatment.value, label: treatment.label }));
function gstLabel(treatment) {
    return GST_TREATMENTS.find((option) => option.value === treatment)?.label ?? treatment;
}
function copyFor(type) {
    return type === 'customer'
        ? { plural: 'Customers', singular: 'customer', documentsLabel: 'invoices', documentsPath: '/invoices?customer=', invoicedLabel: 'Total invoiced' }
        : { plural: 'Vendors', singular: 'vendor', documentsLabel: 'bills', documentsPath: '/bills?vendor=', invoicedLabel: 'Total billed' };
}
function balanceTone(amount) {
    if (amount > 0)
        return 'num text-danger';
    if (amount < 0)
        return 'num text-success';
    return 'num text-muted';
}
export function ContactsPage({ type }) {
    const toast = useToast();
    const copy = copyFor(type);
    const { canWrite } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounced(search);
    const [includeInactive, setIncludeInactive] = useState(false);
    const [page, setPage] = useState(1);
    const [formOpen, setFormOpen] = useState(false);
    const [formContact, setFormContact] = useState(null);
    const [detailsId, setDetailsId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteSubmit = useSubmit();
    // Reset paging and filters when switching between customers and vendors.
    useEffect(() => {
        setSearch('');
        setIncludeInactive(false);
        setPage(1);
    }, [type]);
    const list = useAsync((signal) => contactsApi.list({
        type,
        search: debouncedSearch.trim() || undefined,
        include_inactive: includeInactive,
        page,
        page_size: PAGE_SIZE,
    }, signal), [type, debouncedSearch, includeInactive, page]);
    const rows = list.data?.items ?? [];
    const outstandingTotal = rows.reduce((sum, contact) => sum + contact.outstandingBalance, 0);
    const withBalance = rows.filter((contact) => contact.outstandingBalance > 0).length;
    function openCreate() {
        setFormContact(null);
        setFormOpen(true);
    }
    const wantsNew = canWrite && searchParams.get('new') === '1';
    useEffect(() => {
        if (wantsNew) {
            setFormContact(null);
            setFormOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wantsNew]);
    function closeForm() {
        setFormOpen(false);
        setFormContact(null);
        if (searchParams.has('new')) {
            const next = new URLSearchParams(searchParams);
            next.delete('new');
            setSearchParams(next, { replace: true });
        }
    }
    async function confirmDelete() {
        if (!deleteTarget)
            return;
        const result = await deleteSubmit.run(() => contactsApi.remove(deleteTarget.id));
        if (!result)
            return;
        if (result.message.toLowerCase().includes('inactive'))
            toast.notify(result.message, 'warning');
        else
            toast.success(result.message);
        setDeleteTarget(null);
        list.reload();
    }
    const columns = [
        {
            key: 'displayName',
            header: 'Name',
            render: (contact) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: contact.displayName }), contact.companyName ? _jsx("small", { className: "text-muted", children: contact.companyName }) : null, contact.isActive ? null : _jsx("small", { children: _jsx(Badge, { tone: "neutral", children: "Inactive" }) })] })),
        },
        { key: 'contactPerson', header: 'Contact person', render: (contact) => contact.contactPerson || _jsx("span", { className: "text-muted", children: "\u2014" }) },
        {
            key: 'email',
            header: 'Email',
            render: (contact) => (contact.email ? _jsx("a", { href: `mailto:${contact.email}`, onClick: (event) => event.stopPropagation(), children: contact.email }) : _jsx("span", { className: "text-muted", children: "\u2014" })),
        },
        { key: 'phone', header: 'Phone', render: (contact) => contact.phone || _jsx("span", { className: "text-muted", children: "\u2014" }) },
        { key: 'gstin', header: 'GSTIN', render: (contact) => (contact.gstin ? _jsx("span", { className: "code-tag", children: contact.gstin }) : _jsx("span", { className: "text-muted", children: "\u2014" })) },
        { key: 'paymentTermsDays', header: 'Terms', align: 'right', render: (contact) => _jsx("span", { className: "text-muted small", children: `${formatNumber(contact.paymentTermsDays, 0)} days` }) },
        {
            key: 'outstandingBalance',
            header: 'Outstanding',
            align: 'right',
            render: (contact) => _jsx("span", { className: balanceTone(contact.outstandingBalance), children: formatCurrency(contact.outstandingBalance) }),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (contact) => (_jsxs("div", { className: "row-actions", onClick: (event) => event.stopPropagation(), children: [_jsx(Link, { className: "action-btn", to: `${copy.documentsPath}${contact.id}`, "aria-label": `View ${copy.documentsLabel} for ${contact.displayName}`, children: _jsx(FileText, { size: 15 }) }), _jsxs(IfCanWrite, { children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit ${contact.displayName}`, onClick: () => {
                                    setFormContact(contact);
                                    setFormOpen(true);
                                }, children: _jsx(Pencil, { size: 15 }) }), _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete ${contact.displayName}`, onClick: () => setDeleteTarget(contact), children: _jsx(Trash2, { size: 15 }) })] })] })),
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: copy.plural, subtitle: type === 'customer'
                    ? 'Everyone you invoice, with their balances and payment terms.'
                    : 'Everyone you buy from, with their balances and payment terms.', actions: _jsx(IfCanWrite, { children: _jsxs(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: openCreate, children: ["New ", copy.singular] }) }) }), list.data ? (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: copy.plural, value: formatNumber(list.data.total, 0), sublabel: includeInactive ? 'Including inactive' : 'Active only', icon: _jsx(Users, { size: 16 }) }), _jsx(StatTile, { label: "Outstanding on this page", value: formatCurrency(outstandingTotal), sublabel: type === 'customer' ? 'Receivable from these customers' : 'Payable to these vendors', tone: outstandingTotal > 0 ? 'warning' : 'neutral' }), _jsx(StatTile, { label: "With a balance", value: formatNumber(withBalance, 0), sublabel: `of ${formatNumber(rows.length, 0)} shown` })] })) : null, _jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: (value) => {
                            setSearch(value);
                            setPage(1);
                        }, placeholder: `Search ${copy.plural.toLowerCase()}…`, label: `Search ${copy.plural.toLowerCase()}` }), _jsx(CheckboxField, { label: "Include inactive", checked: includeInactive, onChange: (event) => {
                            setIncludeInactive(event.target.checked);
                            setPage(1);
                        } })] }), _jsx("div", { className: "card", children: list.loading ? (_jsx("div", { className: "card-body", children: _jsx(SkeletonRows, { rows: 6, columns: 6 }) })) : list.error ? (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: list.error, onRetry: list.reload }) })) : !rows.length ? (_jsx("div", { className: "card-body", children: _jsx(EmptyState, { title: `No ${copy.plural.toLowerCase()} yet`, description: type === 'customer'
                            ? 'Add a customer to start raising invoices and tracking what you are owed.'
                            : 'Add a vendor to start recording bills and tracking what you owe.', icon: _jsx(Users, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsxs(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: openCreate, children: ["New ", copy.singular] }) }) }) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (contact) => contact.id, onRowClick: (contact) => setDetailsId(contact.id), caption: `${copy.plural} list` }), _jsx(Pagination, { page: page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage })] })) }), formOpen ? (_jsx(ContactFormModal, { type: type, contact: formContact, copy: copy, onClose: closeForm, onSaved: (message) => {
                    toast.success(message);
                    closeForm();
                    list.reload();
                } })) : null, detailsId ? (_jsx(ContactDetailsModal, { contactId: detailsId, copy: copy, onClose: () => setDetailsId(null), onEdit: (contact) => {
                    setDetailsId(null);
                    setFormContact(contact);
                    setFormOpen(true);
                } })) : null, _jsx(ConfirmDialog, { open: !!deleteTarget, title: `Delete ${copy.singular}`, message: deleteTarget
                    ? `Delete “${deleteTarget.displayName}”? If this ${copy.singular} has ${copy.documentsLabel} they will be deactivated instead of deleted.`
                    : '', confirmLabel: `Delete ${copy.singular}`, busy: deleteSubmit.submitting, onConfirm: confirmDelete, onCancel: () => {
                    setDeleteTarget(null);
                    deleteSubmit.reset();
                } })] }));
}
function initialForm(contact) {
    return {
        displayName: contact?.displayName ?? '',
        companyName: contact?.companyName ?? '',
        contactPerson: contact?.contactPerson ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        gstin: contact?.gstin ?? '',
        pan: contact?.pan ?? '',
        gstTreatment: contact?.gstTreatment ?? 'unregistered',
        paymentTermsDays: String(contact?.paymentTermsDays ?? 30),
        billingAddress: contact?.billingAddress ?? '',
        shippingAddress: contact?.shippingAddress ?? '',
        notes: contact?.notes ?? '',
    };
}
function ContactFormModal({ type, contact, copy, onClose, onSaved }) {
    const [form, setForm] = useState(() => initialForm(contact));
    const { submitting, error, fieldErrors, run } = useSubmit();
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    async function save() {
        const payload = {
            type,
            displayName: form.displayName.trim(),
            companyName: form.companyName.trim() || null,
            contactPerson: form.contactPerson.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            gstin: form.gstin.trim() || null,
            pan: form.pan.trim() || null,
            gstTreatment: form.gstTreatment,
            paymentTermsDays: Number.parseInt(form.paymentTermsDays, 10) || 0,
            billingAddress: form.billingAddress.trim() || null,
            shippingAddress: form.shippingAddress.trim() || null,
            notes: form.notes.trim() || null,
        };
        const result = await run(() => (contact ? contactsApi.update(contact.id, payload) : contactsApi.create(payload)));
        if (result)
            onSaved(contact ? `${result.displayName} updated` : `${result.displayName} added`);
    }
    return (_jsxs(Modal, { open: true, size: "lg", title: contact ? `Edit ${copy.singular}` : `New ${copy.singular}`, subtitle: contact ? contact.displayName : `Details used on ${copy.documentsLabel} and statements`, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", loading: submitting, onClick: save, children: contact ? 'Save changes' : `Create ${copy.singular}` })] }), children: [_jsx(FormError, { message: error }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Identity" }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Display name", required: true, value: form.displayName, error: fieldErrors.displayName, onChange: (event) => set('displayName', event.target.value) }), _jsx(TextField, { label: "Company name", value: form.companyName, error: fieldErrors.companyName, onChange: (event) => set('companyName', event.target.value) }), _jsx(TextField, { label: "Contact person", value: form.contactPerson, error: fieldErrors.contactPerson, onChange: (event) => set('contactPerson', event.target.value) }), _jsx(TextField, { label: "Email", type: "email", value: form.email, error: fieldErrors.email, onChange: (event) => set('email', event.target.value) }), _jsx(TextField, { label: "Phone", type: "tel", value: form.phone, error: fieldErrors.phone, onChange: (event) => set('phone', event.target.value) })] })] }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Tax and terms" }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "GSTIN", value: form.gstin, error: fieldErrors.gstin, onChange: (event) => set('gstin', event.target.value) }), _jsx(TextField, { label: "PAN", value: form.pan, error: fieldErrors.pan, onChange: (event) => set('pan', event.target.value) }), _jsx(SelectField, { label: "GST treatment", value: form.gstTreatment, options: GST_OPTIONS, error: fieldErrors.gstTreatment, onChange: (event) => set('gstTreatment', event.target.value) }), _jsx(TextField, { label: "Payment terms (days)", type: "number", min: "0", max: "365", value: form.paymentTermsDays, error: fieldErrors.paymentTermsDays, onChange: (event) => set('paymentTermsDays', event.target.value) })] })] }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Addresses" }), _jsxs("div", { className: "form-grid", children: [_jsx(TextAreaField, { label: "Billing address", value: form.billingAddress, error: fieldErrors.billingAddress, onChange: (event) => set('billingAddress', event.target.value) }), _jsx(TextAreaField, { label: "Shipping address", value: form.shippingAddress, error: fieldErrors.shippingAddress, onChange: (event) => set('shippingAddress', event.target.value) })] }), _jsx(TextAreaField, { label: "Notes", rows: 2, value: form.notes, error: fieldErrors.notes, onChange: (event) => set('notes', event.target.value) })] })] }));
}
function Detail({ label, value }) {
    return (_jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: label }), _jsx("span", { className: "detail-value", children: value })] }));
}
function ContactDetailsModal({ contactId, copy, onClose, onEdit }) {
    const summary = useAsync(() => contactsApi.summary(contactId), [contactId]);
    const contact = summary.data?.contact ?? null;
    const dash = _jsx("span", { className: "text-muted", children: "\u2014" });
    const overdueTone = summary.data && summary.data.overdue > 0 ? 'danger' : 'success';
    return (_jsx(Modal, { open: true, size: "lg", title: contact?.displayName ?? copy.plural, subtitle: contact?.companyName ?? undefined, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Link, { className: "btn btn-secondary btn-md", to: `${copy.documentsPath}${contactId}`, children: _jsxs("span", { children: ["View ", copy.documentsLabel] }) }), contact ? (_jsx(IfCanWrite, { children: _jsxs(Button, { variant: "primary", icon: _jsx(Pencil, { size: 15 }), onClick: () => onEdit(contact), children: ["Edit ", copy.singular] }) })) : null] }), children: summary.loading ? (_jsx(SkeletonRows, { rows: 4, columns: 3 })) : summary.error || !summary.data || !contact ? (_jsx(ErrorBlock, { message: summary.error ?? 'This contact could not be loaded.', onRetry: summary.reload })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: copy.invoicedLabel, value: formatCurrency(summary.data.totalInvoiced), sublabel: `${formatNumber(summary.data.documentCount, 0)} ${copy.documentsLabel}` }), _jsx(StatTile, { label: "Total paid", value: formatCurrency(summary.data.totalPaid), tone: "positive" }), _jsx(StatTile, { label: "Outstanding", value: formatCurrency(summary.data.outstanding), tone: summary.data.outstanding > 0 ? 'warning' : 'neutral' }), _jsx(StatTile, { label: "Overdue", value: formatCurrency(summary.data.overdue), tone: summary.data.overdue > 0 ? 'negative' : 'neutral' })] }), _jsxs("div", { className: "detail-grid", children: [_jsx(Detail, { label: "Status", value: _jsx(Badge, { tone: contact.isActive ? 'success' : 'neutral', children: contact.isActive ? 'Active' : 'Inactive' }) }), _jsx(Detail, { label: "Overdue", value: _jsx(Badge, { tone: overdueTone, children: formatCurrency(summary.data.overdue) }) }), _jsx(Detail, { label: "Contact person", value: contact.contactPerson || dash }), _jsx(Detail, { label: "Email", value: contact.email ? _jsx("a", { href: `mailto:${contact.email}`, children: contact.email }) : dash }), _jsx(Detail, { label: "Phone", value: contact.phone || dash }), _jsx(Detail, { label: "GSTIN", value: contact.gstin ? _jsx("span", { className: "code-tag", children: contact.gstin }) : dash }), _jsx(Detail, { label: "PAN", value: contact.pan ? _jsx("span", { className: "code-tag", children: contact.pan }) : dash }), _jsx(Detail, { label: "GST treatment", value: gstLabel(contact.gstTreatment) }), _jsx(Detail, { label: "Payment terms", value: `${formatNumber(contact.paymentTermsDays, 0)} days` }), _jsx(Detail, { label: "Billing address", value: contact.billingAddress || dash }), _jsx(Detail, { label: "Shipping address", value: contact.shippingAddress || dash }), _jsx(Detail, { label: "Notes", value: contact.notes || dash }), _jsx(Detail, { label: "Created", value: formatDateTime(contact.createdAt) }), _jsx(Detail, { label: "Last updated", value: formatDateTime(contact.updatedAt) })] }), _jsx("p", { className: "small text-muted", children: _jsxs(Link, { className: "text-primary", to: `${copy.documentsPath}${contact.id}`, children: ["Open all ", copy.documentsLabel, " for ", contact.displayName] }) })] })) }));
}
