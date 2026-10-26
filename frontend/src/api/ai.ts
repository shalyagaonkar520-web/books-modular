/** AI assistant (scan bills, ask your books) and the cash-flow forecast. */
import { api, request } from './client';

export interface ExtractedLine {
  description: string;
  hsn_sac: string;
  quantity: number;
  rate: number;
  tax_rate: number;
  amount: number;
  account_code: string;
  account_id?: string | null;
  account_name?: string | null;
}

export interface ExtractedDocument {
  document_type: 'bill' | 'expense_receipt' | 'not_a_bill';
  vendor_name: string;
  vendor_gstin: string;
  vendor_id?: string | null;
  bill_number: string;
  date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax_total: number;
  total: number;
  payment_method: string;
  category: string;
  lines: ExtractedLine[];
  notes: string;
}

export interface ForecastWeek {
  weekStart: string;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
}

export interface CashForecast {
  openingCash: number;
  weeks: ForecastWeek[];
  lowestBalance: number;
  lowestWeek?: string | null;
  averageDailySpend: number;
  assumptions: string[];
}

export const aiApi = {
  status: () => api.get<{ configured: boolean; model: string }>('/ai/status'),
  extract: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ExtractedDocument>('/ai/extract-document', { method: 'POST', formData: form });
  },
  categorize: (rows: Array<{ description: string; amount: number; type: 'deposit' | 'withdrawal' }>) =>
    api.post<{ suggestions: Array<{ index: number; account_id: string; account_code: string; account_name: string; confidence: string; reason: string }> }>('/ai/categorize', { rows }),
  ask: (question: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    api.post<{ answer: string; tools_used: string[] }>('/ai/ask', { question, history }),
  forecast: (weeks = 13) => api.get<CashForecast>('/ai/cash-forecast', { weeks }),
};
