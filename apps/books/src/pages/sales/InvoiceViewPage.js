import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Read-only invoice detail with payment history and a print-friendly layout. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, IndianRupee, Pencil, Printer, Send, Trash2 } from 'lucide-react';
import { customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, formatQuantity } from '@/utils/format';
import { PAYMENT_MODES, statusLabel, statusTone } from '@/utils/status';
import { RecordPaymentModal } from './RecordPaymentModal';
const modeLabel = (mode) => PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode;
export function InvoiceViewPage() {
    const { invoiceId = '' } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { organization } = useAuth();
    const { submitting, error: actionError, run, reset } = useSubmit();
    const [pending, setPending] = useState(null);
    const [payingOpen, setPayingOpen] = useState(false);
    const invoice = useAsync(() => invoicesApi.get(invoiceId), [invoiceId]);
    const payments = useAsync(() => customerPaymentsApi.list({ invoice_id: invoiceId, page_size: 200 }), [invoiceId]);
    const data = invoice.data;
    const paymentContext = useMemo(() => (data ? { id: data.id, invoiceNumber: data.invoiceNumber, customerId: data.customerId, balanceDue: data.balanceDue } : undefined), [data]);
    const refresh = () => {
        invoice.reload();
        payments.reload();
    };
    const runPending = async () => {
        if (!pending || !data)
            return;
        if (pending.kind === 'deletePayment') {
            const result = await run(() => customerPaymentsApi.remove(pending.payment.id));
            if (result) {
                toast.success(result.message);
                setPending(null);
                refresh();
            }
            return;
        }
        const result = await run(() => invoicesApi.setStatus(data.id, pending.kind === 'send' ? 'sent' : 'void'));
        if (result) {
            toast.success(pending.kind === 'send' ? `Invoice ${data.invoiceNumber} marked as sent` : `Invoice ${data.invoiceNumber} voided`);
            setPending(null);
            refresh();
        }
    };
    const paymentColumns = [
        { key: 'paymentNumber', header: 'Payment #', render: (row) => _jsx("span", { className: "mono", children: row.paymentNumber }) },
        { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
        {
            key: 'mode',
            header: 'Mode',
            render: (row) => (_jsxs("span", { className: "cell-stack", children: [_jsx("span", { children: modeLabel(row.mode) }), _jsx("small", { children: row.bankAccountName })] })),
        },
        { key: 'reference', header: 'Reference', render: (row) => row.reference ?? '—' },
        { key: 'amount', header: 'Amount', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.amount) }) },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (_jsx(IfCanWrite, { children: _jsx("span", { className: "row-actions", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete payment ${row.paymentNumber}`, onClick: () => {
                            reset();
                            setPending({ kind: 'deletePayment', payment: row });
                        }, children: _jsx(Trash2, { size: 15 }) }) }) })),
        },
    ];
    if (invoice.loading)
        return _jsx(LoadingBlock, { label: "Loading invoice\u2026" });
    if (invoice.error || !data) {
        return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Invoice", actions: _jsx(Button, { icon: _jsx(ArrowLeft, { size: 15 }), onClick: () => navigate('/invoices'), children: "Back to invoices" }) }), _jsx(ErrorBlock, { message: invoice.error ?? 'This invoice could not be loaded.', onRetry: invoice.reload })] }));
    }
    const canEdit = data.status === 'draft' || ((data.status === 'sent' || data.status === 'overdue') && data.amountPaid === 0);
    const canPay = ['sent', 'partially_paid', 'overdue'].includes(data.status) && data.balanceDue > 0;
    const paymentRows = payments.data?.items ?? [];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: `Invoice ${data.invoiceNumber}`, subtitle: `${data.customerName} · ${formatCurrency(data.total)}`, breadcrumb: ['Sales', 'Invoices'], actions: _jsxs(_Fragment, { children: [_jsx(Button, { icon: _jsx(ArrowLeft, { size: 15 }), onClick: () => navigate('/invoices'), children: "Back to invoices" }), _jsx(Button, { icon: _jsx(Printer, { size: 15 }), onClick: () => window.print(), children: "Print" }), _jsx(IfCanWrite, { children: _jsxs(_Fragment, { children: [canEdit ? (_jsx(Button, { icon: _jsx(Pencil, { size: 15 }), onClick: () => navigate(`/invoices/${data.id}/edit`), children: "Edit" })) : null, data.status === 'draft' ? (_jsx(Button, { icon: _jsx(Send, { size: 15 }), onClick: () => {
                                            reset();
                                            setPending({ kind: 'send' });
                                        }, children: "Mark as sent" })) : null, canPay ? (_jsx(Button, { variant: "primary", icon: _jsx(IndianRupee, { size: 15 }), onClick: () => setPayingOpen(true), children: "Record payment" })) : null, data.status !== 'void' ? (_jsx(Button, { variant: "danger", icon: _jsx(Ban, { size: 15 }), onClick: () => {
                                            reset();
                                            setPending({ kind: 'void' });
                                        }, children: "Void" })) : null] }) })] }) }), _jsxs("div", { className: "stack printable", children: [_jsx(Card, { children: _jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "stack", children: [_jsxs("div", { children: [_jsx("h2", { className: "card-title", children: organization?.name ?? '—' }), organization?.address ? _jsx("p", { className: "text-muted small", children: organization.address }) : null, _jsx("p", { className: "text-muted small", children: [organization?.city, organization?.state, organization?.postalCode].filter(Boolean).join(', ') }), organization?.gstin ? _jsxs("p", { className: "text-muted small", children: ["GSTIN ", organization.gstin] }) : null] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Billed to" }), _jsx("p", { className: "strong", children: data.customerName }), data.customerBillingAddress ? _jsx("p", { className: "text-muted small", children: data.customerBillingAddress }) : null, data.customerGstin ? _jsxs("p", { className: "text-muted small", children: ["GSTIN ", data.customerGstin] }) : null, data.customerEmail ? _jsx("p", { className: "text-muted small", children: data.customerEmail }) : null] })] }), _jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Invoice number" }), _jsx("dd", { className: "strong", children: data.invoiceNumber })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Status" }), _jsx("dd", { children: _jsx(Badge, { tone: statusTone(data.status), children: statusLabel(data.status) }) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Invoice date" }), _jsx("dd", { children: formatDate(data.date) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Due date" }), _jsx("dd", { children: formatDate(data.dueDate) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Reference" }), _jsx("dd", { children: data.reference ?? '—' })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Balance due" }), _jsx("dd", { className: "num strong", children: formatCurrency(data.balanceDue) })] })] })] }) }), _jsxs(Card, { title: "Line items", children: [_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "#" }), _jsx("th", { scope: "col", children: "Description" }), _jsx("th", { scope: "col", className: "align-right", children: "Qty" }), _jsx("th", { scope: "col", className: "align-right", children: "Rate" }), _jsx("th", { scope: "col", className: "align-right", children: "Tax" }), _jsx("th", { scope: "col", className: "align-right", children: "Amount" })] }) }), _jsx("tbody", { children: data.lines.map((line, index) => (_jsxs("tr", { children: [_jsx("td", { className: "text-subtle", children: index + 1 }), _jsx("td", { children: _jsxs("span", { className: "cell-stack", children: [_jsx("span", { children: line.description }), line.itemName ? _jsx("small", { children: line.itemName }) : null] }) }), _jsx("td", { className: "align-right num", children: formatQuantity(line.quantity) }), _jsx("td", { className: "align-right num", children: formatCurrency(line.rate) }), _jsxs("td", { className: "align-right num", children: [formatPercent(line.taxRate), typeof line.taxAmount === 'number' ? _jsxs("small", { className: "text-subtle", children: [" (", formatCurrency(line.taxAmount), ")"] }) : null] }), _jsx("td", { className: "align-right num strong", children: formatCurrency(line.amount ?? line.quantity * line.rate) })] }, line.id ?? index))) })] }) }), _jsx("div", { className: "form-section", children: _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(data.subtotal) })] }), _jsxs("div", { children: [_jsx("span", { children: "Discount" }), _jsx("span", { children: data.discountAmount > 0 ? `- ${formatCurrency(data.discountAmount)}` : formatCurrency(0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Tax total" }), _jsx("span", { children: formatCurrency(data.taxTotal) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(data.total) })] }), _jsxs("div", { children: [_jsx("span", { children: "Amount paid" }), _jsx("span", { className: "text-success", children: formatCurrency(data.amountPaid) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Balance due" }), _jsx("span", { children: formatCurrency(data.balanceDue) })] })] }) })] }), data.notes || data.terms ? (_jsx(Card, { title: "Notes and terms", children: _jsxs("dl", { className: "detail-grid", children: [data.notes ? (_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Notes" }), _jsx("dd", { children: data.notes })] })) : null, data.terms ? (_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Terms" }), _jsx("dd", { children: data.terms })] })) : null] }) })) : null] }), _jsx("div", { className: "no-print", children: _jsx(Card, { title: "Payment history", subtitle: `${formatCurrency(data.amountPaid)} received against this invoice`, children: payments.loading ? (_jsx(SkeletonRows, { rows: 3, columns: 6 })) : payments.error ? (_jsx(ErrorBlock, { message: payments.error, onRetry: payments.reload })) : !paymentRows.length ? (_jsx(EmptyState, { title: "No payments recorded", description: "Payments you record against this invoice will appear here." })) : (_jsx(DataTable, { columns: paymentColumns, rows: paymentRows, rowKey: (row) => row.id, caption: "Payments received for this invoice" })) }) }), _jsx(RecordPaymentModal, { open: payingOpen, invoice: paymentContext, onClose: () => setPayingOpen(false), onSaved: refresh }), _jsx(ConfirmDialog, { open: !!pending, title: pending?.kind === 'send' ? 'Mark invoice as sent' : pending?.kind === 'void' ? 'Void invoice' : 'Delete payment', confirmLabel: pending?.kind === 'send' ? 'Mark as sent' : pending?.kind === 'void' ? 'Void invoice' : 'Delete payment', tone: pending?.kind === 'send' ? 'primary' : 'danger', busy: submitting, onCancel: () => setPending(null), onConfirm: runPending, message: _jsxs(_Fragment, { children: [_jsx(FormError, { message: actionError }), pending?.kind === 'send' ? (_jsxs("p", { children: ["Invoice ", data.invoiceNumber, " will be posted to your books and can no longer be deleted."] })) : pending?.kind === 'void' ? (_jsxs("p", { children: ["Voiding invoice ", data.invoiceNumber, " reverses its ledger entries. Recorded payments must be deleted first."] })) : pending?.kind === 'deletePayment' ? (_jsxs("p", { children: ["Payment ", pending.payment.paymentNumber, " of ", formatCurrency(pending.payment.amount), " will be deleted and its ledger entries reversed."] })) : null] }) })] }));
}
