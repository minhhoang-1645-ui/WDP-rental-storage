import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { apiRequest, setSessionExpiredHandler } from '@/services/api';
import { authStorage } from '@/services/auth-storage';
import type { AuthSession, PublicUser } from '@/types/api';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clearLocalSession = useCallback(async () => {
    await authStorage.clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => { void clearLocalSession(); });
    return () => setSessionExpiredHandler(undefined);
  }, [clearLocalSession]);

  useEffect(() => {
    let active = true;
    authStorage.getToken()
      .then(async (token) => token ? apiRequest<PublicUser>('/auth/me') : null)
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) void clearLocalSession(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clearLocalSession]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiRequest<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });
    await authStorage.setToken(session.token);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try { await apiRequest<void>('/auth/logout', { method: 'POST' }); } catch { /* Local logout must always finish. */ }
    await clearLocalSession();
  }, [clearLocalSession]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
