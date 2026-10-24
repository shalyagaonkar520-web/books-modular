/**
 * Quotes, sales orders, credit notes, purchase orders and vendor credits (one
 * shared document shape), plus refunds, advances, recurring profiles, the books
 * lock date and the cash-flow statement.
 */
import { api, downloadFile } from './client';
import type { DocumentLine, Message, Page } from './types';

type Query = Record<string, string | number | boolean | undefined | null>;

export type DocKindKey = 'estimate' | 'sales_order' | 'credit_note' | 'purchase_order' | 'vendor_credit';

export interface CreditApplication {
  id: string;
  date: string;
  amount: number;
  /** Null when the contact's advance was applied. */
  creditId?: string | null;
  creditNumber: string;
  documentId: string;
  documentNumber: string;
  createdAt: string;
}

export interface Refund {
  id: string;
  refundNumber: string;
  partyType: 'customer' | 'vendor';
  source: 'credit_note' | 'vendor_credit' | 'advance';
  contactId: string;
  contactName: string;
  creditNoteId?: string | null;
  creditNoteNumber?: string | null;
  vendorCreditId?: string | null;
  vendorCreditNumber?: string | null;
  bankAccountId: string;
  bankAccountName: string;
  date: string;
  amount: number;
  mode: string;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface FlowDocument {
  id: string;
  kind: DocKindKey;
  number: string;
  contactId: string;
  contactName: string;
  contactEmail?: string | null;
  contactGstin?: string | null;
  contactBillingAddress?: string | null;
  date: string;
  expiryDate?: string | null;
  shipmentDate?: string | null;
  deliveryDate?: string | null;
  status: string;
  reference?: string | null;
  subject?: string | null;
  salesperson?: string | null;
  reason?: string | null;
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  total: number;
  notes?: string | null;
  terms?: string | null;
  lines: DocumentLine[];
  estimateId?: string | null;
  estimateNumber?: string | null;
  salesOrderId?: string | null;
  salesOrderNumber?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  billId?: string | null;
  billNumber?: string | null;
  amountApplied?: number | null;
  amountRefunded?: number | null;
  balance?: number | null;
  applications: CreditApplication[];
  refunds: Refund[];
  createdAt: string;
  updatedAt: string;
}

export interface FlowDocumentListItem {
  id: string;
  kind: DocKindKey;
  number: string;
  contactId: string;
  contactName: string;
  date: string;
  expiryDate?: string | null;
  shipmentDate?: string | null;
  deliveryDate?: string | null;
  status: string;
  reference?: string | null;
  total: number;
  balance?: number | null;
  invoiceNumber?: string | null;
  billNumber?: string | null;
}

export interface ConversionResult {
  kind: 'invoice' | 'bill' | 'sales_order';
  id: string;
  number: string;
}

export interface RefundInput {
  bankAccountId: string;
  date: string;
  amount: number;
  mode: string;
  reference?: string | null;
  notes?: string | null;
}

const BASE: Record<DocKindKey, string> = {
  estimate: '/estimates',
  sales_order: '/sales-orders',
  credit_note: '/credit-notes',
  purchase_order: '/purchase-orders',
  vendor_credit: '/vendor-credits',
};

export function docApi(kind: DocKindKey) {
  const base = BASE[kind];
  return {
    list: (query?: Query, signal?: AbortSignal) => api.get<Page<FlowDocumentListItem>>(base, query, signal),
    get: (id: string) => api.get<FlowDocument>(`${base}/${id}`),
    create: (body: unknown) => api.post<FlowDocument>(base, body),
    update: (id: string, body: unknown) => api.put<FlowDocument>(`${base}/${id}`, body),
    remove: (id: string) => api.delete<Message>(`${base}/${id}`),
    setStatus: (id: string, status: string) => api.post<FlowDocument>(`${base}/${id}/status`, { status }),
    convert: (id: string, target: 'invoice' | 'bill' | 'sales-order', issue = false) =>
      api.post<ConversionResult>(`${base}/${id}/convert-to-${target}`, target === 'sales-order' ? undefined : { issue }),
    apply: (id: string, applications: Array<{ documentId: string; amount: number }>, date?: string) =>
      api.post<FlowDocument>(`${base}/${id}/apply`, { applications, date: date || null }),
    refund: (id: string, body: RefundInput) => api.post<Refund>(`${base}/${id}/refunds`, body),
    downloadPdf: (id: string, filename: string) => downloadFile(`${base}/${id}/pdf`, filename),
  };
}

export const refundsApi = {
  list: (query?: Query) => api.get<Page<Refund>>('/refunds', query),
  remove: (id: string) => api.delete<Message>(`/refunds/${id}`),
};

export const advancesApi = {
  balance: (partyType: 'customer' | 'vendor', contactId: string) =>
    api.get<{ contactId: string; partyType: string; balance: number }>('/advances/balance', { partyType, contactId }),
  apply: (body: { partyType: 'customer' | 'vendor'; contactId: string; documentId: string; amount: number; date?: string | null }) =>
    api.post<CreditApplication>('/advances/apply', body),
  refund: (body: RefundInput & { partyType: 'customer' | 'vendor'; contactId: string }) => api.post<Refund>('/advances/refund', body),
};

export const creditApplicationsApi = {
  list: (query: { invoiceId?: string; billId?: string }) => api.get<CreditApplication[]>('/credit-applications', query),
  remove: (id: string) => api.delete<Message>(`/credit-applications/${id}`),
};

// ---------------------------------------------------------------------------
// Recurring profiles
// ---------------------------------------------------------------------------
export type RecurringKind = 'invoice' | 'bill';
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface TemplateLine {
  itemId?: string | null;
  accountId?: string | null;
  description: string;
  quantity: number;
  rate: number;
  taxRate: number;
}

export interface RecurringTemplate {
  customerId?: string;
  vendorId?: string;
  reference?: string | null;
  subject?: string | null;
  discountAmount?: number;
  notes?: string | null;
  terms?: string | null;
  lines: TemplateLine[];
}

export interface RecurringProfile {
  id: string;
  name: string;
  kind: RecurringKind;
  contactId: string;
  contactName: string;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  endDate?: string | null;
  nextRunDate?: string | null;
  status: 'active' | 'paused' | 'stopped' | 'completed';
  autoIssue: boolean;
  template: RecurringTemplate;
  total: number;
  runsCount: number;
  lastRunDate?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocument {
  id: string;
  number: string;
  date: string;
  status: string;
  total: number;
}

export interface RecurringRunResult {
  created: GeneratedDocument[];
  errors: string[];
}

export const recurringApi = {
  list: (query?: Query, signal?: AbortSignal) => api.get<Page<RecurringProfile>>('/recurring-profiles', query, signal),
  get: (id: string) => api.get<RecurringProfile>(`/recurring-profiles/${id}`),
  documents: (id: string) => api.get<GeneratedDocument[]>(`/recurring-profiles/${id}/documents`),
  create: (body: unknown) => api.post<RecurringProfile>('/recurring-profiles', body),
  update: (id: string, body: unknown) => api.put<RecurringProfile>(`/recurring-profiles/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/recurring-profiles/${id}`),
  pause: (id: string) => api.post<RecurringProfile>(`/recurring-profiles/${id}/pause`),
  resume: (id: string) => api.post<RecurringProfile>(`/recurring-profiles/${id}/resume`),
  stop: (id: string) => api.post<RecurringProfile>(`/recurring-profiles/${id}/stop`),
  run: (id: string) => api.post<RecurringRunResult>(`/recurring-profiles/${id}/run`),
  runNow: (id: string) => api.post<GeneratedDocument>(`/recurring-profiles/${id}/run-now`),
  runDue: () => api.post<RecurringRunResult>('/recurring-profiles/run-due'),
};

// ---------------------------------------------------------------------------
// Books lock and cash flow
// ---------------------------------------------------------------------------
export const lockDateApi = {
  get: () => api.get<{ lockDate: string | null }>('/organization/lock-date'),
  set: (lockDate: string | null) => api.put<{ lockDate: string | null }>('/organization/lock-date', { lockDate }),
};

export interface CashFlowLine {
  label: string;
  accountId?: string | null;
  code?: string | null;
  amount: number;
}

export interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  total: number;
}

export interface CashFlowStatement {
  startDate: string;
  endDate: string;
  netIncome: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  openingCash: number;
  closingCash: number;
}

export const cashFlowApi = {
  get: (query?: Query) => api.get<CashFlowStatement>('/reports/cash-flow', query),
};
