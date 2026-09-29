/**
 * Typed wrappers and response shapes for the platform (super-admin) API.
 * All JSON is camelCase; query params are snake_case. See platformClient.ts.
 */
import { platformClient, platformDownload, platformRefresh, platformRequest } from './platformClient';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface PlatformPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type PlatformRole = 'admin' | 'staff' | 'viewer';

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface PlatformAuthResponse {
  accessToken: string;
  admin: PlatformAdmin;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface ChartPoint {
  label: string;
  value: number;
}

export interface OrgSummary {
  id: string;
  name: string;
  isSuspended: boolean;
  userCount: number;
  invoiceCount: number;
  invoicedAmount: number;
  collectedAmount: number;
  createdAt: string;
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface PlatformAudit {
  id: string;
  organizationId: string;
  organizationName: string;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  createdAt: string;
}

export interface PlatformDashboard {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  totalInvoices: number;
  totalInvoicedAmount: number;
  totalCollectedAmount: number;
  totalBills: number;
  totalPaidToVendors: number;
  newOrganizationsThisMonth: number;
  organizationGrowth: ChartPoint[];
  revenueByMonth: ChartPoint[];
  topOrganizations: OrgSummary[];
  recentActivity: PlatformAudit[];
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export interface OrgDetail {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  country: string;
  currency: string;
  isSuspended: boolean;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
  userCount: number;
  invoiceCount: number;
  billCount: number;
  contactCount: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingReceivables: number;
  admins: PlatformUser[];
}

export interface CreateOrganizationBody {
  name: string;
  gstin?: string;
  currency?: string;
  country?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface CreateOrganizationResult {
  organization: OrgDetail;
  admin: PlatformUser;
}

export interface UpdateOrganizationBody {
  name?: string;
  isSuspended?: boolean;
  suspendedReason?: string;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface CreateUserBody {
  organizationId: string;
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
}

export interface UpdateUserBody {
  name?: string;
  role?: PlatformRole;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentKind = 'received' | 'made';

export interface PlatformPayment {
  id: string;
  kind: PaymentKind;
  number: string;
  organizationId: string;
  organizationName: string;
  contactName: string;
  amount: number;
  mode?: string | null;
  date?: string | null;
  createdAt: string;
}

export interface PlatformPaymentStats {
  totalReceived: number;
  totalMade: number;
  receivedCount: number;
  madeCount: number;
}

export interface Message {
  message: string;
}

// ---------------------------------------------------------------------------
// Admins (other super-admins)
// ---------------------------------------------------------------------------

export interface CreateAdminBody {
  name: string;
  email: string;
  password: string;
}

export interface UpdateAdminBody {
  name?: string;
  isActive?: boolean;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface PlatformSettings {
  allowPublicSignup: boolean;
  environment: string;
  razorpayConfigured: boolean;
  smtpConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

export interface SearchResults {
  organizations: OrgSummary[];
  users: PlatformUser[];
}

// ---------------------------------------------------------------------------
// Org drill-down: invoices
// ---------------------------------------------------------------------------

export interface PlatformInvoice {
  id: string;
  number: string;
  customerName: string;
  date: string;
  dueDate: string;
  status: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

// ---------------------------------------------------------------------------
// Impersonation ("View as")
// ---------------------------------------------------------------------------

export interface ImpersonateResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const platformApi = {
  auth: {
    login: (body: { email: string; password: string }) =>
      platformRequest<PlatformAuthResponse>('/platform/auth/login', { method: 'POST', body, retryOnUnauthorized: false }),
    refresh: () => platformRefresh<PlatformAuthResponse>(),
    logout: () => platformClient.post<Message>('/platform/auth/logout'),
    me: (signal?: AbortSignal) => platformClient.get<PlatformAdmin>('/platform/me', undefined, signal),
    changePassword: (body: ChangePasswordBody) =>
      platformClient.post<Message>('/platform/auth/change-password', body),
  },

  dashboard: (signal?: AbortSignal) => platformClient.get<PlatformDashboard>('/platform/dashboard', undefined, signal),

  admins: {
    list: (
      query: { page?: number; page_size?: number; search?: string },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<PlatformAdmin>>('/platform/admins', query, signal),
    create: (body: CreateAdminBody) => platformClient.post<PlatformAdmin>('/platform/admins', body),
    update: (id: string, body: UpdateAdminBody) => platformClient.patch<PlatformAdmin>(`/platform/admins/${id}`, body),
    remove: (id: string) => platformClient.delete<Message>(`/platform/admins/${id}`),
  },

  settings: {
    get: (signal?: AbortSignal) => platformClient.get<PlatformSettings>('/platform/settings', undefined, signal),
    update: (body: { allowPublicSignup: boolean }) => platformClient.put<PlatformSettings>('/platform/settings', body),
  },

  search: (q: string, signal?: AbortSignal) =>
    platformClient.get<SearchResults>('/platform/search', { q }, signal),

  organizations: {
    list: (
      query: { page?: number; page_size?: number; search?: string; status?: string },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<OrgSummary>>('/platform/organizations', query, signal),
    get: (id: string, signal?: AbortSignal) => platformClient.get<OrgDetail>(`/platform/organizations/${id}`, undefined, signal),
    create: (body: CreateOrganizationBody) => platformClient.post<CreateOrganizationResult>('/platform/organizations', body),
    update: (id: string, body: UpdateOrganizationBody) => platformClient.patch<OrgDetail>(`/platform/organizations/${id}`, body),
    remove: (id: string) => platformClient.delete<Message>(`/platform/organizations/${id}`),
    users: (
      id: string,
      query: { page?: number; page_size?: number },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<PlatformUser>>(`/platform/organizations/${id}/users`, query, signal),
    invoices: (
      id: string,
      query: { page?: number; page_size?: number },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<PlatformInvoice>>(`/platform/organizations/${id}/invoices`, query, signal),
    exportCsv: (query: { search?: string; status?: string }) =>
      platformDownload('/platform/organizations/export', 'organizations.csv', query),
  },

  users: {
    list: (
      query: { page?: number; page_size?: number; search?: string; organization_id?: string },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<PlatformUser>>('/platform/users', query, signal),
    create: (body: CreateUserBody) => platformClient.post<PlatformUser>('/platform/users', body),
    update: (id: string, body: UpdateUserBody) => platformClient.patch<PlatformUser>(`/platform/users/${id}`, body),
    resetPassword: (id: string, newPassword: string) =>
      platformClient.post<Message>(`/platform/users/${id}/reset-password`, { newPassword }),
    remove: (id: string) => platformClient.delete<Message>(`/platform/users/${id}`),
    impersonate: (id: string) => platformClient.post<ImpersonateResponse>(`/platform/users/${id}/impersonate`),
    exportCsv: (query: { search?: string; organization_id?: string }) =>
      platformDownload('/platform/users/export', 'users.csv', query),
  },

  payments: {
    list: (
      query: { page?: number; page_size?: number; organization_id?: string; kind?: string },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<PlatformPayment>>('/platform/payments', query, signal),
    stats: (signal?: AbortSignal) => platformClient.get<PlatformPaymentStats>('/platform/payments/stats', undefined, signal),
    exportCsv: (query: { organization_id?: string; kind?: string }) =>
      platformDownload('/platform/payments/export', 'payments.csv', query),
  },

  auditLogs: (
    query: { page?: number; page_size?: number; organization_id?: string },
    signal?: AbortSignal,
  ) => platformClient.get<PlatformPage<PlatformAudit>>('/platform/audit-logs', query, signal),
};
