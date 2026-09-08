/** Typed wrappers around every API route the UI uses. */
import { api } from './client';
import type {
  Account,
  AgingReport,
  AuditLog,
  AuthResponse,
  BalanceSheet,
  BankAccount,
  BankingSummary,
  BankTransaction,
  Bill,
  BillListItem,
  Contact,
  ContactSummary,
  ContactTotalsReport,
  CustomerPayment,
  DashboardPeriod,
  DashboardSummary,
  DocumentStats,
  Employee,
  Expense,
  ExpenseByCategoryReport,
  InventoryAdjustment,
  InventorySummaryReport,
  Invoice,
  InvoiceListItem,
  Item,
  JournalEntry,
  LedgerReport,
  Message,
  Notifications,
  Organization,
  Page,
  PayRun,
  Payslip,
  ProfitAndLoss,
  Project,
  StoredDocument,
  TaxSummary,
  TimeEntry,
  TrialBalance,
  User,
  VendorPayment,
} from './types';

type Query = Record<string, string | number | boolean | undefined | null>;

export const authApi = {
  register: (body: { name: string; email: string; password: string; organizationName: string; gstin?: string }) =>
    api.post<AuthResponse>('/auth/register', body),
  login: (body: { email: string; password: string }) => api.post<AuthResponse>('/auth/login', body),
  me: () => api.get<AuthResponse>('/auth/me'),
  logout: () => api.post<Message>('/auth/logout'),
  updateProfile: (body: { name: string }) => api.put<User>('/auth/me', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) => api.post<Message>('/auth/change-password', body),
};

export const orgApi = {
  get: () => api.get<Organization>('/organization'),
  update: (body: Partial<Organization>) => api.put<Organization>('/organization', body),
  users: () => api.get<User[]>('/users'),
  inviteUser: (body: { name: string; email: string; role: string; password: string }) => api.post<User>('/users', body),
  updateUser: (id: string, body: { name?: string; role?: string; isActive?: boolean }) => api.patch<User>(`/users/${id}`, body),
  resetUserPassword: (id: string, newPassword: string) => api.post<Message>(`/users/${id}/reset-password`, undefined, { new_password: newPassword }),
  auditLogs: (query?: Query) => api.get<Page<AuditLog>>('/audit-logs', query),
};

export const itemsApi = {
  list: (query?: Query, signal?: AbortSignal) => api.get<Page<Item>>('/items', query, signal),
  get: (id: string) => api.get<Item>(`/items/${id}`),
  create: (body: Partial<Item>) => api.post<Item>('/items', body),
  update: (id: string, body: Partial<Item>) => api.put<Item>(`/items/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/items/${id}`),
  adjustments: (query?: Query) => api.get<Page<InventoryAdjustment>>('/inventory-adjustments', query),
  adjust: (body: { itemId: string; date: string; quantityDelta: number; reason: string; notes?: string }) =>
    api.post<InventoryAdjustment>('/inventory-adjustments', body),
};

export const contactsApi = {
  list: (query?: Query, signal?: AbortSignal) => api.get<Page<Contact>>('/contacts', query, signal),
  get: (id: string) => api.get<Contact>(`/contacts/${id}`),
  summary: (id: string) => api.get<ContactSummary>(`/contacts/${id}/summary`),
  create: (body: Partial<Contact>) => api.post<Contact>('/contacts', body),
  update: (id: string, body: Partial<Contact>) => api.put<Contact>(`/contacts/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/contacts/${id}`),
};

export const invoicesApi = {
  list: (query?: Query, signal?: AbortSignal) => api.get<Page<InvoiceListItem>>('/invoices', query, signal),
  stats: () => api.get<DocumentStats>('/invoices/stats'),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
  create: (body: unknown) => api.post<Invoice>('/invoices', body),
  update: (id: string, body: unknown) => api.put<Invoice>(`/invoices/${id}`, body),
  setStatus: (id: string, status: 'sent' | 'void' | 'draft') => api.post<Invoice>(`/invoices/${id}/status`, { status }),
  remove: (id: string) => api.delete<Message>(`/invoices/${id}`),
};

export const customerPaymentsApi = {
  list: (query?: Query) => api.get<Page<CustomerPayment>>('/customer-payments', query),
  create: (body: unknown) => api.post<CustomerPayment>('/customer-payments', body),
  remove: (id: string) => api.delete<Message>(`/customer-payments/${id}`),
};

export const billsApi = {
  list: (query?: Query, signal?: AbortSignal) => api.get<Page<BillListItem>>('/bills', query, signal),
  stats: () => api.get<DocumentStats>('/bills/stats'),
  get: (id: string) => api.get<Bill>(`/bills/${id}`),
  create: (body: unknown) => api.post<Bill>('/bills', body),
  update: (id: string, body: unknown) => api.put<Bill>(`/bills/${id}`, body),
  setStatus: (id: string, status: 'open' | 'void' | 'draft') => api.post<Bill>(`/bills/${id}/status`, { status }),
  remove: (id: string) => api.delete<Message>(`/bills/${id}`),
};

export const vendorPaymentsApi = {
  list: (query?: Query) => api.get<Page<VendorPayment>>('/vendor-payments', query),
  create: (body: unknown) => api.post<VendorPayment>('/vendor-payments', body),
  remove: (id: string) => api.delete<Message>(`/vendor-payments/${id}`),
};

export const expensesApi = {
  list: (query?: Query) => api.get<Page<Expense>>('/expenses', query),
  get: (id: string) => api.get<Expense>(`/expenses/${id}`),
  create: (body: unknown) => api.post<Expense>('/expenses', body),
  update: (id: string, body: unknown) => api.put<Expense>(`/expenses/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/expenses/${id}`),
};

