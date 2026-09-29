import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { onPlatformUnauthorized, setPlatformAccessToken } from '@/api/platformClient';
import { platformApi, type PlatformAdmin } from '@/api/platform';

interface PlatformAuthContextValue {
  admin: PlatformAdmin | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the httpOnly platform refresh cookie on first load.
  useEffect(() => {
    let active = true;
    platformApi.auth
      .refresh()
      .then((response) => {
        if (!active) return;
        if (response) {
          setPlatformAccessToken(response.accessToken);
          setAdmin(response.admin);
        } else {
          setAdmin(null);
        }
      })
      .catch(() => {
        if (active) setAdmin(null);
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
      onPlatformUnauthorized(() => {
        setPlatformAccessToken(null);
        setAdmin(null);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const response = await platformApi.auth.login({ email, password });
    setPlatformAccessToken(response.accessToken);
    setAdmin(response.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformApi.auth.logout();
    } finally {
      setPlatformAccessToken(null);
      setAdmin(null);
    }
  }, []);

  const value = useMemo<PlatformAuthContextValue>(
    () => ({ admin, initializing, login, logout }),
    [admin, initializing, login, logout],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const context = useContext(PlatformAuthContext);
  if (!context) throw new Error('usePlatformAuth must be used inside a PlatformAuthProvider');
  return context;
}
