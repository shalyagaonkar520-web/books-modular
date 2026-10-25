/** Branches, serial numbers, mileage claims, project profitability, contact statements and bank statement import. */
import { api, downloadFile, request } from './client';
import type { Expense, Message } from './types';

export interface Branch {
  id: string;
  name: string;
  code?: string | null;
  gstin?: string | null;
  address?: string | null;
  isActive: boolean;
}

export const branchesApi = {
  list: (includeInactive = false) => api.get<Branch[]>('/branches', includeInactive ? { include_inactive: true } : undefined),
  create: (body: Partial<Branch>) => api.post<Branch>('/branches', body),
  update: (id: string, body: Partial<Branch>) => api.put<Branch>(`/branches/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/branches/${id}`),
};

export interface StockSerial {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  serialNumber: string;
  status: 'in_stock' | 'out';
  lastSourceType?: string | null;
  lastSourceId?: string | null;
}

export const serialsApi = {
  list: (params: { itemId?: string; status?: string; search?: string }) => api.get<StockSerial[]>('/stock/serials', params),
  register: (body: { itemId: string; warehouseId?: string | null; serialNumbers: string }) => api.post<Message>('/stock/serials/register', body),
};

export interface MileageClaim {
  date: string;
  distanceKm: number;
  ratePerKm?: number | null;
  paidThroughAccountId: string;
  accountId?: string | null;
  fromPlace?: string | null;
  toPlace?: string | null;
  purpose?: string | null;
  customerId?: string | null;
  isBillable?: boolean;
  branchId?: string | null;
  projectId?: string | null;
}

export const mileageApi = {
  create: (body: MileageClaim) => api.post<Expense>('/expenses/mileage', body),
};

export interface ProfitabilityCost {
  kind: 'bill' | 'expense';
  id: string;
  number: string;
  date: string;
  description: string;
  amount: number;
}

export interface ProjectProfitability {
  projectId: string;
  projectName: string;
  revenue: number;
  invoiceCount: number;
  billCosts: number;
  expenseCosts: number;
  labourHours: number;
  labourCost: number;
  totalCost: number;
  profit: number;
  marginPercent?: number | null;
  unbilledAmount: number;
  budgetHours: number;
  loggedHours: number;
  costs: ProfitabilityCost[];
}

export const profitabilityApi = {
  get: (projectId: string) => api.get<ProjectProfitability>(`/projects/${projectId}/profitability`),
};

export interface StatementRow {
  date: string;
  kind: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ContactStatement {
  contactId: string;
  contactName: string;
  contactType: 'customer' | 'vendor';
  startDate: string;
  endDate: string;
  openingBalance: number;
  charges: number;
  receipts: number;
  closingBalance: number;
  rows: StatementRow[];
}

export const statementsApi = {
  get: (contactId: string, startDate: string, endDate: string) => api.get<ContactStatement>(`/contacts/${contactId}/statement`, { startDate, endDate }),
  pdf: (contactId: string, startDate: string, endDate: string) =>
    downloadFile(`/contacts/${contactId}/statement/pdf?startDate=${startDate}&endDate=${endDate}`, `statement_${endDate}.pdf`),
  send: (contactId: string, startDate: string, endDate: string, body: { toEmail?: string | null; message?: string | null }) =>
    api.post<{ success: boolean }>(`/contacts/${contactId}/statement/send`, body, { startDate, endDate }),
};

export interface MatchCandidate {
  kind: 'transaction' | 'invoice' | 'bill';
  id: string;
  label: string;
  date: string;
  amount: number;
  score: number;
}

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  reference?: string | null;
  type: 'deposit' | 'withdrawal';
  amount: number;
  status: 'unmatched' | 'matched' | 'ignored';
  transactionId?: string | null;
  candidates: MatchCandidate[];
}

export interface StatementImportResult {
  imported: number;
  duplicates: number;
  autoMatched: number;
  errors: string[];
}

export const bankStatementsApi = {
  import: (accountId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<StatementImportResult>(`/banking/accounts/${accountId}/statements/import`, { method: 'POST', formData: form });
  },
  lines: (accountId: string, status: 'unmatched' | 'matched' | 'ignored' = 'unmatched') =>
    api.get<StatementLine[]>(`/banking/accounts/${accountId}/statement-lines`, { status }),
  autoMatch: (accountId: string) => api.post<Message>(`/banking/accounts/${accountId}/statements/auto-match`),
  match: (lineId: string, transactionId: string) => api.post<StatementLine>(`/banking/statement-lines/${lineId}/match`, { transactionId }),
  categorize: (lineId: string, accountId: string, description?: string) =>
    api.post<StatementLine>(`/banking/statement-lines/${lineId}/categorize`, { accountId, description: description || null }),
  apply: (lineId: string, body: { invoiceId?: string; billId?: string }) => api.post<StatementLine>(`/banking/statement-lines/${lineId}/apply`, body),
  ignore: (lineId: string) => api.post<StatementLine>(`/banking/statement-lines/${lineId}/ignore`),
  undo: (lineId: string) => api.post<StatementLine>(`/banking/statement-lines/${lineId}/undo`),
  remove: (lineId: string) => api.delete<Message>(`/banking/statement-lines/${lineId}`),
};
