/** Frontend API client for Razorpay Payments, Refunds, Settlements, and Financial Tracking. */
import { api, downloadFile } from './client';
import type { Page } from './types';

export interface RazorpayConfig {
  key_id: string;
  mode: 'test' | 'live';
  currency: string;
  name: string;
  theme_color: string;
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number; // in paise
  currency: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  key_id: string;
  mode: string;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  invoice_id: string;
  amount: number;
  method?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  message: string;
  payment_id: string;
  razorpay_payment_id: string;
  invoice_status: string;
  amount_paid: number;
  balance_due: number;
  razorpay_fee: number;
  tax_on_fee: number;
  net_settlement: number;
}

export interface PaymentRecordItem {
  id: string;
  razorpay_order_id?: string;
  razorpay_payment_id: string;
  customer_id?: string;
  customer_name?: string;
  invoice_id?: string;
  invoice_number?: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: 'created' | 'authorized' | 'captured' | 'refunded' | 'partially_refunded' | 'failed';
  mode: string;
  captured_at?: string;
  refund_amount: number;
  razorpay_fee: number;
  tax_on_fee: number;
  net_settlement: number;
  created_at: string;
}

export interface RefundItem {
  id: string;
  payment_id: string;
  razorpay_payment_id: string;
  razorpay_refund_id: string;
  invoice_id?: string;
  amount: number;
  currency: string;
  refund_date: string;
  reason: string;
  status: string;
  speed: string;
  created_at: string;
}

export interface SettlementItem {
  id: string;
  settlement_id: string;
  settlement_date: string;
  gross_amount: number;
  fee_amount: number;
  tax_amount: number;
  refunds: number;
  adjustments: number;
  net_amount: number;
  status: string;
  bank_reference?: string;
  reconciled: boolean;
  created_at: string;
}

export interface ReconciliationItem {
  id: string;
  reconciliation_date: string;
  razorpay_payment_id: string;
  internal_payment_id?: string;
  settlement_id?: string;
  status: 'matched' | 'mismatch' | 'missing_settlement' | 'duplicate';
  discrepancy_note?: string;
  amount_expected: number;
  amount_actual: number;
  difference: number;
  resolved: boolean;
  created_at: string;
}

export interface AnalyticsData {
  total_payments_count: number;
  successful_count: number;
  failed_count: number;
  refunded_count: number;
  success_rate: number;
  failure_rate: number;
  total_captured_value: number;
  total_refunded_value: number;
  total_fees_paid: number;
  methods_breakdown: Array<{
    method: string;
    count: number;
    value: number;
    percentage: number;
  }>;
}

export interface FinancialDashboardData {
  period: string;
  start_date: string;
  end_date: string;
  top_cards: {
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    payment_gateway_fees: number;
    total_refunds: number;
    total_settlements: number;
  };
  cash_flow: {
    money_in: number;
    money_out: number;
    net_cash_flow: number;
  };
  chart_data: Array<{
    label: string;
    date: string;
    revenue: number;
    expenses: number;
    refunds: number;
    profit: number;
  }>;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  transaction_type: string;
  reference_type: string;
  reference_id?: string;
  debit: number;
  credit: number;
  amount: number;
  account: string;
  date: string;
  description: string;
  status: string;
  created_at: string;
}

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export const razorpayApi = {
  getConfig: () => api.get<RazorpayConfig>('/razorpay/config'),

  createOrder: (invoiceId: string, amount?: number, notes?: Record<string, unknown>) =>
    api.post<CreateOrderResponse>('/razorpay/create-order', { invoice_id: invoiceId, amount, notes }),

  verifyPayment: (payload: VerifyPaymentPayload) =>
    api.post<VerifyPaymentResponse>('/razorpay/verify-payment', payload),

  listPayments: (params?: QueryParams) =>
    api.get<Page<PaymentRecordItem>>('/razorpay/payments', params),

  createRefund: (payload: { payment_id: string; amount: number; reason: string; speed?: string }) =>
    api.post<{
      success: boolean;
      message: string;
      refund_id: string;
      razorpay_refund_id: string;
      refund_amount: number;
      payment_status: string;
      remaining_refundable: number;
    }>('/razorpay/refund', payload),

  listRefunds: (params?: QueryParams) =>
    api.get<Page<RefundItem>>('/razorpay/refunds', params),

  listSettlements: (params?: QueryParams) =>
    api.get<Page<SettlementItem>>('/razorpay/settlements', params),

  reconcile: () =>
    api.post<{ success: boolean; message: string; total_evaluated: number; discrepancies: number }>('/razorpay/reconcile'),

  listReconciliations: (params?: QueryParams) =>
    api.get<Page<ReconciliationItem>>('/razorpay/reconciliations', params),

  getAnalytics: (params?: QueryParams) =>
    api.get<AnalyticsData>('/razorpay/analytics', params),

  getFinancialDashboard: (params?: QueryParams) =>
    api.get<FinancialDashboardData>('/razorpay/financial-dashboard', params),

  listTransactions: (params?: QueryParams) =>
    api.get<Page<TransactionItem>>('/razorpay/transactions', params),

  exportReport: (reportType: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams({ report_type: reportType });
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return downloadFile(`/razorpay/reports/export?${params.toString()}`, `${reportType}_report.csv`);
  },
};

