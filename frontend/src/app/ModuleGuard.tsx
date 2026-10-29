import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { moduleForPath } from '@/api/appContent';
import { useAuth } from '@/auth/AuthContext';
import { featureForPath } from '@/utils/permissions';
import { useToast } from '@/components/ui/Toast';

import { useAppContent } from './AppContentContext';

/**
 * Layout route around the tenant pages: a module the platform administrator
 * has switched off redirects to the dashboard (with a toast) instead of rendering.
 */
export function ModuleGuard() {
  const { pathname } = useLocation();
  const { isModuleEnabled, t } = useAppContent();
  const toast = useToast();
  const { access } = useAuth();
  const module = moduleForPath(pathname);
  const moduleOff = module !== null && !isModuleEnabled(module);
  // A custom role with No access to this page's feature.
  const roleBlocked = access(featureForPath(pathname)) === 'none';
  const blocked = moduleOff || roleBlocked;
  const notifiedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!blocked) {
      notifiedFor.current = null;
      return;
    }
    if (notifiedFor.current === pathname) return;
    notifiedFor.current = pathname;
    toast.notify(t(moduleOff ? 'common.moduleOff' : 'common.noRoleAccess'), 'warning');
  }, [blocked, moduleOff, pathname, t, toast]);

  if (blocked) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
