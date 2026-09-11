import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { LoadingBlock } from '@/components/ui/Feedback';
import type { Role } from '@/api/types';

import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <LoadingBlock label="Restoring your session…" />;
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireGuest() {
  const { user, isEmployee, initializing } = useAuth();
  if (initializing) return <LoadingBlock label="Loading…" />;
  if (user) return <Navigate to={isEmployee ? '/portal' : '/dashboard'} replace />;
  return <Outlet />;
}

/**
 * Wraps the main application (AppLayout and everything under it). Employee is
 * a portal-only role, so it redirects there instead of rendering the app -
 * the backend enforces the same boundary on every request regardless.
 */
export function RequireMainApp() {
  const { isEmployee } = useAuth();
  if (isEmployee) return <Navigate to="/portal" replace />;
  return <Outlet />;
}

/** The mirror image of RequireMainApp: only Employee belongs on the portal. */
export function RequireEmployeePortal() {
  const { isEmployee } = useAuth();
  if (!isEmployee) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...roles)) {
    return (
      <div className="state-block state-empty">
        <h3>You do not have access to this page</h3>
        <p>Ask an administrator in your organization if you need access.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Hides an action (rather than a whole page) from read-only users. */
export function IfCanWrite({ children }: { children: ReactNode }) {
  const { canWrite } = useAuth();
  return canWrite ? <>{children}</> : null;
}
