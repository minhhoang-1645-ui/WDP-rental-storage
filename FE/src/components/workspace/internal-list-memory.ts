import { roleNamespace } from '../../role-names';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { safeSessionStorage } from '../../services/browser-storage';
export const listMemoryKey = (userId: string, pathname: string) => `nestbox-internal-list:${userId}:${pathname}`;

export function useInternalListScroll(enabled: boolean, ready: boolean) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const key = enabled && user ? listMemoryKey(user.id, pathname) + ':scroll:' + search : '';
  const lastKey = useRef('');
  useEffect(() => {
    if (!key || !ready) return;
    const restore = lastKey.current !== key;
    const offset = restore ? Number(safeSessionStorage.getItem(key)) : 0;
    const frame = requestAnimationFrame(() => {
      lastKey.current = key;
      if (Number.isFinite(offset) && offset > 0) window.scrollTo(0, offset);
    });
    const remember = (event: MouseEvent) => {
      if (lastKey.current === key && event.target instanceof Element && event.target.closest('.manager-record-list tbody')) {
        safeSessionStorage.setItem(key, String(window.scrollY));
      }
    };
    document.addEventListener('click', remember, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', remember, true);
    };
  }, [key, ready]);
}
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
