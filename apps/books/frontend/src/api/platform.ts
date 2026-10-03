/**
 * Typed wrappers and response shapes for the platform (super-admin) API.
 * All JSON is camelCase; query params are snake_case. See platformClient.ts.
 */
import { platformClient, platformDownload, platformRefresh, platformRequest } from './platformClient';
import type { AppContent } from './appContent';
import type { ConnectRazorpayPayload, ConnectRazorpayResponse, IntegrationStatus } from './razorpay';
import type { BillingCycle } from './modulePricing';
import type { SiteContent } from './siteContent';

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

/** Self-registered organizations may need a platform admin's approval first. */
export type OrgApprovalStatus = 'approved' | 'pending' | 'rejected';

/** An organization's app content: what its users see, the shared copy beneath it, and what it customizes. */
export interface OrgAppContent {
  organizationId: string;
  organizationName: string;
  content: AppContent;
  shared: AppContent;
  overridden: { branding: string[]; modules: string[]; texts: string[] };
}

/** Trial → (plan approved) active; a trial that runs out without a plan is expired. */
export type OrgSubscriptionStatus = 'trial' | 'active' | 'expired';

/** An organization's plan: chosen modules and billing cycle, priced. */
export interface OrgPlan {
  modules: string[];
  billingCycle: BillingCycle;
  monthlyPrice: number;
  /** Price per billing cycle. */
  planPrice: number;
}

/** A plan the organization's admin asked for, waiting for a platform admin. */
export interface OrgPlanRequest extends OrgPlan {
  requestedAt: string;
}

/** Subscription fields carried by OrgSummary and OrgDetail (absent on older payloads). */
export interface OrgSubscriptionFields {
  subscriptionStatus?: OrgSubscriptionStatus | null;
  trialEndsAt?: string | null;
  plan?: OrgPlan | null;
  pendingRequest?: OrgPlanRequest | null;
  /** Operator-facing note, e.g. who approved the plan or why a request was rejected. */
  subscriptionNote?: string | null;
  /** Legacy (pre-subscription) module fields; may be absent. */
  requestedModules?: string[] | null;
  monthlyPrice?: number | null;
}

/** A row of GET /platform/subscription-requests. */
export interface SubscriptionRequestItem {
  organizationId: string;
  organizationName: string;
  requestedAt: string;
  modules: string[];
  billingCycle: BillingCycle;
  monthlyPrice: number;
  planPrice: number;
  subscriptionStatus: OrgSubscriptionStatus;
  trialEndsAt: string | null;
}

export interface ApproveSubscriptionBody {
  /** Omit to accept the request as sent. The server adds anything they require. */
  modules?: string[];
  billingCycle?: BillingCycle;
}

