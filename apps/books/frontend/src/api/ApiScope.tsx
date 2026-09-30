/**
 * An injectable data-access scope for the organization-management screens
 * (users, organization profile, activity log) that both the tenant app's
 * Settings and the organization admin panel (/org-admin) render.
 *
 * Without a provider the scope is the tenant `api` client with no path
 * prefix, which is exactly what those screens always used, so the tenant app
 * is unchanged. The panel mounts an `ApiScopeProvider` backed by its own
 * client (orgPanelClient) and the '/org-admin' prefix, and switches off what
 * its backend does not offer via `capabilities`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { api } from './client';
import type { AuditLog, Message, Organization, Page, User } from './types';

type Query = Record<string, string | number | boolean | undefined | null>;

/** The subset of an HTTP client the scoped screens need. */
export interface ScopedClient {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => Promise<T>;
  post: <T>(path: string, body?: unknown, query?: Query) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
}

export interface ApiScopeCapabilities {
  /** Per-user dashboard modal (GET /users/{id}/dashboard) and its PDF export. */
  userDashboard: boolean;
  /** Inviting with the portal-only "employee" role (needs the payroll employee list). */
  employeeInvites: boolean;
}

export interface ApiScopeValue {
  client: ScopedClient;
  /** Prepended to every path, e.g. '/org-admin' → '/org-admin/users'. */
  prefix: string;
  capabilities: ApiScopeCapabilities;
  /**
   * Who is acting. `null` means the signed-in tenant user (useAuth). The panel
   * passes its own: a panel admin is an administrator but not one of the
   * organization's users.
   */
  actor: { userId: string | null; isAdmin: boolean } | null;
  /** Runs after the organization profile is saved (the tenant app refreshes its session copy). */
  onOrganizationSaved?: () => void | Promise<void>;
}

const TENANT_SCOPE: ApiScopeValue = {
  client: api,
  prefix: '',
  capabilities: { userDashboard: true, employeeInvites: true },
  actor: null,
};

const ApiScopeContext = createContext<ApiScopeValue>(TENANT_SCOPE);

export function ApiScopeProvider({ value, children }: { value: ApiScopeValue; children: ReactNode }) {
  return <ApiScopeContext.Provider value={value}>{children}</ApiScopeContext.Provider>;
}

export function useApiScope(): ApiScopeValue {
  return useContext(ApiScopeContext);
}

/**
 * Organization management calls (same paths and shapes as `orgApi`), routed
 * through the current scope. The per-user dashboard stays on `orgApi`: it is
 * tenant-only and gated by `capabilities.userDashboard`.
 */
export function useScopedOrgApi() {
  const { client, prefix } = useApiScope();
  return useMemo(
    () => ({
      get: () => client.get<Organization>(`${prefix}/organization`),
      update: (body: Partial<Organization>) => client.put<Organization>(`${prefix}/organization`, body),
      users: () => client.get<User[]>(`${prefix}/users`),
      inviteUser: (body: { name: string; email: string; role: string; employeeId?: string }) =>
        client.post<User>(`${prefix}/users`, body),
      updateUser: (id: string, body: { name?: string; role?: string; isActive?: boolean }) =>
        client.patch<User>(`${prefix}/users/${id}`, body),
      deleteUser: (id: string) => client.delete<Message>(`${prefix}/users/${id}`),
      resetUserPassword: (id: string, newPassword: string) =>
        client.post<Message>(`${prefix}/users/${id}/reset-password`, undefined, { new_password: newPassword }),
      auditLogs: (query?: Query) => client.get<Page<AuditLog>>(`${prefix}/audit-logs`, query),
    }),
    [client, prefix],
  );
}
