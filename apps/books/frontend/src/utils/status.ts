/** Maps document statuses to badge tones and readable labels. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const DOCUMENT_TONES: Record<string, Tone> = {
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

const DOCUMENT_LABELS: Record<string, string> = {
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

export function statusTone(status: string): Tone {
  return DOCUMENT_TONES[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  return DOCUMENT_LABELS[status] ?? status.replace(/[_-]+/g, ' ');
}

export const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
] as const;

export const GST_TREATMENTS = [
  { value: 'registered_business', label: 'Registered business' },
  { value: 'unregistered', label: 'Unregistered' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'overseas', label: 'Overseas' },
  { value: 'sez', label: 'SEZ' },
] as const;

export const UNITS = ['pcs', 'kg', 'gm', 'ltr', 'box', 'set', 'hrs', 'day', 'month', 'project'] as const;

export const TAX_RATES = [0, 5, 12, 18, 28] as const;

/**
 * The standard GST slabs plus any extra rates in play (e.g. an organization's
 * configured default) so a select never holds a value it has no option for.
 */
export function taxRatesWith(...extra: Array<number | null | undefined>): number[] {
  const rates = new Set<number>(TAX_RATES);
  extra.forEach((rate) => {
    if (typeof rate === 'number' && Number.isFinite(rate)) rates.add(rate);
  });
  return [...rates].sort((a, b) => a - b);
}
