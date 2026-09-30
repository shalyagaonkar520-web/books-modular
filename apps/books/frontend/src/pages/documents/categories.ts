import type { AppContentValue } from '@/app/AppContentContext';

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

type Translate = AppContentValue['t'];

/** Content keys for each category's label (see content/appContentDefault.json). */
const LABEL_KEYS: Record<DocumentCategory, string> = {
  general: 'documents.category.general',
  invoice: 'documents.category.invoice',
  bill: 'documents.category.bill',
  receipt: 'documents.category.receipt',
  contract: 'documents.category.contract',
  tax: 'documents.category.tax',
  bank_statement: 'documents.category.bankStatement',
  payroll: 'documents.category.payroll',
  other: 'documents.category.other',
};

export function documentCategoryLabel(value: string, t: Translate): string {
  const key = LABEL_KEYS[value as DocumentCategory];
  return key ? t(key) : value.replace(/[_-]+/g, ' ');
}

export function documentCategoryOptions(t: Translate) {
  return DOCUMENT_CATEGORIES.map((value) => ({ value, label: t(LABEL_KEYS[value]) }));
}