export interface OrgSummary extends OrgSubscriptionFields {
  id: string;
  name: string;
  isSuspended: boolean;
  /** Absent on older payloads, which predate approval — treat as approved. */
  approvalStatus?: OrgApprovalStatus;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  /** Email of the organization's first administrator (the registrant). */
  adminEmail?: string | null;
  /** Soft-deleted: users are locked out but the data is kept (restorable). */
  isArchived?: boolean;
  deletedAt?: string | null;
  /** Most recent sign-in by any user of the organization. */
  lastLoginAt?: string | null;
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
  archivedOrganizations?: number;
  totalUsers: number;
  activeUsers: number;
  totalInvoices: number;
  totalInvoicedAmount: number;
  totalCollectedAmount: number;
  totalBills: number;
  totalPaidToVendors: number;
  newOrganizationsThisMonth: number;
  /** Organizations waiting for approval. */
  pendingOrganizations?: number;
  /** Plan requests waiting for a decision, when the server reports it. */
  pendingSubscriptionRequests?: number;
  pendingApprovals?: OrgSummary[];
  organizationGrowth: ChartPoint[];
  revenueByMonth: ChartPoint[];
  topOrganizations: OrgSummary[];
  recentActivity: PlatformAudit[];
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export interface OrgDetail extends OrgSubscriptionFields {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  country: string;
  currency: string;
  fiscalYearStartMonth?: number;
  defaultTaxRate?: number | null;
  defaultPaymentTermsDays?: number | null;
  invoiceTerms?: string | null;
  invoiceNotes?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  isSuspended: boolean;
  approvalStatus?: OrgApprovalStatus;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  adminEmail?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  isArchived?: boolean;
  deletedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  userCount: number;
  invoiceCount: number;
  billCount: number;
  contactCount: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingReceivables: number;
  admins: PlatformUser[];
  /** Logins for the organization's admin panel. Absent on older payloads. */
  panelAdmins?: OrgPanelAdminItem[];
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
  legalName?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  /** 1 (January) – 12 (December). */
  fiscalYearStartMonth?: number;
  /** Percent, 0–100. */
  defaultTaxRate?: number;
  /** Days, 0–365. */
  defaultPaymentTermsDays?: number;
  invoiceTerms?: string | null;
  invoiceNotes?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  isSuspended?: boolean;
  suspendedReason?: string;
}

/** `status` filter accepted by GET /platform/organizations (default excludes archived, includes pending). */
export type OrgStatusFilter = 'active' | 'suspended' | 'pending' | 'rejected' | 'archived' | 'all';

export interface RejectOrganizationBody {
  reason?: string;
}

/** A login for an organization's admin panel (/org-admin), created by a platform admin. */
export interface OrgPanelAdminItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  /** Who created it (a platform admin's name or email), when known. */
  createdBy?: string | null;
}

export interface CreatePanelAdminBody {
  name: string;
  email: string;
  password: string;
}

export interface UpdatePanelAdminBody {
  name?: string;
  email?: string;
  isActive?: boolean;
  password?: string;
}

/** Approving (which starts the free trial) can create the organization's admin panel login in the same step. */
export interface ApproveOrganizationBody {
  panelAdmin?: CreatePanelAdminBody;
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
  email?: string;
  role?: PlatformRole;
  isActive?: boolean;
  organizationId?: string;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentKind = 'received' | 'made';

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
  /** New self-registered organizations wait for a platform admin to approve them. */
  requireOrgApproval?: boolean;
  environment: string;
  razorpayConfigured: boolean;
  smtpConfigured: boolean;
  /** Defaults applied to newly created organizations. */
  defaultTaxRate?: number;
  defaultPaymentTermsDays?: number;
  defaultCurrency?: string;
  /** Free-trial length for newly approved organizations (0 – 90 days). */
  trialDays?: number;
}

export interface UpdatePlatformSettingsBody {
  allowPublicSignup?: boolean;
  requireOrgApproval?: boolean;
  defaultTaxRate?: number;
  defaultPaymentTermsDays?: number;
  defaultCurrency?: string;
  trialDays?: number;
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

  /** The platform-wide Razorpay keys (shared by every organization). */
  razorpay: {
    status: () => platformClient.get<IntegrationStatus>('/platform/integrations/razorpay'),
    connect: (body: ConnectRazorpayPayload) => platformClient.post<ConnectRazorpayResponse>('/platform/integrations/razorpay/connect', body),
    disconnect: () =>
      platformClient.post<{ success: boolean; connected: boolean; message: string; status: IntegrationStatus }>(
        '/platform/integrations/razorpay/disconnect',
      ),
  },

  settings: {
    get: (signal?: AbortSignal) => platformClient.get<PlatformSettings>('/platform/settings', undefined, signal),
    update: (body: UpdatePlatformSettingsBody) => platformClient.put<PlatformSettings>('/platform/settings', body),
  },

  search: (q: string, signal?: AbortSignal) =>
    platformClient.get<SearchResults>('/platform/search', { q }, signal),

