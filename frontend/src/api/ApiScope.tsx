/**
 * An injectable data-access scope for the organization-management screens
 * (users, roles, organization profile, activity log) that the Admin console
 * (/admin) and the super admin's organization drawer render.
 *
 * Without a provider the scope is the tenant `api` client with no path
 * prefix. The Admin console switches on everything its admins may use via
 * `capabilities`; the super admin's drawer points it at
 * /platform/organizations/{id} with its own client.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { api } from './client';
import type { AuditLog, Message, Organization, Page, User } from './types';
import type { AccessLevel } from '@/utils/permissions';

/** A custom role of the organization: No access / View / Edit per feature. */
export interface OrgRole {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, AccessLevel>;
  userCount: number;
}

export interface OrgRoleInput {
  name: string;
  description?: string | null;
  permissions: Record<string, AccessLevel>;
}

/** One feature a role can give access to (GET /roles/catalog). */
export interface RoleFeature {
  key: string;
  label: string;
  group: string;
}

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
  /** Inviting staff with a custom set of editable modules (GET {prefix}/plan-modules). */
  customInvites?: boolean;
  /** The organization's own roles (No access / View / Edit per feature), GET/POST {prefix}/roles. */
  customRoles?: boolean;
}

export interface ApiScopeValue {
  client: ScopedClient;
  /** Prepended to every path, e.g. '/org-admin' → '/org-admin/users'. */
  prefix: string;
  capabilities: ApiScopeCapabilities;
  /**
   * Who is acting. `null` means the signed-in tenant user (useAuth). The super
   * admin passes its own: an administrator who is not one of the
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
      planModules: () => client.get<{ planModules: string[] | null }>(`${prefix}/plan-modules`),
      inviteUser: (body: {
        name: string;
        email: string;
        role: string;
        employeeId?: string;
        moduleAccess?: string[];
        customRoleId?: string;
        reviewScope?: string[];
      }) =>
        client.post<User>(`${prefix}/users`, body),
      updateUser: (id: string, body: { name?: string; role?: string; isActive?: boolean; customRoleId?: string | null; reviewScope?: string[] }) =>
        client.patch<User>(`${prefix}/users/${id}`, body),
      roles: () => client.get<OrgRole[]>(`${prefix}/roles`),
      roleCatalog: () => client.get<RoleFeature[]>(`${prefix}/roles/catalog`),
      createRole: (body: OrgRoleInput) => client.post<OrgRole>(`${prefix}/roles`, body),
      updateRole: (id: string, body: OrgRoleInput) => client.put<OrgRole>(`${prefix}/roles/${id}`, body),
      deleteRole: (id: string) => client.delete<Message>(`${prefix}/roles/${id}`),
      deleteUser: (id: string) => client.delete<Message>(`${prefix}/users/${id}`),
      resetUserPassword: (id: string, newPassword: string) =>
        client.post<Message>(`${prefix}/users/${id}/reset-password`, undefined, { new_password: newPassword }),
      auditLogs: (query?: Query) => client.get<Page<AuditLog>>(`${prefix}/audit-logs`, query),
    }),
    [client, prefix],
  );
}
