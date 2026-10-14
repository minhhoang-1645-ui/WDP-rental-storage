import { fetch } from 'expo/fetch';

import { authStorage } from '@/services/auth-storage';

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

export async function apiRequest<T>(path: string, options: RequestInit & { authenticated?: boolean } = {}): Promise<T> {
  const { authenticated = true, signal, ...request } = options;
  const token = authenticated ? await authStorage.getToken() : null;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  try {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
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
    throw new ApiError(
      error instanceof Error ? `Không kết nối được Backend: ${error.message}` : 'Không kết nối được Backend.',
      0,
    );
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
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function apiAllPages<T>(path: string, signal?: AbortSignal): Promise<T> {
  const [pathname, search = ''] = path.split('?', 2);
  const query = new URLSearchParams(search);
  query.set('limit', '100'); query.set('page', '1');
  type Page = { items: unknown[]; total: number; limit: number; page: number };
  const head = await apiRequest<Page>(`${pathname}?${query}`, { signal });
  if (!head || !Array.isArray(head.items) || !Number.isSafeInteger(head.total) || head.total < 0 || !Number.isSafeInteger(head.limit) || head.limit < 1) throw new ApiError('Danh sách trả về không hợp lệ.', 502);
  const items = [...head.items];
  for (let page = 2; page <= Math.ceil(head.total / head.limit); page++) {
    query.set('page', String(page));
    const next = await apiRequest<Page>(`${pathname}?${query}`, { signal });
    if (!next || !Array.isArray(next.items)) throw new ApiError('Danh sách trả về không hợp lệ.', 502);
    items.push(...next.items);
  }
  return { ...head, items } as T;
}
