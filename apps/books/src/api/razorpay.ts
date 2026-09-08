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
