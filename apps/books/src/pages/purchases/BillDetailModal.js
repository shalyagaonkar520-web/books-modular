import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';
import { billsApi, vendorPaymentsApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { daysBetween, formatCurrency, formatDate, formatPercent, formatQuantity, titleCase, todayIso } from '@/utils/format';
import { PAYMENT_MODES, statusLabel, statusTone } from '@/utils/status';
/** Whole days a still-unpaid document is past its due date. */
export function overdueDays(bill) {
    if (bill.status !== 'overdue')
        return 0;
    return Math.max(0, daysBetween(bill.dueDate, todayIso()));
}
export function BillDetailModal({ billId, canWrite, onClose, onChanged, onRecordPayment }) {
    const toast = useToast();
    const remove = useSubmit();
    const [pendingPayment, setPendingPayment] = useState(null);
    const detail = useAsync(async () => {
        const [bill, payments] = await Promise.all([billsApi.get(billId), vendorPaymentsApi.list({ bill_id: billId, page_size: 200 })]);
        return { bill, payments: payments.items };
    }, [billId]);
    const bill = detail.data?.bill ?? null;
    const deletePayment = async (payment) => {
        const result = await remove.run(() => vendorPaymentsApi.remove(payment.id));
        if (result) {
            toast.success(`Payment ${payment.paymentNumber} deleted`);
            setPendingPayment(null);
            detail.reload();
            onChanged();
        }
    };
    return (_jsx(Modal, { open: true, title: bill ? `Bill ${bill.billNumber}` : 'Bill', subtitle: bill ? `${bill.vendorName} · ${statusLabel(bill.status)}` : undefined, size: "lg", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, children: "Close" }), canWrite && bill && bill.balanceDue > 0 && ['open', 'partially_paid', 'overdue'].includes(bill.status) ? (_jsx(Button, { variant: "primary", icon: _jsx(Wallet, { size: 15 }), onClick: () => onRecordPayment({ id: bill.id, billNumber: bill.billNumber, vendorId: bill.vendorId, vendorName: bill.vendorName, balanceDue: bill.balanceDue }), children: "Record payment" })) : null] }), children: detail.loading ? (_jsx(LoadingBlock, { label: "Loading bill\u2026" })) : detail.error || !bill ? (_jsx(ErrorBlock, { message: detail.error ?? 'This bill could not be loaded.', onRetry: detail.reload })) : (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Vendor" }), _jsx("div", { className: "detail-value strong", children: bill.vendorName }), _jsxs("div", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Vendor bill number" }), _jsx("span", { className: "detail-value", children: bill.vendorBillNumber || '—' })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Bill date" }), _jsx("span", { className: "detail-value", children: formatDate(bill.date) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Due date" }), _jsxs("span", { className: "detail-value", children: [formatDate(bill.dueDate), overdueDays(bill) > 0 ? _jsxs("span", { className: "text-danger", children: [" \u00B7 ", overdueDays(bill), " days overdue"] }) : null] })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Status" }), _jsx("span", { className: "detail-value", children: _jsx(Badge, { tone: statusTone(bill.status), children: statusLabel(bill.status) }) })] })] })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Line items" }), _jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Description" }), _jsx("th", { children: "Account / item" }), _jsx("th", { className: "align-right", children: "Qty" }), _jsx("th", { className: "align-right", children: "Rate" }), _jsx("th", { className: "align-right", children: "Tax" }), _jsx("th", { className: "align-right", children: "Amount" })] }) }), _jsx("tbody", { children: bill.lines.map((line, index) => (_jsxs("tr", { children: [_jsx("td", { children: line.description }), _jsx("td", { className: "text-muted", children: line.itemName || line.accountName || '—' }), _jsx("td", { className: "align-right num", children: formatQuantity(line.quantity) }), _jsx("td", { className: "align-right num", children: formatCurrency(line.rate) }), _jsx("td", { className: "align-right num", children: formatPercent(line.taxRate) }), _jsx("td", { className: "align-right num", children: formatCurrency(line.amount ?? 0) })] }, line.id ?? index))) })] })] }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(bill.subtotal) })] }), _jsxs("div", { children: [_jsx("span", { children: "Discount" }), _jsxs("span", { children: ["-", formatCurrency(bill.discountAmount)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Tax total" }), _jsx("span", { children: formatCurrency(bill.taxTotal) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(bill.total) })] }), _jsxs("div", { children: [_jsx("span", { children: "Amount paid" }), _jsx("span", { children: formatCurrency(bill.amountPaid) })] }), _jsxs("div", { children: [_jsx("span", { className: "strong", children: "Balance due" }), _jsx("span", { className: "strong", children: formatCurrency(bill.balanceDue) })] })] }), bill.notes ? (_jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Notes" }), _jsx("p", { className: "text-muted", children: bill.notes })] })) : null, _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Payment history" }), _jsx(FormError, { message: remove.error }), detail.data && detail.data.payments.length === 0 ? (_jsx("p", { className: "text-subtle small", children: "No payments recorded against this bill yet." })) : (_jsxs("table", { className: "line-items-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Payment #" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Paid through" }), _jsx("th", { children: "Mode" }), _jsx("th", { children: "Reference" }), _jsx("th", { className: "align-right", children: "Amount" }), canWrite ? _jsx("th", { className: "align-right", children: "Actions" }) : null] }) }), _jsx("tbody", { children: (detail.data?.payments ?? []).map((payment) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("span", { className: "code-tag", children: payment.paymentNumber }) }), _jsx("td", { children: formatDate(payment.date) }), _jsx("td", { children: payment.bankAccountName }), _jsx("td", { children: PAYMENT_MODES.find((option) => option.value === payment.mode)?.label ?? titleCase(payment.mode) }), _jsx("td", { className: "text-muted", children: payment.reference || '—' }), _jsx("td", { className: "align-right num", children: formatCurrency(payment.amount) }), canWrite ? (_jsx("td", { className: "align-right", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete payment ${payment.paymentNumber}`, onClick: () => setPendingPayment(payment), children: _jsx(Trash2, { size: 15 }) }) })) : null] }, payment.id))) })] }))] }), _jsx(ConfirmDialog, { open: pendingPayment !== null, title: "Delete this payment?", confirmLabel: "Delete payment", busy: remove.submitting, message: _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Payment ", pendingPayment?.paymentNumber, " of ", formatCurrency(pendingPayment?.amount ?? 0), " will be deleted, the bank transaction removed and the bill balance restored."] }), _jsx(FormError, { message: remove.error })] }), onCancel: () => {
                        setPendingPayment(null);
                        remove.reset();
                    }, onConfirm: () => {
                        if (pendingPayment)
                            void deletePayment(pendingPayment);
                    } })] })) }));
}
