/** Badge tones for the Razorpay payments module. */
import type { Tone } from '@/utils/status';

const PAYMENT_STATUS_TONES: Record<string, Tone> = {
  captured: 'success',
  processed: 'success',
  authorized: 'info',
  created: 'neutral',
  pending: 'warning',
  partially_refunded: 'warning',
  refunded: 'warning',
  failed: 'danger',
};

const RECONCILIATION_TONES: Record<string, Tone> = {
  matched: 'success',
  partially_matched: 'info',
  needs_review: 'warning',
  unmatched: 'neutral',
  ignored: 'neutral',
};

const CATEGORY_TONES: Record<string, Tone> = {
  customer_payment: 'success',
  gateway_fee: 'info',
  refund: 'warning',
  other_income: 'info',
  failed_payment: 'danger',
  uncategorized: 'neutral',
};

export function statusToneFor(status: string): Tone {
  return PAYMENT_STATUS_TONES[status] ?? 'neutral';
}

export function reconciliationTone(status: string): Tone {
  return RECONCILIATION_TONES[status] ?? 'neutral';
}

export function categoryTone(category: string): Tone {
  return CATEGORY_TONES[category] ?? 'neutral';
}

export const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'captured', label: 'Captured' },
  { value: 'authorized', label: 'Authorized' },
  { value: 'created', label: 'Created' },
  { value: 'partially_refunded', label: 'Partially refunded' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'All methods' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Netbanking' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'emi', label: 'EMI' },
  { value: 'other', label: 'Other' },
];

export const RECONCILIATION_OPTIONS = [
  { value: '', label: 'All reconciliation states' },
  { value: 'matched', label: 'Matched' },
  { value: 'partially_matched', label: 'Partially matched' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'ignored', label: 'Ignored' },
];
