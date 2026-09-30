import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { OrgAdminLayout } from '@/components/layout/OrgAdminLayout';
import { AppContentPage } from '@/pages/platform/AppContentPage';

import { OrgAdminDashboardPage } from './OrgAdminDashboardPage';
import { OrgAdminSettingsPage } from './OrgAdminSettingsPage';
import { OrgAdminUsersPage } from './OrgAdminUsersPage';

/** The panel is for the organization's own admins; everyone else goes back to the app. */
export function RequireOrgAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Routes under /org-admin. Mounted behind RequireAuth + RequireMainApp, on the normal tenant session. */
export function OrgAdminApp() {
  return (
    <Routes>
      <Route element={<RequireOrgAdmin />}>
        <Route element={<OrgAdminLayout />}>
          <Route index element={<OrgAdminDashboardPage />} />
          <Route path="users" element={<OrgAdminUsersPage />} />
          <Route path="app-content" element={<AppContentPage mode="organization" />} />
          <Route path="settings" element={<OrgAdminSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/org-admin" replace />} />
    </Routes>
  );
}
