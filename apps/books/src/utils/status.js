const DOCUMENT_TONES = {
    draft: 'neutral',
    sent: 'info',
    open: 'info',
    partially_paid: 'warning',
    paid: 'success',
    void: 'neutral',
    overdue: 'danger',
    approved: 'info',
    active: 'success',
    completed: 'neutral',
    on_hold: 'warning',
};
const DOCUMENT_LABELS = {
    draft: 'Draft',
    sent: 'Sent',
    open: 'Open',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    void: 'Void',
    overdue: 'Overdue',
    approved: 'Approved',
    active: 'Active',
    completed: 'Completed',
    on_hold: 'On hold',
};
export function statusTone(status) {
    return DOCUMENT_TONES[status] ?? 'neutral';
}
export function statusLabel(status) {
    return DOCUMENT_LABELS[status] ?? status.replace(/[_-]+/g, ' ');
}
export const PAYMENT_MODES = [
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'upi', label: 'UPI' },
    { value: 'cash', label: 'Cash' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' },
];
export const GST_TREATMENTS = [
    { value: 'registered_business', label: 'Registered business' },
    { value: 'unregistered', label: 'Unregistered' },
    { value: 'consumer', label: 'Consumer' },
    { value: 'overseas', label: 'Overseas' },
    { value: 'sez', label: 'SEZ' },
];
export const UNITS = ['pcs', 'kg', 'gm', 'ltr', 'box', 'set', 'hrs', 'day', 'month', 'project'];
export const TAX_RATES = [0, 5, 12, 18, 28];