/* -------------------------------------------------------------------------- */
/* Integration status, transaction sync and categorisation                     */
/* -------------------------------------------------------------------------- */

export interface SyncLog {
  id: string;
  sync_type: 'initial' | 'incremental' | 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'partial' | 'failed';
  started_at: string;
  completed_at?: string | null;
  duration_seconds?: number | null;
  window_from?: string | null;
  window_to?: string | null;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  refunds_synced: number;
  pages_fetched: number;
  mode: string;
  error_message?: string | null;
  triggered_by?: string | null;
}

export interface IntegrationStatus {
  configured: boolean;
  connected: boolean;
  reachable: boolean | null;
  mode: 'test' | 'live';
  /** Masked for display, e.g. rzp_test_ABCD...WXYZ. The secret is never sent. */
  key_id_masked: string;
  webhook_configured: boolean;
  error?: string | null;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  initial_import_days: number;
  webhook_path: string;
  transactions_imported: number;
  ever_synced: boolean;
  last_successful_sync?: SyncLog | null;
  last_sync?: SyncLog | null;
}

export interface SyncResponse {
  success: boolean;
  message: string;
  sync: SyncLog;
}

export type ReconciliationStatus =
  | 'matched'
  | 'unmatched'
  | 'partially_matched'
  | 'needs_review'
  | 'ignored';

export interface RazorpayTransaction {
  id: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id: string;
  razorpay_invoice_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_contact?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  method_detail?: string | null;
  payment_status: string;
  mode: string;
  source: string;
  transaction_date?: string | null;
  captured_at?: string | null;
  refund_amount: number;
  razorpay_fee: number;
  tax_on_fee: number;
  net_settlement: number;
  net_amount: number;
  category: string;
  category_label: string;
  category_source?: string | null;
  category_confidence?: number | null;
  category_status: 'suggested' | 'accepted';
  ledger_account_id?: string | null;
  reconciliation_status: ReconciliationStatus;
  invoice_match_confidence?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  last_synced_at?: string | null;
  created_at: string;
}

export interface TransactionDetail extends RazorpayTransaction {
  ledger_account_name?: string | null;
  ledger_account_code?: string | null;
  refunds: Array<{
    id: string;
    razorpay_refund_id: string;
    amount: number;
    refund_date: string;
    status: string;
    speed: string;
    reason: string;
  }>;
  accounting_entries: Array<{
    id: string;
    entry_number: string;
    date: string;
    total: number;
    lines: Array<{ account_id: string; description?: string | null; debit: number; credit: number }>;
  }>;
  raw_reference?: Record<string, unknown> | null;
}

export interface PaymentsOverview {
  total_payments: number;
  total_payments_count: number;
  successful_payments: number;
  successful_count: number;
  failed_payments: number;
  failed_count: number;
  refunds: number;
  gateway_fees: number;
  net_revenue: number;
  todays_payments: number;
  this_month_payments: number;
  by_status: Record<string, { count: number; amount: number }>;
  by_method: Array<{ method: string; count: number; amount: number }>;
  by_reconciliation: Record<string, number>;
}

