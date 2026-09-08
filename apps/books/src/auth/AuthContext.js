import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onUnauthorized, setAccessToken } from '@/api/client';
import { authApi, orgApi } from '@/api/endpoints';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [organization, setOrganization] = useState(null);
    const [initializing, setInitializing] = useState(true);
    // Restore the session from the httpOnly refresh cookie on first load.
    useEffect(() => {
        let active = true;
        authApi
            .me()
            .then((response) => {
            if (!active)
                return;
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
            if (active)
                setInitializing(false);
        });
        return () => {
            active = false;
        };
    }, []);
    // Any request that ends in an unrecoverable 401 clears the session.
    useEffect(() => onUnauthorized(() => {
        setUser(null);
        setOrganization(null);
    }), []);
    const applyAuth = useCallback((response) => {
        setAccessToken(response.accessToken);
        setUser(response.user);
        setOrganization(response.organization);
    }, []);
    const login = useCallback(async (email, password) => {
        applyAuth(await authApi.login({ email, password }));
    }, [applyAuth]);
    const register = useCallback(async (payload) => {
        applyAuth(await authApi.register(payload));
    }, [applyAuth]);
    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        }
        finally {
            setAccessToken(null);
            setUser(null);
            setOrganization(null);
        }
    }, []);
    const refreshOrganization = useCallback(async () => {
        setOrganization(await orgApi.get());
    }, []);
    const value = useMemo(() => {
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
            can: (...roles) => !!role && roles.includes(role),
            canWrite: role === 'admin' || role === 'staff',
            isAdmin: role === 'admin',
        };
    }, [user, organization, initializing, login, register, logout, refreshOrganization]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context)
        throw new Error('useAuth must be used inside an AuthProvider');
    return context;
}
