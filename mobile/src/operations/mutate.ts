import { apiRequest } from '@/services/api';
import { authStorage } from '@/services/auth-storage';
import type { Row } from './model';

const retryKeys = new Map<string, string>();
let sequence = 0;
export async function operationMutate(path: string, method: 'POST' | 'PATCH', body?: Row, idempotent = false) {
  const fingerprint = `${await authStorage.getToken()}:${method}:${path}:${JSON.stringify(body)}`;
  const key = idempotent ? retryKeys.get(fingerprint) ?? `mobile-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}` : '';
  if (key) retryKeys.set(fingerprint, key);
  const result = await apiRequest<Row>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}), ...(key ? { headers: { 'Idempotency-Key': key } } : {}) });
  retryKeys.delete(fingerprint);
  return result;
}
