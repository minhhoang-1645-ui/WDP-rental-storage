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
    Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
  );
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    let activeController: AbortController | null = null;
    const expire = () => {
      generation.current++;
      pending.current?.abort();
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.setItem("wdp-session-expired", "true");
      setUser(null);
      setLoading(false);
    };
    const validate = (token: string) => {
      const version = ++generation.current;
      pending.current?.abort();
      const controller = new AbortController();
      activeController = controller;
      pending.current = controller;
      apiRequest<PublicUser>("/auth/me", { signal: controller.signal, timeoutMs: 15000 })
        .then((value) => {
          if (
            !mounted ||
            version !== generation.current ||
            localStorage.getItem(AUTH_TOKEN_KEY) !== token
          )
            return;
          if (!validUser(value)) {
            expire();
            return;
          }
          setUser(value);
        })
        .catch((error) => {
          if (
            mounted &&
            version === generation.current &&
            localStorage.getItem(AUTH_TOKEN_KEY) === token &&
            error instanceof ApiError &&
            [401, 403].includes(error.status)
          )
            expire();
        })
        .finally(() => {
          if (mounted && version === generation.current) setLoading(false);
        });
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== AUTH_TOKEN_KEY && event.key !== null) return;
      generation.current++;
      pending.current?.abort();
      setUser(null);
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      setLoading(Boolean(token));
      if (token) validate(token);
    };
    window.addEventListener("wdp-session-expired", expire);
    window.addEventListener("storage", storage);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) validate(token);
    return () => {
      mounted = false;
      activeController?.abort();
      window.removeEventListener("wdp-session-expired", expire);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const saveSession = (session: AuthSession) => {
    if (!session?.token || !validUser(session.user))
      throw new Error("Thông tin phiên đăng nhập không hợp lệ.");
    generation.current++;
    pending.current?.abort();
    localStorage.setItem(AUTH_TOKEN_KEY, session.token);
    sessionStorage.removeItem("wdp-session-expired");
    setUser(session.user);
    setLoading(false);
  };

  const value: AuthContextValue = {
    user,
    loading,
    login: async (input) => saveSession(await authApi.login(input)),
    register: async (input) => saveSession(await authApi.register(input)),
    logout: () => {
      // Capture the current bearer token before clearing this browser's session.
      void authApi.logout().catch(() => undefined);
      generation.current++;
      pending.current?.abort();
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
      setLoading(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
