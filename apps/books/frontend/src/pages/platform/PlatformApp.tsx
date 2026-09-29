import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { usePlatformAuth } from '@/auth/PlatformAuthContext';
import { PlatformLayout } from '@/components/layout/PlatformLayout';
import { LoadingBlock } from '@/components/ui/Feedback';

import { AuditLogsPage } from './AuditLogsPage';
import { OrganizationsPage } from './OrganizationsPage';
import { PaymentsPage } from './PaymentsPage';
import { PlatformDashboardPage } from './PlatformDashboardPage';
import { PlatformLoginPage } from './PlatformLoginPage';
import { UsersPage } from './UsersPage';

function RequirePlatformAuth() {
  const { admin } = usePlatformAuth();
  if (!admin) return <Navigate to="/platform/login" replace />;
  return <Outlet />;
}

export function PlatformApp() {
  const { admin, initializing } = usePlatformAuth();

  if (initializing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingBlock label="Restoring your session…" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="login" element={admin ? <Navigate to="/platform" replace /> : <PlatformLoginPage />} />

      <Route element={<RequirePlatformAuth />}>
        <Route element={<PlatformLayout />}>
          <Route index element={<PlatformDashboardPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
}