  organizations: {
    list: (
      query: { page?: number; page_size?: number; search?: string; status?: OrgStatusFilter | '' },
      signal?: AbortSignal,
    ) => platformClient.get<PlatformPage<OrgSummary>>('/platform/organizations', query, signal),
    get: (id: string, signal?: AbortSignal) => platformClient.get<OrgDetail>(`/platform/organizations/${id}`, undefined, signal),
    create: (body: CreateOrganizationBody) => platformClient.post<CreateOrganizationResult>('/platform/organizations', body),
    update: (id: string, body: UpdateOrganizationBody) => platformClient.patch<OrgDetail>(`/platform/organizations/${id}`, body),
    /** Soft delete: locks every user out but keeps the data. Reversible via restore. */
    archive: (id: string) => platformClient.post<OrgDetail>(`/platform/organizations/${id}/archive`),
    restore: (id: string) => platformClient.post<OrgDetail>(`/platform/organizations/${id}/restore`),
    approve: (id: string, body?: ApproveOrganizationBody) =>
      platformClient.post<OrgDetail>(`/platform/organizations/${id}/approve`, body),
    /** Logins for the organization's admin panel (/org-admin). */
    panelAdmins: {
      list: (orgId: string, signal?: AbortSignal) =>
        platformClient.get<OrgPanelAdminItem[]>(`/platform/organizations/${orgId}/panel-admins`, undefined, signal),
      create: (orgId: string, body: CreatePanelAdminBody) =>
        platformClient.post<OrgPanelAdminItem>(`/platform/organizations/${orgId}/panel-admins`, body),
      update: (id: string, body: UpdatePanelAdminBody) =>
        platformClient.patch<OrgPanelAdminItem>(`/platform/panel-admins/${id}`, body),
      remove: (id: string) => platformClient.delete<Message>(`/platform/panel-admins/${id}`),
    },
    reject: (id: string, body: RejectOrganizationBody = {}) =>
      platformClient.post<OrgDetail>(`/platform/organizations/${id}/reject`, body),
    /** PERMANENT delete — destroys the organization and all of its data. */
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

  /** Free trials, plan requests and plans. */
  subscriptions: {
    requests: (signal?: AbortSignal) =>
      platformClient.get<SubscriptionRequestItem[]>('/platform/subscription-requests', undefined, signal),
    /** Accept the pending request (optionally adjusted), or set a plan outright. */
    approve: (orgId: string, body: ApproveSubscriptionBody = {}) =>
      platformClient.post<OrgDetail>(`/platform/organizations/${encodeURIComponent(orgId)}/subscription/approve`, body),
    reject: (orgId: string, body: { reason: string }) =>
      platformClient.post<OrgDetail>(`/platform/organizations/${encodeURIComponent(orgId)}/subscription/reject`, body),
    /** Extend (or restart) the free trial by `days`. */
    extendTrial: (orgId: string, body: { days: number }) =>
      platformClient.post<OrgDetail>(`/platform/organizations/${encodeURIComponent(orgId)}/trial`, body),
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


  siteContent: {
    get: (signal?: AbortSignal) => platformClient.get<SiteContent>('/platform/site-content', undefined, signal),
    update: (body: SiteContent) => platformClient.put<SiteContent>('/platform/site-content', body),
    reset: () => platformClient.post<SiteContent>('/platform/site-content/reset'),
  },

  appContent: {
    get: (signal?: AbortSignal) => platformClient.get<AppContent>('/platform/app-content', undefined, signal),
    update: (body: AppContent) => platformClient.put<AppContent>('/platform/app-content', body),
    reset: () => platformClient.post<AppContent>('/platform/app-content/reset'),
    /** One organization's customized copy: only fields that differ from the shared content are stored. */
    org: {
      get: (orgId: string, signal?: AbortSignal) =>
        platformClient.get<OrgAppContent>(`/platform/organizations/${encodeURIComponent(orgId)}/app-content`, undefined, signal),
      update: (orgId: string, body: AppContent) =>
        platformClient.put<OrgAppContent>(`/platform/organizations/${encodeURIComponent(orgId)}/app-content`, body),
      reset: (orgId: string) => platformClient.post<OrgAppContent>(`/platform/organizations/${encodeURIComponent(orgId)}/app-content/reset`),
    },
  },

  auditLogs: (
    query: { page?: number; page_size?: number; organization_id?: string },
    signal?: AbortSignal,
  ) => platformClient.get<PlatformPage<PlatformAudit>>('/platform/audit-logs', query, signal),
};
