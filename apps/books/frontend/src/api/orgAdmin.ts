/**
 * The organization admin panel (/org-admin): one organization managed by its
 * panel admins, who have their own logins (created by the platform
 * administrator) and their own session (see orgPanelClient.ts).
 */
import type { AppContent } from './appContent';
import { orgPanelClient, orgPanelRefresh, orgPanelRequest } from './orgPanelClient';
import type { OrgAppContent, OrgApprovalStatus } from './platform';
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

export interface OrgAdminDashboard {
  organization: { id: string; name: string; createdAt: string; approvalStatus: OrgApprovalStatus };
  users: {
    total: number;
    active: number;
    inactive: number;
    pendingInvites: number;
    byRole: Record<string, number>;
    signedInLast30Days: number;
  };
  /** Newest first, at most five. */
  recentUsers: User[];
  /** Newest first, at most ten. */
  recentActivity: AuditLog[];
  activityLast7Days: number;
  appContent: { customizedFields: number; disabledModules: string[] };
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
  dashboard: (signal?: AbortSignal) => orgPanelClient.get<OrgAdminDashboard>('/org-admin/dashboard', undefined, signal),
  /** This organization's copy of the app content; `shared` is what it falls back to. */
  appContent: {
    get: (signal?: AbortSignal) => orgPanelClient.get<OrgAppContent>('/org-admin/app-content', undefined, signal),
    update: (body: AppContent) => orgPanelClient.put<OrgAppContent>('/org-admin/app-content', body),
    reset: () => orgPanelClient.post<OrgAppContent>('/org-admin/app-content/reset'),
  },
};
