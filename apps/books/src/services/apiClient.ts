import { Item, ItemFilterOptions, ItemSortOptions } from '../types/item';
import {
  ReceivablesSummary,
  PayablesSummary,
  CashFlowSummary,
  CashFlowPeriod,
  InventorySummary
} from '../types/dashboard';
import {
  BusinessEvent,
  NeedsAttentionItem,
  AutomationMetrics,
  AutomationRule,
  BankReconciliation,
  AuditLog,
  AssistantQueryResponse,
  JournalEntry,
  TrialBalance
} from '../types/automation';

export * from '../types/automation';

export interface DashboardSummaryResponse {
  receivables: ReceivablesSummary;
  payables: PayablesSummary;
  cashFlow: CashFlowSummary;
  inventory: InventorySummary;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  avatar?: string;
  authProvider?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  icon: string;
  status: string;
  description: string;
}

export interface DemoUser extends UserProfile {
  password: string;
  description: string;
}

const API_BASE = '/api';
const AUTH_USER_KEY = 'zoho_books_auth_user';
const AUTH_TOKEN_KEY = 'zoho_books_auth_token';

export class ApiClient {
  /**
   * Health check to test connectivity to the cloud server
   */
  public static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Log in user with email and password
   */
  public static async login(
    email: string,
    password: string
  ): Promise<{ user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(err.detail || 'Login failed');
    }

