import { roleNamespace } from '../../role-names';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { safeSessionStorage } from '../../services/browser-storage';
export const listMemoryKey = (userId: string, pathname: string) => `nestbox-internal-list:${userId}:${pathname}`;
export function useInternalListReturn(fallback: string) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || !['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(user.role)) return fallback;
  const returnTo: unknown = location.state?.returnTo;
  if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
    try {
      const url = new URL(returnTo, 'https://internal.invalid');
      if (url.origin === 'https://internal.invalid' && url.pathname.split('/')[1] === roleNamespace(user.role)
        && url.pathname + url.search !== location.pathname + location.search) return url.pathname + url.search + url.hash;
    } catch { /* Fall back to the last list URL. */ }
  }
  if (location.pathname === fallback) return fallback;
  const stored = safeSessionStorage.getItem(listMemoryKey(user.id, fallback));
  if (!stored) return fallback;
  try {
    const url = new URL(stored, 'https://internal.invalid');
    return url.origin === 'https://internal.invalid' && url.pathname === fallback ? url.pathname + url.search : fallback;
  } catch { return fallback; }
}
