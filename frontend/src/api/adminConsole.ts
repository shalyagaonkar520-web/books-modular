/**
 * The Admin console (/admin): what an organization's admins run inside the
 * app - overview, users and roles, plan, the change log (every change with
 * old and new values), sign-in history and sessions, app content. Reviews
 * (/reviews) and Support (/support) are here too.
 */
import { api } from './client';
import type { AppContent } from './appContent';
import type { OrgAppContent } from './platform';
import type { AuditLog, Message, Page, User } from './types';

/** People in the organization at a glance (GET /admin/dashboard). */
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

/** Everything about one user (GET /admin/users/{id}/overview). */
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

/** One saved change: who, when, which record, and each field's [old, new]. */
export interface ChangeEntry {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  changes: Record<string, [unknown, unknown]>;
  createdAt: string;
  /** reviewed = approved, hold = on hold, flagged = a message sent to the maker. */
  reviewStatus?: 'reviewed' | 'hold' | 'flagged' | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  /** The maker's answer to the reviewer's message. */
  reviewReply?: string | null;
  reviewReplyAt?: string | null;
}

export interface ChangeQuery {
  page?: number;
  page_size?: number;
  user_id?: string;
  entity_type?: string;
  action?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface LoginEvent {
  id: string;
  userId?: string | null;
  userName?: string | null;
  email: string;
  success: boolean;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface SignedInSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SecuritySummary {
  signInsToday: number;
  failedToday: number;
  failedLast7Days: number;
  signedInSessions: number;
  usersSignedIn: number;
}

export interface ReviewSummary {
  waiting: number;
  hold: number;
  flagged: number;
  reviewed: number;
  /** Whose work, e.g. ["Staff (role)", "Asha Rao"]; ["Everyone"] for an admin. */
  scope: string[];
}

export type ReviewStatus = 'waiting' | 'hold' | 'flagged' | 'reviewed' | 'all';
export type ReviewAction = 'reviewed' | 'hold' | 'flagged' | 'waiting';

export const adminConsoleApi = {
  appContent: {
    get: (signal?: AbortSignal) => api.get<OrgAppContent>('/admin/app-content', undefined, signal),
    update: (body: AppContent) => api.put<OrgAppContent>('/admin/app-content', body),
    reset: () => api.post<OrgAppContent>('/admin/app-content/reset'),
  },
  dashboard: (signal?: AbortSignal) => api.get<OrgAdminDashboard>('/admin/dashboard', undefined, signal),
  updateUserRole: (userId: string, role: string) => api.patch<User>(`/users/${userId}`, { role }),
  /** `modules: null` lifts the restriction (every module of the plan). */
  setModuleAccess: (userId: string, modules: string[] | null) => api.put<User>(`/admin/users/${userId}/module-access`, { modules }),
  userOverview: (userId: string, signal?: AbortSignal) =>
    api.get<OrgAdminUserOverview>(`/admin/users/${userId}/overview`, undefined, signal),
  changes: (query: ChangeQuery, signal?: AbortSignal) => api.get<Page<ChangeEntry>>('/admin/changes', { ...query }, signal),
  changeTypes: (signal?: AbortSignal) => api.get<string[]>('/admin/changes/types', undefined, signal),
  recordHistory: (entityType: string, entityId: string) => api.get<ChangeEntry[]>(`/admin/changes/${entityType}/${entityId}`),
  security: {
    summary: (signal?: AbortSignal) => api.get<SecuritySummary>('/admin/security/summary', undefined, signal),
    logins: (query: { page?: number; page_size?: number; user_id?: string; failed_only?: boolean }, signal?: AbortSignal) =>
      api.get<Page<LoginEvent>>('/admin/security/logins', { ...query }, signal),
    sessions: (signal?: AbortSignal) => api.get<SignedInSession[]>('/admin/security/sessions', undefined, signal),
    revokeSession: (id: string) => api.post<Message>(`/admin/security/sessions/${id}/revoke`),
    signOutEverywhere: (userId: string) => api.post<Message>(`/admin/security/users/${userId}/sign-out`),
  },
};

export const reviewsApi = {
  summary: (signal?: AbortSignal) => api.get<ReviewSummary>('/reviews/summary', undefined, signal),
  list: (query: ChangeQuery & { status: ReviewStatus }, signal?: AbortSignal) => api.get<Page<ChangeEntry>>('/reviews', { ...query }, signal),
  mark: (id: string, status: ReviewAction, note?: string) => api.post<ChangeEntry>(`/reviews/${id}`, { status, note }),
  markMany: (ids: string[], status: ReviewAction, note?: string) =>
    api.post<ChangeEntry[]>('/reviews/bulk', { ids, status, note }),
  /** My own changes a reviewer sent a message about or put on hold. */
  mine: (signal?: AbortSignal) => api.get<Page<ChangeEntry>>('/reviews/mine', { page_size: 50 }, signal),
  /** Answer the reviewer: the change goes back to their list. */
  reply: (id: string, message: string) => api.post<ChangeEntry>(`/reviews/mine/${id}/reply`, { message }),
};
