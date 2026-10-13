import { AUTH_TOKEN_KEY } from "../data/booking";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { authenticated = true, timeoutMs = 30000, signal, ...request } = options;
  const token = authenticated ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const headers = new Headers(request.headers);
    headers.set("Accept", "application/json");
    if (request.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, { ...request, signal: controller.signal, headers });
    const payload = response.status === 204 ? null : await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      if (response.status === 401 && token && localStorage.getItem(AUTH_TOKEN_KEY) === token) window.dispatchEvent(new CustomEvent("wdp-session-expired"));
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      throw new ApiError(response.status, typeof message === "string" ? message : `Yêu cầu thất bại (${response.status})`, payload);
    }
    return payload as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError(408, "Máy chủ phản hồi quá lâu. Vui lòng thử lại.");
    if (error instanceof TypeError) throw new ApiError(0, "Không kết nối được máy chủ. Vui lòng kiểm tra BE và thử lại.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
