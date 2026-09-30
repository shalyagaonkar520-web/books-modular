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

/**
 * The app-content translator (`t` from useAppContent). Passing it makes a label
 * editable by the super admin; without it the built-in English label is used.
 */
export type Translate = (key: string) => string;

function translated(t: Translate | undefined, key: string, fallback: string): string {
  if (!t) return fallback;
  const text = t(key);
  return text && text !== key ? text : fallback;
}

export function statusTone(status: string): Tone {
  return DOCUMENT_TONES[status] ?? 'neutral';
}

export function statusLabel(status: string, t?: Translate): string {
  return translated(t, `common.status.${status}`, DOCUMENT_LABELS[status] ?? status.replace(/[_-]+/g, ' '));
}

export const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank transfer', labelKey: 'common.paymentMode.bank_transfer' },
  { value: 'upi', label: 'UPI', labelKey: 'common.paymentMode.upi' },
  { value: 'cash', label: 'Cash', labelKey: 'common.paymentMode.cash' },
  { value: 'cheque', label: 'Cheque', labelKey: 'common.paymentMode.cheque' },
  { value: 'card', label: 'Card', labelKey: 'common.paymentMode.card' },
  { value: 'other', label: 'Other', labelKey: 'common.paymentMode.other' },
] as const;

export const GST_TREATMENTS = [
  { value: 'registered_business', label: 'Registered business', labelKey: 'common.gstTreatment.registered_business' },
  { value: 'unregistered', label: 'Unregistered', labelKey: 'common.gstTreatment.unregistered' },
  { value: 'consumer', label: 'Consumer', labelKey: 'common.gstTreatment.consumer' },
  { value: 'overseas', label: 'Overseas', labelKey: 'common.gstTreatment.overseas' },
  { value: 'sez', label: 'SEZ', labelKey: 'common.gstTreatment.sez' },
] as const;

/** Readable (and, given `t`, admin-editable) label for a payment mode value. */
export function paymentModeLabel(mode: string, t?: Translate): string {
  const option = PAYMENT_MODES.find((entry) => entry.value === mode);
  return option ? translated(t, option.labelKey, option.label) : mode;
}

/** Readable (and, given `t`, admin-editable) label for a GST treatment value. */
export function gstTreatmentLabel(treatment: string, t?: Translate): string {
  const option = GST_TREATMENTS.find((entry) => entry.value === treatment);
  return option ? translated(t, option.labelKey, option.label) : treatment;
}

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
