/**
 * The organization admin panel (/org-admin): one organization managed by its
 * panel admins, who have their own logins (created by the platform
 * administrator) and their own session (see orgPanelClient.ts).
 */
import { orgPanelClient, orgPanelRefresh, orgPanelRequest } from './orgPanelClient';
import type { IntegrationStatus, SyncResponse } from './razorpay';
import type { AuditLog, Message, User } from './types';

/** A login for the organization admin panel (not one of the organization's users). */
export interface OrgPanelAdmin {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface OrgPanelSession {
  admin: OrgPanelAdmin;
  organization: { id: string; name: string };
}

export interface OrgPanelAuthResponse extends OrgPanelSession {
  accessToken: string;
}

/** People in the organization at a glance (GET /org-admin/dashboard). */
export interface OrgAdminDashboard {
  organizationName: string;
  users: {
    total: number;
    active: number;
    suspended: number;
    pendingInvites: number;
    byRole: Record<string, number>;
    signedInLast30Days: number;
  };
  employees: {
    total: number;
    active: number;
    inactive: number;
    withLogin: number;
    joinedLast30Days: number;
    byDepartment: Record<string, number>;
  };
  recentUsers: User[];
  recentEmployees: Array<{
    id: string;
    employeeCode: string;
    name: string;
    designation?: string | null;
    department?: string | null;
    dateOfJoining: string;
    isActive: boolean;
    hasLogin: boolean;
  }>;
  recentActivity: AuditLog[];
  activityLast7Days: number;
}

/** Everything about one user (GET /org-admin/users/{id}/overview). */
export interface OrgAdminUserOverview {
  user: User;
  /** Modules of the accepted plan; null = every module (trial, or no plan). */
  planModules?: string[] | null;
  employee: {
    id: string;
    employeeCode: string;
    designation?: string | null;
    department?: string | null;
    dateOfJoining: string;
    isActive: boolean;
    leaveDaysThisYear: number;
    payslips: number;
    lastNetPay?: number | null;
    lastPayPeriod?: string | null;
  } | null;
  performance: {
    invoicesRaised: number;
    invoicedAmount: number;
    collectedAmount: number;
    invoicesLast30Days: number;
    billsRecorded: number;
    billsAmount: number;
    expensesRecorded: number;
    expensesAmount: number;
    hoursLogged: number;
    hoursLast30Days: number;
    billableHours: number;
    actionsLast30Days: number;
    lastActive?: string | null;
  };
  pending: {
    invitePending: boolean;
    draftInvoices: number;
    openInvoices: number;
    overdueInvoices: number;
    outstandingAmount: number;
    draftBills: number;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      customerName?: string | null;
      dueDate: string;
      status: string;
      total: number;
      balanceDue: number;
    }>;
    bills: Array<{ id: string; billNumber: string; vendorName?: string | null; dueDate: string; total: number }>;
  };
  recentActivity: AuditLog[];
}

export const orgAdminApi = {
  auth: {
    login: (body: { email: string; password: string }) =>
      orgPanelRequest<OrgPanelAuthResponse>('/org-admin/auth/login', { method: 'POST', body, retryOnUnauthorized: false }),
    refresh: () => orgPanelRefresh<OrgPanelAuthResponse>(),
    logout: () => orgPanelRequest<Message>('/org-admin/auth/logout', { method: 'POST', retryOnUnauthorized: false }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      orgPanelClient.post<Message>('/org-admin/auth/change-password', body),
  },
  me: (signal?: AbortSignal) => orgPanelClient.get<OrgPanelSession>('/org-admin/me', undefined, signal),
  /** Razorpay for this organization: status and sync only (the keys are the platform admin's). */
  razorpay: {
    status: () => orgPanelClient.get<IntegrationStatus>('/org-admin/integrations/razorpay'),
    sync: (full: boolean) => orgPanelClient.post<SyncResponse>('/org-admin/integrations/razorpay/sync', { full }),
  },
  dashboard: (signal?: AbortSignal) => orgPanelClient.get<OrgAdminDashboard>('/org-admin/dashboard', undefined, signal),
  updateUserRole: (userId: string, role: string) => orgPanelClient.patch<User>(`/org-admin/users/${userId}`, { role }),
  /** `modules: null` lifts the restriction (every module of the plan). */
  setModuleAccess: (userId: string, modules: string[] | null) =>
    orgPanelClient.put<User>(`/org-admin/users/${userId}/module-access`, { modules }),
  userOverview: (userId: string, signal?: AbortSignal) =>
    orgPanelClient.get<OrgAdminUserOverview>(`/org-admin/users/${userId}/overview`, undefined, signal),
};
