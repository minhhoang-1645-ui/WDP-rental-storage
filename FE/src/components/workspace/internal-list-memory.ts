import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { safeSessionStorage } from '../../services/browser-storage';
export const listMemoryKey = (userId: string, pathname: string) => `nestbox-internal-list:${userId}:${pathname}`;
export function useInternalListReturn(fallback: string) {
  const { user } = useAuth();
  useLocation();
  if (!user || !['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].includes(user.role)) return fallback;
  const stored = safeSessionStorage.getItem(listMemoryKey(user.id, fallback));
  if (!stored) return fallback;
  try {
    const url = new URL(stored, 'https://internal.invalid');
    return url.origin === 'https://internal.invalid' && url.pathname === fallback ? url.pathname + url.search : fallback;
  } catch { return fallback; }
}
