import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, apiRequest, setSessionExpiredHandler } from '@/services/api';
import { authStorage } from '@/services/auth-storage';
import type { AuthSession, PublicUser } from '@/types/api';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  sessionError: string;
  retrySession: () => void;
  login: (email: string, password: string) => Promise<PublicUser>;
  updateProfile: (input: { fullName: string; phone: string }) => Promise<PublicUser>;
  logout: () => Promise<void>;
  acceptSession: (session: AuthSession) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);

  const clearLocalSession = useCallback(async () => {
    revision.current++;
    setUser(null);
    setSessionError('');
    setLoading(false);
    await authStorage.clearToken();
  }, []);

  const retrySession = useCallback(() => { setLoading(true); setSessionError(''); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => { void clearLocalSession(); });
    return () => setSessionExpiredHandler(undefined);
  }, [clearLocalSession]);

  useEffect(() => authStorage.subscribe(() => {
    // A different browser tab can log out or switch accounts. Discard the old
    // identity immediately; never render its cached screens with the new token.
    revision.current++;
    setUser(null);
    setSessionError('');
    setLoading(true);
    setAttempt(value => value + 1);
  }), []);

  useEffect(() => {
    let active = true;
    const version = ++revision.current;
    authStorage.getToken()
      .then(async (token) => token ? apiRequest<PublicUser>('/auth/me', { expectedToken: token }) : null)
      .then((currentUser) => {
        if (currentUser && (!currentUser.id || !['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(currentUser.role))) throw new Error('Phiên đăng nhập không hợp lệ.');
        if (active && version === revision.current) setUser(currentUser);
      })
      .catch(error => {
        if (!active || version !== revision.current) return;
        if (error instanceof ApiError && [401, 403].includes(error.status)) void clearLocalSession();
        else setSessionError(error instanceof Error ? error.message : 'Chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clearLocalSession, attempt]);

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

  const acceptSession = useCallback(async (session: AuthSession) => {
    if (!session?.token || !session.user?.id || session.user.role !== 'CUSTOMER') throw new Error('Phiên khách hàng không hợp lệ.');
    revision.current++;
    await authStorage.setToken(session.token);
    setSessionError(''); setUser(session.user); setLoading(false);
  }, []);


  const updateProfile = useCallback(async (input: { fullName: string; phone: string }) => {
    const version = revision.current;
    const token = await authStorage.getToken();
    if (!token || !user) throw new Error('Vui lòng đăng nhập lại để cập nhật thông tin.');
    const updated = await apiRequest<PublicUser>('/auth/me', { method: 'PATCH', expectedToken: token, body: JSON.stringify(input) });
    if (version !== revision.current || await authStorage.getToken() !== token) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại thông tin.');
    if (updated?.id !== user.id || !['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(updated.role)) throw new Error('Thông tin tài khoản trả về không hợp lệ. Vui lòng tải lại.');
    setUser(updated);
    return updated;
  }, [user]);

  const value = useMemo(() => ({ user, loading, sessionError, retrySession, login, updateProfile, logout, acceptSession }), [user, loading, sessionError, retrySession, login, updateProfile, logout, acceptSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
