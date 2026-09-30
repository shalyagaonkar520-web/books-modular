import { useMemo } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { ApiScopeProvider, type ApiScopeValue } from '@/api/ApiScope';
import { orgPanelClient } from '@/api/orgPanelClient';
import { OrgPanelAuthProvider, useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { OrgAdminLayout } from '@/components/layout/OrgAdminLayout';
import { LoadingBlock } from '@/components/ui/Feedback';
import { AppContentPage } from '@/pages/platform/AppContentPage';

import { OrgAdminDashboardPage } from './OrgAdminDashboardPage';
import { OrgAdminLoginPage } from './OrgAdminLoginPage';
import { OrgAdminSettingsPage } from './OrgAdminSettingsPage';
import { OrgAdminUsersPage } from './OrgAdminUsersPage';

/** Only signed-in panel admins get past this; everyone else goes to the panel's own sign-in. */
function RequireOrgPanelAuth() {
  const { admin } = useOrgPanelAuth();
  if (!admin) return <Navigate to="/org-admin/login" replace />;
  return <Outlet />;
}

/**
 * The shared users / organization / activity screens, pointed at the panel's
 * endpoints and session. What the panel backend does not offer (per-user
 * dashboards and their PDF, employee invites that need payroll) is switched off.
 */
function OrgPanelApiScope() {
  const { refreshMe } = useOrgPanelAuth();
  const scope = useMemo<ApiScopeValue>(
    () => ({
      client: orgPanelClient,
      prefix: '/org-admin',
      capabilities: { userDashboard: false, employeeInvites: false },
      actor: { userId: null, isAdmin: true },
      onOrganizationSaved: refreshMe,
    }),
    [refreshMe],
  );
  return (
    <ApiScopeProvider value={scope}>
      <Outlet />
    </ApiScopeProvider>
  );
}

function OrgAdminRoutes() {
  const { admin, initializing } = useOrgPanelAuth();

  if (initializing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingBlock label="Restoring your session…" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="login" element={admin ? <Navigate to="/org-admin" replace /> : <OrgAdminLoginPage />} />

      <Route element={<RequireOrgPanelAuth />}>
        <Route element={<OrgPanelApiScope />}>
          <Route element={<OrgAdminLayout />}>
            <Route index element={<OrgAdminDashboardPage />} />
            <Route path="users" element={<OrgAdminUsersPage />} />
            <Route path="app-content" element={<AppContentPage mode="organization" />} />
            <Route path="settings" element={<OrgAdminSettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/org-admin" replace />} />
    </Routes>
  );
}

/**
 * Routes under /org-admin: a self-contained panel with its own logins (created
 * by the platform administrator) and its own session. Needs no tenant session.
 */
export function OrgAdminApp() {
  return (
    <OrgPanelAuthProvider>
      <OrgAdminRoutes />
    </OrgPanelAuthProvider>
  );
}
