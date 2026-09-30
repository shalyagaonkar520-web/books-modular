/**
 * Session for the organization admin panel (/org-admin). Mounted only around
 * the panel's routes, next to (never inside) the tenant and platform sessions.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { orgAdminApi, type OrgPanelAdmin, type OrgPanelSession } from '@/api/orgAdmin';
import { onOrgPanelUnauthorized, setOrgPanelAccessToken } from '@/api/orgPanelClient';
import type { Message } from '@/api/types';

interface OrgPanelAuthContextValue {
  admin: OrgPanelAdmin | null;
  organization: OrgPanelSession['organization'] | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read the admin and organization (e.g. after the organization is renamed). */
  refreshMe: () => Promise<void>;
  changePassword: (body: { currentPassword: string; newPassword: string }) => Promise<Message>;
}

const OrgPanelAuthContext = createContext<OrgPanelAuthContextValue | null>(null);

export function OrgPanelAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OrgPanelSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the httpOnly panel refresh cookie on first load.
  useEffect(() => {
    let active = true;
    orgAdminApi.auth
      .refresh()
      .then((response) => {
        if (!active) return;
        if (response) {
          setOrgPanelAccessToken(response.accessToken);
          setSession({ admin: response.admin, organization: response.organization });
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Any request that ends in an unrecoverable 401 clears the session.
  useEffect(
    () =>
      onOrgPanelUnauthorized(() => {
        setOrgPanelAccessToken(null);
        setSession(null);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const response = await orgAdminApi.auth.login({ email, password });
    setOrgPanelAccessToken(response.accessToken);
    setSession({ admin: response.admin, organization: response.organization });
  }, []);

  const logout = useCallback(async () => {
    try {
      await orgAdminApi.auth.logout();
    } catch {
      // Signing out locally still ends the session in this tab.
    } finally {
      setOrgPanelAccessToken(null);
      setSession(null);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await orgAdminApi.me();
      setSession({ admin: me.admin, organization: me.organization });
    } catch {
      // Keep what we have; an expired session is handled by the 401 listener.
    }
  }, []);

  const changePassword = useCallback(
    (body: { currentPassword: string; newPassword: string }) => orgAdminApi.auth.changePassword(body),
    [],
  );

  const value = useMemo<OrgPanelAuthContextValue>(
    () => ({
      admin: session?.admin ?? null,
      organization: session?.organization ?? null,
      initializing,
      login,
      logout,
      refreshMe,
      changePassword,
    }),
    [session, initializing, login, logout, refreshMe, changePassword],
  );

  return <OrgPanelAuthContext.Provider value={value}>{children}</OrgPanelAuthContext.Provider>;
}

export function useOrgPanelAuth(): OrgPanelAuthContextValue {
  const context = useContext(OrgPanelAuthContext);
  if (!context) throw new Error('useOrgPanelAuth must be used inside an OrgPanelAuthProvider');
  return context;
}
