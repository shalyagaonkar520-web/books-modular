import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { onUnauthorized, setAccessToken } from '@/api/client';
import { authApi, orgApi } from '@/api/endpoints';
import type { Organization, Role, User } from '@/api/types';

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; organizationName: string; gstin?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  updateUser: (user: User) => void;
  can: (...roles: Role[]) => boolean;
  canWrite: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((response) => {
        if (!active) return;
        setAccessToken(response.accessToken);
        setUser(response.user);
        setOrganization(response.organization);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setOrganization(null);
        }
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
      onUnauthorized(() => {
        setUser(null);
        setOrganization(null);
      }),
    [],
  );

  const applyAuth = useCallback((response: { accessToken: string; user: User; organization: Organization }) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    setOrganization(response.organization);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      applyAuth(await authApi.login({ email, password }));
    },
    [applyAuth],
  );

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; organizationName: string; gstin?: string }) => {
      applyAuth(await authApi.register(payload));
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setOrganization(null);
    }
  }, []);

  const refreshOrganization = useCallback(async () => {
    setOrganization(await orgApi.get());
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role;
    return {
      user,
      organization,
      initializing,
      login,
      register,
      logout,
      refreshOrganization,
      updateUser: setUser,
      can: (...roles: Role[]) => !!role && roles.includes(role),
      canWrite: role === 'admin' || role === 'staff',
      isAdmin: role === 'admin',
    };
  }, [user, organization, initializing, login, register, logout, refreshOrganization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
