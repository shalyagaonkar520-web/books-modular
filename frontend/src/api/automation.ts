/** Custom fields, workflow rules, approvals, document branding, scheduled reports and share links. */
import { api, request } from './client';
import type { Message } from './types';

export type CustomFieldEntity = 'invoice' | 'bill' | 'estimate' | 'sales_order' | 'purchase_order' | 'credit_note' | 'vendor_credit' | 'contact' | 'item' | 'expense';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export interface CustomField {
  id: string;
  key: string;
  entity: CustomFieldEntity;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  showOnPdf: boolean;
  position: number;
  isActive: boolean;
}

export const customFieldsApi = {
  list: (entity?: CustomFieldEntity) => api.get<CustomField[]>('/custom-fields', entity ? { entity } : undefined),
  create: (body: unknown) => api.post<CustomField>('/custom-fields', body),
  update: (id: string, body: unknown) => api.put<CustomField>(`/custom-fields/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/custom-fields/${id}`),
  values: (entity: CustomFieldEntity, id: string) => api.get<{ values: Record<string, string> }>(`/custom-fields/values/${entity}/${id}`),
  saveValues: (entity: CustomFieldEntity, id: string, values: Record<string, string>) =>
    api.put<{ values: Record<string, string> }>(`/custom-fields/values/${entity}/${id}`, { values }),
};

export interface WorkflowCondition {
  field: string;
  operator: string;
  value?: string | null;
}

export interface WorkflowAction {
  type: 'email' | 'webhook';
  to?: string | null;
  subject?: string | null;
  message?: string | null;
  url?: string | null;
}

export interface WorkflowRule {
  id: string;
  name: string;
  event: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
  runCount: number;
  lastRunAt?: string | null;
}

export interface WorkflowRun {
  id: string;
  event: string;
  entityType: string;
  entityId?: string | null;
  status: string;
  attempts: number;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

export const workflowsApi = {
  meta: () => api.get<{ events: string[]; fields: Record<string, string[]>; operators: string[] }>('/workflow-rules/meta'),
  list: () => api.get<WorkflowRule[]>('/workflow-rules'),
  create: (body: unknown) => api.post<WorkflowRule>('/workflow-rules', body),
  update: (id: string, body: unknown) => api.put<WorkflowRule>(`/workflow-rules/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/workflow-rules/${id}`),
  runs: (id: string) => api.get<WorkflowRun[]>(`/workflow-rules/${id}/runs`),
  process: () => api.post<Message>('/workflow-rules/process'),
};

export interface PendingApproval {
  kind: 'invoice' | 'bill';
  id: string;
  number: string;
  contactName: string;
  date: string;
  total: number;
  requestedAt?: string | null;
}

export const approvalsApi = {
  settings: () => api.get<{ invoiceThreshold?: number | null; billThreshold?: number | null }>('/approvals/settings'),
  saveSettings: (body: { invoiceThreshold: number | null; billThreshold: number | null }) => api.put<{ invoiceThreshold?: number | null; billThreshold?: number | null }>('/approvals/settings', body),
  pending: () => api.get<PendingApproval[]>('/approvals/pending'),
  submit: (kind: 'invoice' | 'bill', id: string) => api.post<Message>(`/approvals/${kind}/${id}/submit`),
  approve: (kind: 'invoice' | 'bill', id: string, note?: string) => api.post<Message>(`/approvals/${kind}/${id}/approve`, { note: note || null }),
  reject: (kind: 'invoice' | 'bill', id: string, note?: string) => api.post<Message>(`/approvals/${kind}/${id}/reject`, { note: note || null }),
};

export interface Branding {
  brandColor?: string | null;
  logoUrl?: string | null;
  documentFooter?: string | null;
  signatureLabel?: string | null;
}

export const brandingApi = {
  get: () => api.get<Branding>('/document-branding'),
  save: (body: Branding) => api.put<Branding>('/document-branding', body),
};

export type ScheduledReport = 'profit_and_loss' | 'balance_sheet' | 'receivables' | 'payables' | 'cash_flow' | 'gstr3b' | 'digest';

export interface ReportSchedule {
  id: string;
  name: string;
  report: ScheduledReport;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  isActive: boolean;
  nextRunDate?: string | null;
  lastSentAt?: string | null;
}

export const schedulesApi = {
  list: () => api.get<ReportSchedule[]>('/report-schedules'),
  create: (body: unknown) => api.post<ReportSchedule>('/report-schedules', body),
  update: (id: string, body: unknown) => api.put<ReportSchedule>(`/report-schedules/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/report-schedules/${id}`),
  sendNow: (id: string) => api.post<Message>(`/report-schedules/${id}/send-now`),
  preview: (report: ScheduledReport, frequency: 'daily' | 'weekly' | 'monthly') =>
    api.get<{ title: string; start: string; end: string; lines: string[] }>('/report-schedules/preview', { report, frequency }),
};

export const shareApi = {
  create: (kind: 'invoice' | 'estimate', id: string) => api.post<{ token: string; path: string }>(`/share/${kind}/${id}`),
  revoke: (kind: 'invoice' | 'estimate', id: string) => api.delete<Message>(`/share/${kind}/${id}`),
};

export interface PortalDocument {
  kind: 'invoice' | 'estimate';
  number: string;
  status: string;
  date: string;
  dueDate?: string | null;
  expiryDate?: string | null;
  organizationName: string;
  organizationGstin?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  customerName: string;
  currency: string;
  subtotal: number;
  discount: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string | null;
  terms?: string | null;
  lines: Array<{ description: string; quantity: number; rate: number; taxRate: number; amount: number }>;
  canRespond: boolean;
  /** UPI payment link (unpaid INR invoice, organization has a UPI ID). */
  upiUri?: string | null;
}

/** The public portal calls need no session. */
export const portalApi = {
  get: (token: string) => request<PortalDocument>(`/public/documents/${token}`, { method: 'GET', retryOnUnauthorized: false }),
  respond: (token: string, accept: boolean, body: { name?: string; note?: string }) =>
    request<Message>(`/public/documents/${token}/${accept ? 'accept' : 'decline'}`, { method: 'POST', body, retryOnUnauthorized: false }),
  pdfUrl: (token: string) => `/api/public/documents/${token}/pdf`,
  upiQrUrl: (token: string) => `/api/public/documents/${token}/upi-qr`,
};