export const bankingApi = {
  accounts: (query?: Query) => api.get<BankAccount[]>('/banking/accounts', query),
  summary: () => api.get<BankingSummary>('/banking/summary'),
  createAccount: (body: unknown) => api.post<BankAccount>('/banking/accounts', body),
  updateAccount: (id: string, body: unknown) => api.put<BankAccount>(`/banking/accounts/${id}`, body),
  transactions: (query?: Query) => api.get<Page<BankTransaction>>('/banking/transactions', query),
  createTransaction: (accountId: string, body: unknown) => api.post<BankTransaction>(`/banking/accounts/${accountId}/transactions`, body),
  transfer: (body: unknown) => api.post<Message>('/banking/transfers', body),
  removeTransaction: (id: string) => api.delete<Message>(`/banking/transactions/${id}`),
  reconcile: (transactionIds: string[], reconciled: boolean) => api.post<Message>('/banking/transactions/reconcile', { transactionIds, reconciled }),
};

export const accountingApi = {
  accounts: (query?: Query) => api.get<Account[]>('/accounting/accounts', query),
  createAccount: (body: unknown) => api.post<Account>('/accounting/accounts', body),
  updateAccount: (id: string, body: unknown) => api.put<Account>(`/accounting/accounts/${id}`, body),
  removeAccount: (id: string) => api.delete<Message>(`/accounting/accounts/${id}`),
  journals: (query?: Query) => api.get<Page<JournalEntry>>('/accounting/journals', query),
  journal: (id: string) => api.get<JournalEntry>(`/accounting/journals/${id}`),
  createJournal: (body: unknown) => api.post<JournalEntry>('/accounting/journals', body),
  reverseJournal: (id: string) => api.post<JournalEntry>(`/accounting/journals/${id}/reverse`),
  ledger: (accountId: string, query?: Query) => api.get<LedgerReport>(`/accounting/ledger/${accountId}`, query),
  trialBalance: (query?: Query) => api.get<TrialBalance>('/accounting/trial-balance', query),
};

export const projectsApi = {
  list: (query?: Query) => api.get<Project[]>('/projects', query),
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (body: unknown) => api.post<Project>('/projects', body),
  update: (id: string, body: unknown) => api.put<Project>(`/projects/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/projects/${id}`),
  timeEntries: (query?: Query) => api.get<Page<TimeEntry>>('/time-entries', query),
  logTime: (body: unknown) => api.post<TimeEntry>('/time-entries', body),
  updateTime: (id: string, body: unknown) => api.put<TimeEntry>(`/time-entries/${id}`, body),
  removeTime: (id: string) => api.delete<Message>(`/time-entries/${id}`),
  invoiceTime: (body: unknown) => api.post<Invoice>('/time-entries/invoice', body),
};

export const documentsApi = {
  list: (query?: Query) => api.get<Page<StoredDocument>>('/documents', query),
  upload: (formData: FormData) => api.upload<StoredDocument>('/documents', formData),
  update: (id: string, body: unknown) => api.patch<StoredDocument>(`/documents/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/documents/${id}`),
};

export const payrollApi = {
  employees: (query?: Query) => api.get<Employee[]>('/payroll/employees', query),
  createEmployee: (body: unknown) => api.post<Employee>('/payroll/employees', body),
  updateEmployee: (id: string, body: unknown) => api.put<Employee>(`/payroll/employees/${id}`, body),
  removeEmployee: (id: string) => api.delete<Message>(`/payroll/employees/${id}`),
  payRuns: () => api.get<PayRun[]>('/payroll/pay-runs'),
  payRun: (id: string) => api.get<PayRun>(`/payroll/pay-runs/${id}`),
  createPayRun: (body: unknown) => api.post<PayRun>('/payroll/pay-runs', body),
  approvePayRun: (id: string) => api.post<PayRun>(`/payroll/pay-runs/${id}/approve`),
  payPayRun: (id: string, body: unknown) => api.post<PayRun>(`/payroll/pay-runs/${id}/pay`, body),
  removePayRun: (id: string) => api.delete<Message>(`/payroll/pay-runs/${id}`),
  payslip: (id: string) => api.get<Payslip>(`/payroll/payslips/${id}`),
};

export const reportsApi = {
  profitAndLoss: (query?: Query) => api.get<ProfitAndLoss>('/reports/profit-and-loss', query),
  balanceSheet: (query?: Query) => api.get<BalanceSheet>('/reports/balance-sheet', query),
  receivablesAging: (query?: Query) => api.get<AgingReport>('/reports/receivables-aging', query),
  payablesAging: (query?: Query) => api.get<AgingReport>('/reports/payables-aging', query),
  salesByCustomer: (query?: Query) => api.get<ContactTotalsReport>('/reports/sales-by-customer', query),
  purchasesByVendor: (query?: Query) => api.get<ContactTotalsReport>('/reports/purchases-by-vendor', query),
  expensesByCategory: (query?: Query) => api.get<ExpenseByCategoryReport>('/reports/expenses-by-category', query),
  inventorySummary: () => api.get<InventorySummaryReport>('/reports/inventory-summary'),
  taxSummary: (query?: Query) => api.get<TaxSummary>('/reports/tax-summary', query),
};

export const dashboardApi = {
  summary: (period: DashboardPeriod) => api.get<DashboardSummary>('/dashboard/summary', { period }),
  notifications: () => api.get<Notifications>('/dashboard/notifications'),
};
