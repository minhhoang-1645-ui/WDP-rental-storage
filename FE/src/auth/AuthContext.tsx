import { safeLocalStorage, safeSessionStorage } from '../services/browser-storage';
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AUTH_TOKEN_KEY } from "../data/booking";
import { authApi } from "../services/booking";
import type { AuthSession, PublicUser } from "../types/booking";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { ApiError, apiRequest } from "../services/api";

function validUser(user: PublicUser) {
  return Boolean(
    user &&
    typeof user.id === "string" &&
    typeof user.fullName === "string" &&
    typeof user.email === "string" &&
    ["CUSTOMER", "STAFF", "MANAGER", "ADMIN"].includes(user.role),
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(() =>
    Boolean(safeLocalStorage.getItem(AUTH_TOKEN_KEY)),
  );
  const [connectionError, setConnectionError] = useState('');
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const retrySession = useRef<() => void>(() => {});
  const failedConnection = useRef(false);

  useEffect(() => {
    let mounted = true;
    let activeController: AbortController | null = null;
    const expire = () => {
      generation.current++;
      pending.current?.abort();
      safeLocalStorage.removeItem(AUTH_TOKEN_KEY);
      safeSessionStorage.setItem("wdp-session-expired", "true");
      failedConnection.current = false;
      setConnectionError('');
      setUser(null);
      setLoading(false);
    };
    const validate = (token: string) => {
      const version = ++generation.current;
      pending.current?.abort();
      setLoading(true);
      setConnectionError('');
      const controller = new AbortController();
      activeController = controller;
      pending.current = controller;
      apiRequest<PublicUser>("/auth/me", { signal: controller.signal, timeoutMs: 15000 })
        .then((value) => {
          if (
            !mounted ||
            version !== generation.current ||
            safeLocalStorage.getItem(AUTH_TOKEN_KEY) !== token
          )
            return;
          if (!validUser(value)) {
            expire();
            return;
          }
          failedConnection.current = false;
          setUser(value);
        })
        .catch((error) => {
          if (!mounted || controller.signal.aborted || version !== generation.current || safeLocalStorage.getItem(AUTH_TOKEN_KEY) !== token) return;
          if (error instanceof ApiError && [401, 403].includes(error.status)) expire();
          else {
            failedConnection.current = true;
            setConnectionError('Chưa kết nối được tài khoản của bạn. Phiên đăng nhập vẫn được giữ; hãy kiểm tra kết nối rồi thử lại.');
          }
        })
        .finally(() => {
          if (mounted && version === generation.current) setLoading(false);
        });
    };
    retrySession.current = () => {
      const token = safeLocalStorage.getItem(AUTH_TOKEN_KEY);
      if (token) validate(token);
    };
    const reconnect = () => { if (failedConnection.current) retrySession.current(); };
    const storage = (event: StorageEvent) => {
      if (event.key !== AUTH_TOKEN_KEY && event.key !== null) return;
      generation.current++;
      pending.current?.abort();
      setUser(null);
      failedConnection.current = false;
      setConnectionError('');
      const token = safeLocalStorage.getItem(AUTH_TOKEN_KEY);
      setLoading(Boolean(token));
      if (token) validate(token);
    };
    window.addEventListener("wdp-session-expired", expire);
    window.addEventListener("storage", storage);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    const token = safeLocalStorage.getItem(AUTH_TOKEN_KEY);
    if (token) validate(token);
    return () => {
      mounted = false;
      activeController?.abort();
      window.removeEventListener("wdp-session-expired", expire);
      window.removeEventListener("storage", storage);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
    };
  }, []);

  const saveSession = (session: AuthSession) => {
    if (!session?.token || !validUser(session.user))
      throw new Error("Thông tin phiên đăng nhập không hợp lệ.");
    generation.current++;
    pending.current?.abort();
    safeLocalStorage.setItem(AUTH_TOKEN_KEY, session.token);
    safeSessionStorage.removeItem("wdp-session-expired");
    failedConnection.current = false;
    setConnectionError('');
    setUser(session.user);
    setLoading(false);
  };

  const value: AuthContextValue = {
    user,
    loading,
    acceptSession: saveSession,
    login: async (input) => saveSession(await authApi.login(input)),
    register: async (input) => saveSession(await authApi.register(input)),
    updateProfile: async (input) => {
      const token = safeLocalStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) throw new Error('Vui lòng đăng nhập lại để cập nhật thông tin.');
      const version = ++generation.current;
      pending.current?.abort();
      const updated = await authApi.updateProfile(input, token);
      if (version !== generation.current || safeLocalStorage.getItem(AUTH_TOKEN_KEY) !== token) throw new DOMException('Phiên đăng nhập đã thay đổi.', 'AbortError');
      if (!validUser(updated)) throw new Error('Chưa xác nhận được thông tin đã cập nhật. Vui lòng tải lại hồ sơ.');
      setUser(updated);
    },
    logout: () => {
      // Capture the current bearer token before clearing this browser's session.
      void authApi.logout().catch(() => undefined);
      generation.current++;
      pending.current?.abort();
      safeLocalStorage.removeItem(AUTH_TOKEN_KEY);
      failedConnection.current = false;
      setConnectionError('');
      setUser(null);
      setLoading(false);
    },
  };

  return <AuthContext.Provider value={value}>{connectionError && !user ? <main className="customer-shell-loading"><section className="auth-panel" role="alert"><h1>Chưa kết nối được tài khoản</h1><p>{connectionError}</p><div className="portal-actions"><button className="button-primary" type="button" onClick={() => retrySession.current()} disabled={loading}>{loading ? 'Đang kết nối…' : 'Thử kết nối lại'}</button><button className="button-secondary" type="button" onClick={value.logout}>Dùng tài khoản khác</button></div></section></main> : children}</AuthContext.Provider>;
}
