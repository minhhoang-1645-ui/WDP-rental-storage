import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { apiRequest, ApiError } from '../services/api';
import { useApiResource } from '../services/useApiResource';
import { safeLocalStorage } from '../services/browser-storage';
import { DATA_CHANGED } from '../services/live-events';
import { DATA_PULSE_KEY } from '../utils/notification-tools';
import { AUTH_TOKEN_KEY } from '../data/booking';
import { NotificationContext, noticeQuery, workspaceInboxPath, type Notice, type NotificationPage, type NotificationRole } from './workspace-notifications';

const receiptPulse = 'nestbox-notification-receipt-pulse';

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <NotificationSession key={`${user.id}:${user.role}`} userId={user.id} role={user.role}>{children}</NotificationSession> : children;
}

function NotificationSession({ children, userId, role }: { children: ReactNode; userId: string; role: NotificationRole }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const root = '/' + role.toLowerCase();
  const inbox = workspaceInboxPath(role);
  const query = pathname === inbox ? noticeQuery(search) : { view: 'all', page: 1, limit: 5, kind: '', search: '' };
  const params = new URLSearchParams({ view: query.view, page: String(query.page), limit: String(query.limit) });
  if (query.kind) params.set('kind', query.kind);
  if (query.search) params.set('search', query.search);
  const feed = useApiResource<NotificationPage>((pathname === root || pathname.startsWith(root + '/')) ? '/notifications?' + params : null, userId);
  const { refresh } = feed;
  const [lastPage, setLastPage] = useState<NotificationPage | null>(null);
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  // The bell retains the last successful summary while a filter page loads.
  if (feed.data && feed.data !== lastPage) setLastPage(feed.data);
  if (feed.error && lastPage) setLastPage(null);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== 'hidden') refresh(); };
    const crossTab = (event: StorageEvent) => { if (event.key === receiptPulse || event.key === DATA_PULSE_KEY) update(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('storage', crossTab);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener(DATA_CHANGED, update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', crossTab);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener(DATA_CHANGED, update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);

  const retry = useCallback(() => { setOperationError(''); refresh(); }, [refresh]);
  async function change(path: string, open = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setOperationError('');
    try {
      const result = await apiRequest<{ target?: string }>('/notifications/' + path, {
        method: open ? 'POST' : 'PATCH',
        expectedToken: safeLocalStorage.getItem(AUTH_TOKEN_KEY),
      });
      safeLocalStorage.setItem(receiptPulse, crypto.randomUUID());
      refresh();
      if (result.target?.startsWith(root + '/')) navigate(result.target, { state: { notificationInbox: inbox } });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 404) {
        setOperationError('Hồ sơ không còn khả dụng hoặc bạn không có quyền xem.');
        refresh();
      } else setOperationError(open ? 'Chưa thể mở thông báo. Hãy thử lại.' : 'Chưa thể đánh dấu đã đọc. Hãy thử lại.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const summary = feed.error ? null : feed.data ?? lastPage;
  return <NotificationContext.Provider value={{
    data: feed.data, recent: summary?.recent ?? [], kinds: summary?.kinds ?? [], unread: summary?.unreadTotal ?? null,
    loading: feed.loading, updating: feed.refreshing, error: feed.error, operationError, busy, refresh: retry,
    mark: notice => change(`${notice.token}/read`), markAll: () => change('read-all'),
    open: (notice: Notice) => change(`${notice.token}/open`, true),
  }}>{children}</NotificationContext.Provider>;
}
