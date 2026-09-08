/** Typed wrappers around every API route the UI uses. */
import { api } from './client';
export const authApi = {
    register: (body) => api.post('/auth/register', body),
    login: (body) => api.post('/auth/login', body),
    me: () => api.get('/auth/me'),
    logout: () => api.post('/auth/logout'),
    updateProfile: (body) => api.put('/auth/me', body),
    changePassword: (body) => api.post('/auth/change-password', body),
};
export const orgApi = {
    get: () => api.get('/organization'),
    update: (body) => api.put('/organization', body),
    users: () => api.get('/users'),
    inviteUser: (body) => api.post('/users', body),
    updateUser: (id, body) => api.patch(`/users/${id}`, body),
    resetUserPassword: (id, newPassword) => api.post(`/users/${id}/reset-password`, undefined, { new_password: newPassword }),
    auditLogs: (query) => api.get('/audit-logs', query),
};
export const itemsApi = {
    list: (query, signal) => api.get('/items', query, signal),
    get: (id) => api.get(`/items/${id}`),
    create: (body) => api.post('/items', body),
    update: (id, body) => api.put(`/items/${id}`, body),
    remove: (id) => api.delete(`/items/${id}`),
    adjustments: (query) => api.get('/inventory-adjustments', query),
    adjust: (body) => api.post('/inventory-adjustments', body),
};
export const contactsApi = {
    list: (query, signal) => api.get('/contacts', query, signal),
    get: (id) => api.get(`/contacts/${id}`),
    summary: (id) => api.get(`/contacts/${id}/summary`),
    create: (body) => api.post('/contacts', body),
    update: (id, body) => api.put(`/contacts/${id}`, body),
    remove: (id) => api.delete(`/contacts/${id}`),
};
export const invoicesApi = {
    list: (query, signal) => api.get('/invoices', query, signal),
    stats: () => api.get('/invoices/stats'),
    get: (id) => api.get(`/invoices/${id}`),
    create: (body) => api.post('/invoices', body),
    update: (id, body) => api.put(`/invoices/${id}`, body),
    setStatus: (id, status) => api.post(`/invoices/${id}/status`, { status }),
    remove: (id) => api.delete(`/invoices/${id}`),
};
export const customerPaymentsApi = {
    list: (query) => api.get('/customer-payments', query),
    create: (body) => api.post('/customer-payments', body),
    remove: (id) => api.delete(`/customer-payments/${id}`),
};
export const billsApi = {
    list: (query, signal) => api.get('/bills', query, signal),
    stats: () => api.get('/bills/stats'),
    get: (id) => api.get(`/bills/${id}`),
    create: (body) => api.post('/bills', body),
    update: (id, body) => api.put(`/bills/${id}`, body),
    setStatus: (id, status) => api.post(`/bills/${id}/status`, { status }),
    remove: (id) => api.delete(`/bills/${id}`),
};
export const vendorPaymentsApi = {
    list: (query) => api.get('/vendor-payments', query),
    create: (body) => api.post('/vendor-payments', body),
    remove: (id) => api.delete(`/vendor-payments/${id}`),
};
export const expensesApi = {
    list: (query) => api.get('/expenses', query),
    get: (id) => api.get(`/expenses/${id}`),
    create: (body) => api.post('/expenses', body),
    update: (id, body) => api.put(`/expenses/${id}`, body),
    remove: (id) => api.delete(`/expenses/${id}`),
};
export const bankingApi = {
    accounts: (query) => api.get('/banking/accounts', query),
    summary: () => api.get('/banking/summary'),
    createAccount: (body) => api.post('/banking/accounts', body),
    updateAccount: (id, body) => api.put(`/banking/accounts/${id}`, body),
    transactions: (query) => api.get('/banking/transactions', query),
    createTransaction: (accountId, body) => api.post(`/banking/accounts/${accountId}/transactions`, body),
    transfer: (body) => api.post('/banking/transfers', body),
    removeTransaction: (id) => api.delete(`/banking/transactions/${id}`),
    reconcile: (transactionIds, reconciled) => api.post('/banking/transactions/reconcile', { transactionIds, reconciled }),
};
export const accountingApi = {
    accounts: (query) => api.get('/accounting/accounts', query),
    createAccount: (body) => api.post('/accounting/accounts', body),
    updateAccount: (id, body) => api.put(`/accounting/accounts/${id}`, body),
    removeAccount: (id) => api.delete(`/accounting/accounts/${id}`),
    journals: (query) => api.get('/accounting/journals', query),
    journal: (id) => api.get(`/accounting/journals/${id}`),
    createJournal: (body) => api.post('/accounting/journals', body),
    reverseJournal: (id) => api.post(`/accounting/journals/${id}/reverse`),
    ledger: (accountId, query) => api.get(`/accounting/ledger/${accountId}`, query),
    trialBalance: (query) => api.get('/accounting/trial-balance', query),
};
export const projectsApi = {
    list: (query) => api.get('/projects', query),
    get: (id) => api.get(`/projects/${id}`),
    create: (body) => api.post('/projects', body),
    update: (id, body) => api.put(`/projects/${id}`, body),
    remove: (id) => api.delete(`/projects/${id}`),
    timeEntries: (query) => api.get('/time-entries', query),
    logTime: (body) => api.post('/time-entries', body),
    updateTime: (id, body) => api.put(`/time-entries/${id}`, body),
    removeTime: (id) => api.delete(`/time-entries/${id}`),
    invoiceTime: (body) => api.post('/time-entries/invoice', body),
};
export const documentsApi = {
    list: (query) => api.get('/documents', query),
    upload: (formData) => api.upload('/documents', formData),
    update: (id, body) => api.patch(`/documents/${id}`, body),
    remove: (id) => api.delete(`/documents/${id}`),
};
export const payrollApi = {
    employees: (query) => api.get('/payroll/employees', query),
    createEmployee: (body) => api.post('/payroll/employees', body),
    updateEmployee: (id, body) => api.put(`/payroll/employees/${id}`, body),
    removeEmployee: (id) => api.delete(`/payroll/employees/${id}`),
    payRuns: () => api.get('/payroll/pay-runs'),
    payRun: (id) => api.get(`/payroll/pay-runs/${id}`),
    createPayRun: (body) => api.post('/payroll/pay-runs', body),
    approvePayRun: (id) => api.post(`/payroll/pay-runs/${id}/approve`),
    payPayRun: (id, body) => api.post(`/payroll/pay-runs/${id}/pay`, body),
    removePayRun: (id) => api.delete(`/payroll/pay-runs/${id}`),
    payslip: (id) => api.get(`/payroll/payslips/${id}`),
};
export const reportsApi = {
    profitAndLoss: (query) => api.get('/reports/profit-and-loss', query),
    balanceSheet: (query) => api.get('/reports/balance-sheet', query),
    receivablesAging: (query) => api.get('/reports/receivables-aging', query),
    payablesAging: (query) => api.get('/reports/payables-aging', query),
    salesByCustomer: (query) => api.get('/reports/sales-by-customer', query),
    purchasesByVendor: (query) => api.get('/reports/purchases-by-vendor', query),
    expensesByCategory: (query) => api.get('/reports/expenses-by-category', query),
    inventorySummary: () => api.get('/reports/inventory-summary'),
    taxSummary: (query) => api.get('/reports/tax-summary', query),
};
export const dashboardApi = {
    summary: (period) => api.get('/dashboard/summary', { period }),
    notifications: () => api.get('/dashboard/notifications'),
};
