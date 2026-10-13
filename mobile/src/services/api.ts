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

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await authStorage.getToken();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? `Không kết nối được Backend: ${error.message}` : 'Không kết nối được Backend.',
      0,
    );
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) onSessionExpired?.();
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
}
