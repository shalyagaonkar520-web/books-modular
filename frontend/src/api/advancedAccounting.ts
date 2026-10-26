/** Fixed assets, budgets and currencies. */
import { api } from './client';
import type { Message } from './types';

export interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  description?: string | null;
  category?: string | null;
  assetAccountId: string;
  assetAccountName: string;
  depreciationAccountId?: string | null;
  accumulatedAccountId?: string | null;
  purchaseDate: string;
  depreciationStart: string;
  cost: number;
  salvageValue: number;
  method: 'straight_line' | 'declining';
  usefulLifeMonths: number;
  rate: number;
  accumulatedDepreciation: number;
  bookValue: number;
  monthlyDepreciation: number;
  lastDepreciationDate?: string | null;
  status: 'active' | 'fully_depreciated' | 'disposed';
  disposedOn?: string | null;
  disposalAmount?: number | null;
}

export interface DepreciationRow {
  id: string;
  periodEnd: string;
  amount: number;
}

export const fixedAssetsApi = {
  list: (status?: string) => api.get<FixedAsset[]>('/fixed-assets', status ? { status } : undefined),
  get: (id: string) => api.get<FixedAsset>(`/fixed-assets/${id}`),
  schedule: (id: string) => api.get<DepreciationRow[]>(`/fixed-assets/${id}/schedule`),
  create: (body: unknown) => api.post<FixedAsset>('/fixed-assets', body),
  remove: (id: string) => api.delete<Message>(`/fixed-assets/${id}`),
  runDepreciation: (through?: string) => api.post<{ posted: number; amount: number; assets: number }>('/fixed-assets/run-depreciation', { through: through || null }),
  undoDepreciation: (id: string) => api.post<FixedAsset>(`/fixed-assets/${id}/undo-depreciation`),
  dispose: (id: string, body: { date: string; proceeds: number; bankAccountId?: string | null }) => api.post<FixedAsset>(`/fixed-assets/${id}/dispose`, body),
  undoDisposal: (id: string) => api.post<FixedAsset>(`/fixed-assets/${id}/undo-disposal`),
};

export interface BudgetLine {
  accountId: string;
  code: string;
  name: string;
  type: 'income' | 'expense';
  amounts: number[];
  total: number;
}

export interface Budget {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  lines: BudgetLine[];
  totalIncome: number;
  totalExpense: number;
}

export interface VarianceRow {
  accountId: string;
  code: string;
  name: string;
  type: 'income' | 'expense';
  budget: number;
  actual: number;
  variance: number;
  variancePercent?: number | null;
  favourable: boolean;
  monthlyBudget: number[];
  monthlyActual: number[];
}

export interface BudgetVsActual {
  budgetId: string;
  name: string;
  startDate: string;
  through: string;
  months: string[];
  rows: VarianceRow[];
  incomeBudget: number;
  incomeActual: number;
  expenseBudget: number;
  expenseActual: number;
  profitBudget: number;
  profitActual: number;
}

export const budgetsApi = {
  list: () => api.get<Budget[]>('/budgets'),
  get: (id: string) => api.get<Budget>(`/budgets/${id}`),
  create: (body: unknown) => api.post<Budget>('/budgets', body),
  update: (id: string, body: unknown) => api.put<Budget>(`/budgets/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/budgets/${id}`),
  vsActual: (id: string, through?: string) => api.get<BudgetVsActual>(`/budgets/${id}/vs-actual`, through ? { through } : undefined),
};

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  exchangeRate?: number | null;
  isBase: boolean;
  updatedAt?: string | null;
}

export const currenciesApi = {
  list: () => api.get<Currency[]>('/currencies'),
  save: (code: string, body: { name?: string; symbol?: string; exchangeRate: number }) => api.put<Currency>(`/currencies/${code}`, body),
  remove: (code: string) => api.delete<Message>(`/currencies/${code}`),
  catalog: () => api.get<Array<{ code: string; name: string; symbol: string }>>('/currencies/catalog'),
};