export interface InvoiceCandidate {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  customer_name?: string | null;
  total: number;
  balance_due: number;
  status: string;
  confidence: number;
  reasons: string[];
}

export interface InvoiceMatchResult {
  ambiguous: boolean;
  reason: string;
  can_auto_book: boolean;
  candidates: InvoiceCandidate[];
}

export interface CategoryOption {
  value: string;
  label: string;
  account_code?: string | null;
}

export interface CategoryRule {
  id: string;
  name: string;
  match_type: string;
  match_value: string;
  category: string;
  category_label: string;
  ledger_account_id?: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface CategoryRulePayload {
  name: string;
  match_type: string;
  match_value: string;
  category: string;
  ledger_account_id?: string | null;
  priority: number;
  is_active: boolean;
}

export interface TransactionFilters extends QueryParams {
  status?: string;
  method?: string;
  customer_id?: string;
  category?: string;
  reconciliation_status?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ConnectRazorpayPayload {
  key_id: string;
  key_secret: string;
  webhook_secret?: string;
  mode?: 'test' | 'live';
}

export interface ConnectRazorpayResponse {
  success: boolean;
  connected: boolean;
  reachable?: boolean;
  message: string;
  status: IntegrationStatus;
}

export const razorpaySyncApi = {
  getIntegrationStatus: () => api.get<IntegrationStatus>('/razorpay/integration/status'),

  connectIntegration: (payload: ConnectRazorpayPayload) =>
    api.post<ConnectRazorpayResponse>('/razorpay/integration/connect', payload),

  disconnectIntegration: () =>
    api.post<{ success: boolean; connected: boolean; message: string; status: IntegrationStatus }>(
      '/razorpay/integration/disconnect',
    ),

  /** Import new transactions. `full` re-scans the whole initial history window. */
  sync: (full = false) => api.post<SyncResponse>('/razorpay/sync', { full }),

  listSyncLogs: (params?: QueryParams) => api.get<PagedResult<SyncLog>>('/razorpay/sync/logs', params),

  getOverview: (params?: QueryParams) => api.get<PaymentsOverview>('/razorpay/overview', params),

  listTransactions: (params?: TransactionFilters) =>
    api.get<PagedResult<RazorpayTransaction>>('/razorpay/payments', params),

  getTransaction: (id: string) => api.get<TransactionDetail>(`/razorpay/payments/${id}`),

  setCategory: (id: string, category: string, acceptSuggestion = false) =>
    api.post<RazorpayTransaction>(`/razorpay/payments/${id}/category`, {
      category,
      accept_suggestion: acceptSuggestion,
    }),

  getInvoiceMatches: (id: string) => api.get<InvoiceMatchResult>(`/razorpay/payments/${id}/invoice-matches`),

  matchInvoice: (id: string, invoiceId: string) =>
    api.post<{
      success: boolean;
      message: string;
      invoice_status: string;
      amount_paid: number;
      balance_due: number;
      payment: RazorpayTransaction;
    }>(`/razorpay/payments/${id}/match-invoice`, { invoice_id: invoiceId, confirm: true }),

  setReconciliation: (id: string, status: ReconciliationStatus, note?: string) =>
    api.post<RazorpayTransaction>(`/razorpay/payments/${id}/reconciliation`, { status, note }),

  listCategories: () => api.get<{ items: CategoryOption[]; match_types: string[] }>('/razorpay/categories'),

  listRules: () => api.get<{ items: CategoryRule[]; total: number }>('/razorpay/category-rules'),

  createRule: (payload: CategoryRulePayload) => api.post<CategoryRule>('/razorpay/category-rules', payload),

  updateRule: (id: string, payload: CategoryRulePayload) =>
    api.put<CategoryRule>(`/razorpay/category-rules/${id}`, payload),

  deleteRule: (id: string) => api.delete<void>(`/razorpay/category-rules/${id}`),

  reapplyRules: () =>
    api.post<{ success: boolean; evaluated: number; recategorised: number }>('/razorpay/category-rules/reapply'),
};
