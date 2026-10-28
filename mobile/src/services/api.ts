import { fetch } from 'expo/fetch';

import { authStorage } from '@/services/auth-storage';
import { userMessage } from '@/utils/user-message';
import { notifyDataChanged } from './live-events';
import { operationApiPath } from '@/utils/operation-access';

const verifiedRoles = new Map<string, string>();
const roleLookups = new Map<string, Promise<string>>();
async function verifiedRole(token: string) {
  const existing = verifiedRoles.get(token);
  if (existing) return existing;
  let lookup = roleLookups.get(token);
  if (!lookup) {
    lookup = apiRequest<{ role: string }>('/auth/me', { expectedToken: token }).then(user => {
      if (!['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(user.role)) throw new ApiError('Vai trò đăng nhập không hợp lệ. Vui lòng đăng nhập lại.', 502);
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

const fallbackUrl = process.env.EXPO_OS === 'android'
  ? 'http://10.0.2.2:3000/api'
  : 'http://127.0.0.1:3000/api';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || fallbackUrl).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onSessionExpired: (() => void) | undefined;

export function setSessionExpiredHandler(handler?: () => void) {
  onSessionExpired = handler;
}

export async function apiRequest<T>(path: string, options: RequestInit & { authenticated?: boolean; expectedToken?: string | null } = {}): Promise<T> {
  const { authenticated = true, signal, expectedToken, ...request } = options;
  const token = authenticated ? await authStorage.getToken() : null;
  if (expectedToken !== undefined && token !== expectedToken) throw new Error('Phiên đăng nhập đã thay đổi.');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  try {
  let response: Response;
  const role = token && /^\/(manager|staff)\//.test(path) ? await verifiedRole(token) : token ? verifiedRoles.get(token) : undefined;
  if (token && await authStorage.getToken() !== token) throw new Error('Phiên đăng nhập đã thay đổi.');
  const apiPath = operationApiPath(path, role, request.method ?? 'GET');
  try {
    response = await fetch(`${apiUrl}${apiPath}`, {
      ...request,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...request.headers,
      },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError('Máy chủ phản hồi quá lâu. Vui lòng thử lại.', 408);
    throw new ApiError('Không kết nối được hệ thống NestBox. Vui lòng kiểm tra mạng và thử lại.', 0);
  }

  const payload = response.status === 204 ? null : await response.json().catch((error: unknown) => {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError('Máy chủ phản hồi quá lâu. Vui lòng thử lại.', 408);
    return null;
  });
  if (!response.ok) {
    if (response.status === 401 && token && await authStorage.getToken() === token) onSessionExpired?.();
    const rawMessage = payload && typeof payload === 'object' && 'message' in payload
      ? (payload as { message?: unknown }).message
      : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : `Yêu cầu thất bại (${response.status})`;
    throw new ApiError(userMessage(message), response.status, payload);
  }
  if (path === '/auth/me' && token && typeof payload?.role === 'string') rememberRole(token, payload.role);
  if (path === '/auth/login' && typeof payload?.token === 'string' && typeof payload?.user?.role === 'string') rememberRole(payload.token, payload.user.role);
  if (/^(POST|PATCH|DELETE)$/i.test(request.method ?? '') && /^\/(customer|manager|staff|admin|reservations|inquiries)(\/|$)/.test(path)) notifyDataChanged(path);
  return payload as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function apiAllPages<T>(path: string, signal?: AbortSignal, expectedToken?: string | null): Promise<T> {
  const sessionToken = expectedToken === undefined ? await authStorage.getToken() : expectedToken;
  const [pathname, search = ''] = path.split('?', 2);
  const query = new URLSearchParams(search);
  query.set('limit', '100'); query.set('page', '1');
  type Page = { items: unknown[]; total: number; limit: number; page: number };
  const head = await apiRequest<Page>(`${pathname}?${query}`, { signal, expectedToken: sessionToken });
  if (!head || !Array.isArray(head.items) || !Number.isSafeInteger(head.total) || head.total < 0 || !Number.isSafeInteger(head.limit) || head.limit < 1) throw new ApiError('Danh sách trả về không hợp lệ.', 502);
  const items = [...head.items];
  for (let page = 2; page <= Math.ceil(head.total / head.limit); page++) {
    query.set('page', String(page));
    const next = await apiRequest<Page>(`${pathname}?${query}`, { signal, expectedToken: sessionToken });
    if (!next || !Array.isArray(next.items)) throw new ApiError('Danh sách trả về không hợp lệ.', 502);
    items.push(...next.items);
  }
  return { ...head, items } as T;
}
