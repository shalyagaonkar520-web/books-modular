/** Insights (alerts, credit risk, digest), what-if cash planning, reminder drafts, WhatsApp and Tally. */
import { api, downloadFile, request } from './client';
import type { CashForecast } from './ai';

export interface Alert {
  kind: 'duplicate_bill' | 'unusual_amount' | 'missing_gstin' | 'negative_cash' | 'stale_drafts' | string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  docType?: string | null;
  docId?: string | null;
  amount?: number | null;
}

export interface CreditRisk {
  customerId: string;
  customerName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  outstanding: number;
  overdue: number;
  maxDaysOverdue: number;
  averageDaysLate?: number | null;
  invoicesPaid: number;
  onTimePercent?: number | null;
  advice: string;
  reasons: string[];
}

export interface Digest {
  date: string;
  headline?: string | null;
  lines: string[];
}

export const insightsApi = {
  anomalies: () => api.get<Alert[]>('/insights/anomalies'),
  creditRisk: () => api.get<CreditRisk[]>('/insights/credit-risk'),
  digest: (withAi = false) => api.get<Digest>('/insights/digest', withAi ? { withAi: true } : undefined),
};

export interface Scenario {
  weeks: number;
  collectionDelayDays: number;
  collectionRate: number;
  paymentDelayDays: number;
  extraMonthlyIncome: number;
  extraMonthlyExpense: number;
  spendChangePercent: number;
  oneOffs: Array<{ date: string; amount: number; type: 'inflow' | 'outflow'; label: string }>;
}

export interface WhatIf {
  baseline: CashForecast & { firstNegativeWeek?: string | null };
  scenario: CashForecast & { firstNegativeWeek?: string | null };
  differenceAtEnd: number;
  summary: string;
}

export const planningApi = {
  whatIf: (scenario: Scenario) => api.post<WhatIf>('/ai/cash-forecast/what-if', scenario),
};

export interface ReminderDraft {
  subject: string;
  body: string;
  source: 'ai' | 'template';
  toEmail?: string | null;
}

export const remindersApi = {
  draft: (invoiceId: string, tone: 'friendly' | 'firm' | 'final') => api.post<ReminderDraft>('/ai/reminder-draft', { invoiceId, tone }),
};

export const whatsappApi = {
  status: () => api.get<{ configured: boolean; template?: string | null }>('/integrations/whatsapp/status'),
  sendInvoice: (invoiceId: string, body: { toPhone?: string | null; kind: 'invoice' | 'reminder'; message?: string | null }) =>
    api.post<{ messageId: string; to: string; text: string }>(`/integrations/whatsapp/invoices/${invoiceId}`, body),
};

export interface TallyImportResult {
  accountsCreated: number;
  customersCreated: number;
  vendorsCreated: number;
  skipped: number;
  errors: string[];
}

export const tallyApi = {
  export: (startDate: string, endDate: string) =>
    downloadFile(`/integrations/tally/export?startDate=${startDate}&endDate=${endDate}`, `tally_${startDate}_${endDate}.xml`),
  importLedgers: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<TallyImportResult>('/integrations/tally/import-ledgers', { method: 'POST', formData: form });
  },
};
