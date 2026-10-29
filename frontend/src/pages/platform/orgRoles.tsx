/**
 * An organization's custom roles, seen from the super admin: the same Roles
 * screens the organization's admins use, routed to
 * /platform/organizations/{id}/roles through an ApiScope.
 */
import { useMemo, type ReactNode } from 'react';

import { ApiScopeProvider, type ApiScopeValue, type OrgRole } from '@/api/ApiScope';
import { platformClient } from '@/api/platformClient';
import { useAsync } from '@/hooks/useAsync';
import { RolesSettings } from '@/pages/settings/RolesSettings';

/** Role select value for "make a new one". */
export const NEW_ROLE = '__new_role__';

function scopeFor(orgId: string): ApiScopeValue {
  return {
    client: platformClient,
    prefix: `/platform/organizations/${orgId}`,
    capabilities: { userDashboard: false, employeeInvites: false, customRoles: true },
    actor: { userId: null, isAdmin: true },
  };
}

export function OrgRoleScope({ orgId, children }: { orgId: string; children: ReactNode }) {
  const value = useMemo(() => scopeFor(orgId), [orgId]);
  return <ApiScopeProvider value={value}>{children}</ApiScopeProvider>;
}

/** The organization's custom roles (empty while no organization is chosen). */
export function useOrgRoles(orgId: string) {
  return useAsync(
    (signal) => (orgId ? platformClient.get<OrgRole[]>(`/platform/organizations/${orgId}/roles`, undefined, signal) : Promise.resolve([])),
    [orgId],
  );
}

/** Role options: the three built-in roles, the organization's own, then "Create a custom role…". */
export function roleOptions(roles: OrgRole[], canCreate: boolean) {
  return [
    { value: 'admin', label: 'Administrator' },
    { value: 'staff', label: 'Staff' },
    { value: 'viewer', label: 'Viewer' },
    ...roles.map((r) => ({ value: `custom:${r.id}`, label: `${r.name} (custom role)` })),
    ...(canCreate ? [{ value: NEW_ROLE, label: '＋ Create a custom role…' }] : []),
  ];
}

/** Splits a role select value into the API's role + customRoleId. */
export function splitRole(value: string): { role: 'admin' | 'staff' | 'viewer' | 'custom'; customRoleId?: string } {
  if (value.startsWith('custom:')) return { role: 'custom', customRoleId: value.slice('custom:'.length) };
  return { role: value as 'admin' | 'staff' | 'viewer' };
}

/** The Roles tab of the organization drawer. */
export function OrgRolesTab({ orgId }: { orgId: string }) {
  return (
    <OrgRoleScope orgId={orgId}>
      <RolesSettings onChanged={() => undefined} />
    </OrgRoleScope>
  );
}

/** Opens the role editor straight away; hands back the new role, or null when cancelled. */
export function CreateOrgRole({ orgId, onDone }: { orgId: string; onDone: (role: OrgRole | null) => void }) {
  return (
    <OrgRoleScope orgId={orgId}>
      <div hidden>
        <RolesSettings onChanged={() => undefined} newRoleSignal={1} onCreatedFromRequest={onDone} onRequestClosed={() => onDone(null)} />
      </div>
    </OrgRoleScope>
  );
}
