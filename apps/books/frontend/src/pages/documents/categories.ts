/** Document categories accepted by the API. */
export const DOCUMENT_CATEGORIES = [
  'general',
  'invoice',
  'bill',
  'receipt',
  'contract',
  'tax',
  'bank_statement',
  'payroll',
  'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

const LABELS: Record<DocumentCategory, string> = {
  general: 'General',
  invoice: 'Invoice',
  bill: 'Bill',
  receipt: 'Receipt',
  contract: 'Contract',
  tax: 'Tax',
  bank_statement: 'Bank statement',
  payroll: 'Payroll',
  other: 'Other',
};

export function documentCategoryLabel(value: string): string {
  return LABELS[value as DocumentCategory] ?? value.replace(/[_-]+/g, ' ');
}

export const DOCUMENT_CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: LABELS[value] }));
