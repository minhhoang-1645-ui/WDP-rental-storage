import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, apiRequest, setSessionExpiredHandler } from '@/services/api';
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
  const revision = useRef(0);

  const clearLocalSession = useCallback(async () => {
    revision.current++;
    setUser(null);
    setLoading(false);
    await authStorage.clearToken();
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => { void clearLocalSession(); });
    return () => setSessionExpiredHandler(undefined);
  }, [clearLocalSession]);

  useEffect(() => {
    let active = true;
    const version = ++revision.current;
    authStorage.getToken()
      .then(async (token) => token ? apiRequest<PublicUser>('/auth/me') : null)
      .then((currentUser) => {
        if (currentUser && (!currentUser.id || !['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(currentUser.role))) throw new Error('Phiên đăng nhập không hợp lệ.');
        if (active && version === revision.current) setUser(currentUser);
      })
      .catch(error => {
        if (active && version === revision.current && error instanceof ApiError && [401, 403].includes(error.status)) void clearLocalSession();
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clearLocalSession]);

  const login = useCallback(async (email: string, password: string) => {
    const version = ++revision.current;
    const session = await apiRequest<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      authenticated: false,
    });
    if (!session?.token || !session.user?.id || !['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(session.user.role)) throw new Error('Thông tin phiên đăng nhập không hợp lệ.');
    if (version !== revision.current) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
    await authStorage.setToken(session.token);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    const token = await authStorage.getToken();
    await clearLocalSession();
    if (token) void apiRequest<void>('/auth/logout', { method: 'POST', authenticated: false, headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
  }, [clearLocalSession]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