    const data = await response.json();
    this.storeUser(data.user, data.token);
    return data;
  }

  /**
   * Register new user
   */
  public static async register(
    name: string,
    email: string,
    password: string,
    organization: string = 'Zylker Electronics India Pvt Ltd',
    role: string = 'Administrator'
  ): Promise<{ user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, organization, role }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }

    const data = await response.json();
    this.storeUser(data.user, data.token);
    return data;
  }

  /**
   * Single Sign-On with OAuth 2.0 Identity Provider
   */
  public static async oauthLogin(
    provider: 'google' | 'microsoft' | 'zoho' | 'github',
    payload?: {
      email?: string;
      name?: string;
      avatar?: string;
      organization?: string;
      role?: string;
    }
  ): Promise<{ user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE}/auth/oauth/${encodeURIComponent(provider)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || { provider }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'OAuth authentication failed' }));
      throw new Error(err.detail || 'OAuth authentication failed');
    }

    const data = await response.json();
    this.storeUser(data.user, data.token);
    return data;
  }

  /**
   * Fetch available enterprise OAuth providers
   */
  public static async getOAuthProviders(): Promise<OAuthProvider[]> {
    try {
      const res = await fetch(`${API_BASE}/auth/oauth/providers`);
      if (res.ok) return res.json();
    } catch {
      // fallback
    }
    return [
      { id: 'google', name: 'Google Workspace', icon: 'google', status: 'Active', description: 'Google OAuth 2.0' },
      { id: 'microsoft', name: 'Microsoft 365 / Azure AD', icon: 'microsoft', status: 'Active', description: 'Microsoft Entra SSO' },
      { id: 'zoho', name: 'Zoho Accounts SSO', icon: 'zoho', status: 'Active', description: 'Zoho One SSO' },
      { id: 'github', name: 'GitHub Enterprise', icon: 'github', status: 'Active', description: 'GitHub SSO' },
    ];
  }

  /**
   * Get cached logged-in user
   */
  public static getStoredUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return null;
  }

  /**
   * Persist user & token to localStorage
   */
  public static storeUser(user: UserProfile, token: string): void {
    try {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }

  /**
   * Clear user session
   */
  public static logout(): void {
    try {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Fetch demo users for instant 1-click test login
   */
  public static async getDemoUsers(): Promise<DemoUser[]> {
    try {
      const res = await fetch(`${API_BASE}/auth/demo-users`);
      if (res.ok) return res.json();
    } catch {
      // fallback
    }
    return [
      {
        id: 'user-1',
        name: 'Shalya Gaonkar',
        email: 'admin@zylkerbooks.com',
        password: 'password123',
        role: 'Administrator',
        organization: 'Zylker Electronics India Pvt Ltd',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
        description: 'Full access to items, sales, inventory & banking',
      },
      {
        id: 'user-2',
        name: 'Priya Sharma',
        email: 'accountant@rooman.com',
        password: 'password123',
        role: 'Chief Accountant',
        organization: 'Zylker Electronics India Pvt Ltd',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
        description: 'Audit, tax filing, journals, balance sheet & payroll access',
      },
    ];
  }

  /**
   * Retrieve items from the cloud server with search, filters, and sort
   */
  public static async getItems(
    filterOptions?: ItemFilterOptions,
    sortOptions?: ItemSortOptions
  ): Promise<Item[]> {
    const params = new URLSearchParams();

    if (filterOptions?.searchQuery?.trim()) {
      params.set('search', filterOptions.searchQuery.trim());
    }
    if (filterOptions?.typeFilter && filterOptions.typeFilter !== 'all') {
      params.set('type_filter', filterOptions.typeFilter);
    }
    if (filterOptions?.inventoryFilter && filterOptions.inventoryFilter !== 'all') {
      params.set('inventory_filter', filterOptions.inventoryFilter);
    }
    if (sortOptions?.field) {
      params.set('sort_by', sortOptions.field);
    }
    if (sortOptions?.order) {
      params.set('sort_order', sortOptions.order);
    }

    const queryString = params.toString();
    const url = `${API_BASE}/items${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to fetch items from server');
    }
    return response.json();
  }

  /**
   * Fetch single item by ID
   */
  public static async getItemById(id: string): Promise<Item> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || `Failed to fetch item ${id}`);
    }
    return response.json();
  }

  /**
   * Create a new item
   */
  public static async createItem(
    itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Item> {
    const response = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to create item on server');
    }
    return response.json();
  }

  /**
   * Update an existing item
   */
  public static async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to update item on server');
    }
    return response.json();
  }

  /**
   * Delete an item by ID
   */
  public static async deleteItem(id: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to delete item on server');
    }
    return true;
  }

  /**
   * Reset database to default seed items
   */
  public static async resetItems(): Promise<Item[]> {
    const response = await fetch(`${API_BASE}/items/reset`, {
      method: 'POST',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to reset items on server');
    }
    return response.json();
  }

  /**
   * Fetch aggregated dashboard statistics
   */
  public static async getDashboardSummary(
    period: CashFlowPeriod = 'this_fiscal_year'
  ): Promise<DashboardSummaryResponse> {
    const response = await fetch(
      `${API_BASE}/dashboard/summary?period=${encodeURIComponent(period)}`
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to fetch dashboard summary');
    }
    return response.json();
  }

  // ==================== INVOICE OPERATIONS ====================
  public static async getInvoices(): Promise<Invoice[]> {
    try {
      const response = await fetch(`${API_BASE}/invoices`);
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return await response.json();
    } catch (err) {
      console.warn('Invoices API fallback:', err);
      return [];
    }
  }

  public static async getInvoice(id: string): Promise<Invoice | null> {
    try {
      const response = await fetch(`${API_BASE}/invoices/${encodeURIComponent(id)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  public static async createInvoice(invoiceData: Partial<Invoice>): Promise<Invoice> {
    const response = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to create invoice' }));
      throw new Error(err.detail || 'Failed to create invoice');
    }
    return response.json();
  }

  public static async updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
    const response = await fetch(`${API_BASE}/invoices/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update invoice status');
    return response.json();
  }

  // ==================== DOCUMENT OPERATIONS ====================
  public static async getDocuments(): Promise<DocumentItem[]> {
    try {
      const response = await fetch(`${API_BASE}/documents`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return await response.json();
    } catch (err) {
      console.warn('Documents API fallback:', err);
      return [];
    }
  }

  public static async uploadDocument(docData: Partial<DocumentItem>): Promise<DocumentItem> {
    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to upload document' }));
      throw new Error(err.detail || 'Failed to upload document');
    }
    return response.json();
  }

  // ==================== PAYROLL OPERATIONS ====================
  public static async getPayrollEmployees(): Promise<PayrollEmployee[]> {
    try {
      const response = await fetch(`${API_BASE}/payroll/employees`);
      if (!response.ok) throw new Error('Failed to fetch employees');
      return await response.json();
    } catch (err) {
      console.warn('Payroll API fallback:', err);
      return [];
    }
  }

  public static async createPayrollEmployee(empData: Partial<PayrollEmployee>): Promise<PayrollEmployee> {
    const response = await fetch(`${API_BASE}/payroll/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to add employee' }));
      throw new Error(err.detail || 'Failed to add employee');
    }
    return response.json();
  }

  public static async disbursePayroll(): Promise<PayrollEmployee[]> {
    const response = await fetch(`${API_BASE}/payroll/disburse`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to run payroll disbursement');
    return response.json();
  }

  public static async getPayslip(empId: string, month: string = 'August 2026'): Promise<Payslip> {
    const response = await fetch(
      `${API_BASE}/payroll/payslip/${encodeURIComponent(empId)}?month=${encodeURIComponent(month)}`
    );
    if (!response.ok) throw new Error('Failed to generate payslip');
    return response.json();
  }

  // =========================================================================
  // Business Automation Engine Methods
  // =========================================================================

  public static async processBusinessEvent(rawText: string, source: string = 'manual_prompt'): Promise<any> {
    const response = await fetch(`${API_BASE}/automation/event/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, source }),
    });
    if (!response.ok) throw new Error('Failed to process business event');
    return response.json();
  }

  public static async getAttentionItems(): Promise<NeedsAttentionItem[]> {
    const response = await fetch(`${API_BASE}/automation/attention`);
    if (!response.ok) return [];
    return response.json();
  }

  public static async takeAttentionAction(itemId: string, action: string = 'dismiss'): Promise<any> {
    const response = await fetch(`${API_BASE}/automation/attention/${encodeURIComponent(itemId)}/action?action=${encodeURIComponent(action)}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to process attention action');
    return response.json();
  }

  public static async getAutomationMetrics(): Promise<AutomationMetrics> {
    const response = await fetch(`${API_BASE}/automation/metrics`);
    if (!response.ok) {
      return {
        automationScore: 94,
        processedTodayCount: 127,
        reconciledCount: 14,
        categorizedCount: 28,
        alertsCount: 3,
        activeRulesCount: 5,
      };
    }
    return response.json();
  }

  public static async getAutomationRules(): Promise<AutomationRule[]> {
    const response = await fetch(`${API_BASE}/automation/rules`);
    if (!response.ok) return [];
    return response.json();
  }

  public static async toggleAutomationRule(ruleId: string, active: boolean): Promise<AutomationRule> {
    const response = await fetch(`${API_BASE}/automation/rules/${encodeURIComponent(ruleId)}/toggle?active=${active}`, {
      method: 'PUT',
    });
    if (!response.ok) throw new Error('Failed to toggle rule');
    return response.json();
  }

  public static async getBankReconciliations(status?: string): Promise<BankReconciliation[]> {
    const url = status ? `${API_BASE}/automation/reconciliations?status=${encodeURIComponent(status)}` : `${API_BASE}/automation/reconciliations`;
    const response = await fetch(url);
    if (!response.ok) return [];
    return response.json();
  }

  public static async confirmBankReconciliation(reconId: string): Promise<BankReconciliation> {
    const response = await fetch(`${API_BASE}/automation/reconciliations/${encodeURIComponent(reconId)}/confirm`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to confirm reconciliation');
    return response.json();
  }

  public static async getAuditLogs(): Promise<AuditLog[]> {
    const response = await fetch(`${API_BASE}/automation/audit-trail`);
    if (!response.ok) return [];
    return response.json();
  }

  public static async queryAssistant(query: string): Promise<AssistantQueryResponse> {
    const response = await fetch(`${API_BASE}/automation/assistant/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) throw new Error('Failed to query assistant');
    return response.json();
  }

  public static async getGeneralLedger(): Promise<JournalEntry[]> {
    const response = await fetch(`${API_BASE}/automation/accountant/ledger`);
    if (!response.ok) return [];
    return response.json();
  }

  public static async getTrialBalance(): Promise<TrialBalance> {
    const response = await fetch(`${API_BASE}/automation/accountant/trial-balance`);
    if (!response.ok) throw new Error('Failed to fetch trial balance');
    return response.json();
  }
}

// Export models for Invoices, Documents & Payroll
export interface InvoiceLineItem {
  id?: string;
  name: string;
  description?: string;
  hsn: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxRate: number;
  amount?: number;
}

export interface Invoice {
  id: string;
  client: string;
  clientEmail?: string;
  clientGstin?: string;
  date: string;
  due: string;
  subtotal: number;
  taxAmount: number;
  amount: number;
  status: 'Paid' | 'Sent' | 'Overdue' | 'Draft';
  items: InvoiceLineItem[];
  notes?: string;
  createdAt?: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  category: string;
  uploadedBy: string;
  date: string;
  size: string;
  verified: boolean;
  checksum?: string;
  notes?: string;
}

export interface PayrollEmployee {
  id: string;
  name: string;
  designation: string;
  department: string;
  gross: number;
  deductions: number;
  net: number;
  bankAcc?: string;
  pan?: string;
  uan?: string;
  status: 'Paid' | 'Processing' | string;
  lastPayDate?: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  month: string;
  gross: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  pf: number;
  pt: number;
  tds: number;
  totalDeductions: number;
  net: number;
  netInWords: string;
  bankAcc: string;
  pan: string;
  uan: string;
  status: string;
}

