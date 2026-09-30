import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { moduleForPath } from '@/api/appContent';
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
  const module = moduleForPath(pathname);
  const blocked = module !== null && !isModuleEnabled(module);
  const notifiedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!blocked) {
      notifiedFor.current = null;
      return;
    }
    if (notifiedFor.current === pathname) return;
    notifiedFor.current = pathname;
    toast.notify(t('common.moduleOff'), 'warning');
  }, [blocked, pathname, t, toast]);

  if (blocked) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
