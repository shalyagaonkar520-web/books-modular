/**
 * The organization admin panel (/org-admin): an organization's own admin
 * managing only that organization, on the normal tenant session.
 */
import { api } from './client';
import type { AppContent } from './appContent';
import type { OrgAppContent, OrgApprovalStatus } from './platform';
import type { AuditLog, User } from './types';

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
  dashboard: (signal?: AbortSignal) => api.get<OrgAdminDashboard>('/org-admin/dashboard', undefined, signal),
  /** This organization's copy of the app content; `shared` is what it falls back to. */
  appContent: {
    get: (signal?: AbortSignal) => api.get<OrgAppContent>('/org-admin/app-content', undefined, signal),
    update: (body: AppContent) => api.put<OrgAppContent>('/org-admin/app-content', body),
    reset: () => api.post<OrgAppContent>('/org-admin/app-content/reset'),
  },
};
