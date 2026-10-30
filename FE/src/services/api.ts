import { AUTH_TOKEN_KEY } from "../data/booking";
import { userMessage } from '../utils/user-message';
import { notifyDataChanged } from './live-events';
import { operationApiPath } from '../utils/operation-access';

const verifiedRoles = new Map<string, string>();
const roleLookups = new Map<string, Promise<string>>();
async function verifiedRole(token: string) {
  const existing = verifiedRoles.get(token);
  if (existing) return existing;
  let lookup = roleLookups.get(token);
  if (!lookup) {
    // Fast Refresh can retain the signed-in UI while reloading this module's cache.
    lookup = apiRequest<{ role: string }>('/auth/me', { expectedToken: token }).then(user => {
      if (!['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(user.role)) throw new ApiError(502, 'Vai trò đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
      return user.role;
    }).finally(() => roleLookups.delete(token));
    roleLookups.set(token, lookup);
  }
  return lookup;
}
function rememberRole(token: string, role: string) {
  verifiedRoles.set(token, role);
  if (verifiedRoles.size > 8) verifiedRoles.delete(verifiedRoles.keys().next().value!);
}

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
  options: RequestInit & { authenticated?: boolean; timeoutMs?: number; expectedToken?: string | null; responseType?: 'json' | 'blob' } = {},
): Promise<T> {
  const { authenticated = true, timeoutMs = 30000, signal, expectedToken, responseType = 'json', ...request } = options;
  const token = authenticated ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  if (expectedToken !== undefined && token !== expectedToken) throw new DOMException('Phiên đăng nhập đã thay đổi.', 'AbortError');
  const mutation = /^(POST|PATCH|DELETE)$/i.test(request.method ?? '') && /^\/(customer|manager|staff|admin|reservations|inquiries)(\/|$)/.test(path);
  const submittedForm = mutation ? document.activeElement?.closest('form') ?? document.querySelector('form[data-wdp-submitting="true"]') : null;
  const submittedVersion = submittedForm?.getAttribute('data-wdp-edit-version');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const headers = new Headers(request.headers);
    headers.set("Accept", responseType === 'blob' ? 'application/pdf' : 'application/json');
    if (request.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const role = token && /^\/(manager|staff)\//.test(path) ? await verifiedRole(token) : token ? verifiedRoles.get(token) : undefined;
    if (token && localStorage.getItem(AUTH_TOKEN_KEY) !== token) throw new DOMException('Phiên đăng nhập đã thay đổi.', 'AbortError');
    const apiPath = operationApiPath(path, role, request.method ?? 'GET');
    const response = await fetch(`${API_URL.replace(/\/$/, "")}${apiPath}`, { ...request, signal: controller.signal, headers });
    const payload = response.ok && responseType === 'blob' ? await response.blob() : response.status === 204 ? null : await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      if (response.status === 401 && token && localStorage.getItem(AUTH_TOKEN_KEY) === token) window.dispatchEvent(new CustomEvent("wdp-session-expired"));
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      throw new ApiError(response.status, typeof message === "string" ? userMessage(message) : `Yêu cầu thất bại (${response.status})`, payload);
    }
    if (responseType === 'blob' && token && localStorage.getItem(AUTH_TOKEN_KEY) !== token) throw new DOMException('Phiên đăng nhập đã thay đổi.', 'AbortError');
    if (path === '/auth/me' && token && typeof payload?.role === 'string') rememberRole(token, payload.role);
    if (['/auth/login', '/auth/register'].includes(path) && typeof payload?.token === 'string' && typeof payload?.user?.role === 'string') rememberRole(payload.token, payload.user.role);
    if (mutation) { if (submittedForm?.getAttribute('data-wdp-edit-version') === submittedVersion) submittedForm?.removeAttribute('data-wdp-dirty'); notifyDataChanged(path); }
    return payload as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError(408, "Máy chủ phản hồi quá lâu. Vui lòng thử lại.");
    if (error instanceof TypeError) throw new ApiError(0, "Không kết nối được hệ thống NestBox. Vui lòng kiểm tra mạng và thử lại.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    submittedForm?.removeAttribute('data-wdp-submitting');
  }
}
