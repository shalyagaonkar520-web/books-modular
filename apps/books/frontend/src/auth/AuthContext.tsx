import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { onUnauthorized, setAccessToken } from '@/api/client';
import { authApi, orgApi } from '@/api/endpoints';
import { isRegisterPending, type Organization, type Role, type User } from '@/api/types';

import { clearWorkspace } from './workspace';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  gstin?: string;
}

/** What `register` resolved to: signed in, or submitted and waiting for platform approval. */
export type RegisterResult =
  | { pending: false }
  | { pending: true; message: string; organizationName: string; email: string };

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Signs in on success; when the platform requires approval nothing is signed in and `pending` is true. */
  register: (payload: RegisterPayload) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  /** Take over a session from an externally issued access token (e.g. platform
   *  impersonation): sets the token, then loads who it belongs to. */
  adoptSession: (accessToken: string) => Promise<void>;
  /** Leave workspace mode: drop the impersonated tenant session locally. */
  endWorkspace: () => void;
  updateUser: (user: User) => void;
  can: (...roles: Role[]) => boolean;
  canWrite: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isEmployee: boolean;
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
      const response = await authApi.login({ email, password });
      // A real sign-in replaces any admin workspace in this tab.
      clearWorkspace();
      applyAuth(response);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<RegisterResult> => {
      const response = await authApi.register(payload);
      if (isRegisterPending(response)) {
        return {
          pending: true,
          message: response.message,
          organizationName: response.organizationName ?? payload.organizationName,
          email: response.email ?? payload.email,
        };
      }
      clearWorkspace();
      applyAuth(response);
      return { pending: false };
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearWorkspace();
      setAccessToken(null);
      setUser(null);
      setOrganization(null);
    }
  }, []);

  const endWorkspace = useCallback(() => {
    // An impersonated session has no refresh cookie, so there is nothing to
    // revoke server-side; just forget it here.
    clearWorkspace();
    setAccessToken(null);
    setUser(null);
    setOrganization(null);
  }, []);

  const refreshOrganization = useCallback(async () => {
    setOrganization(await orgApi.get());
  }, []);

  const adoptSession = useCallback(
    async (accessToken: string) => {
      setAccessToken(accessToken);
      applyAuth(await authApi.me());
    },
    [applyAuth],
  );

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
      adoptSession,
      endWorkspace,
      updateUser: setUser,
      can: (...roles: Role[]) => !!role && roles.includes(role),
      canWrite: role === 'admin' || role === 'staff',
      isAdmin: role === 'admin',
      isStaff: role === 'staff',
      isEmployee: role === 'employee',
    };
  }, [user, organization, initializing, login, register, logout, refreshOrganization, adoptSession, endWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/** Like useAuth, but returns null outside an AuthProvider instead of throwing. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
