import { useEffect, useState } from 'react';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { InternalPagination } from '../components/workspace/InternalPagination';
import { NotificationResult } from './NotificationRows';
import { WorkspaceNotificationDropdown } from './WorkspaceNotificationDropdown';
import { noticePageSizes, noticeQuery, noticeViews, useNotifications } from './workspace-notifications';

export function ActivityBell() {
  const { user } = useAuth();
  return user ? <WorkspaceNotificationDropdown role={user.role} /> : null;
}

export function ActivityInboxPage() {
  const feed = useNotifications();
  const [params, setParams] = useSearchParams();
  const query = noticeQuery(params.toString());
  const [draft, setDraft] = useState({ original: query.search, value: query.search });
  const keyword = draft.original === query.search ? draft.value : query.search;

  useEffect(() => {
    const search = keyword.trim();
    if (search === query.search) return;
    const timer = window.setTimeout(() => {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        if (search) next.set('search', search);
        else next.delete('search');
        next.delete('page');
        return next;
      }, { replace: true });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [keyword, query.search, setParams]);

  function change(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') {
        next.delete('page');
        if (keyword.trim()) next.set('search', keyword.trim());
        else next.delete('search');
      }
      return next;
    }, { replace: true });
  }
  if (!feed) return null;
  return <section className="workspace-notification-inbox" aria-labelledby="notification-inbox-title">
    <header className="manager-page-header workspace-notification-inbox-header">
      <div><h1 id="notification-inbox-title">Thông báo</h1></div>
      <div className="portal-actions">
        <button type="button" className="button-secondary" onClick={feed.refresh} disabled={feed.loading || feed.updating}>
          <RefreshCw size={16} aria-hidden="true" />Làm mới
        </button>
        <button type="button" className="button-secondary" disabled={!feed.unread || feed.busy} onClick={() => void feed.markAll()}>
          <CheckCheck size={17} aria-hidden="true" />Đánh dấu tất cả đã đọc
        </button>
      </div>
    </header>
    <div className="workspace-notification-surface">
      <div className="workspace-notification-toolbar">
        <div className="workspace-notification-tabs" role="group" aria-label="Trạng thái thông báo">
          {noticeViews.map(([value, label]) => <button key={value} type="button" aria-pressed={query.view === value}
            onClick={() => change('view', value === 'all' ? '' : value)}>{label}</button>)}
        </div>
        <div className="workspace-notification-filters">
          <label className="field-label"><span className="sr-only">Tìm thông báo</span>
            <input type="search" maxLength={100} value={keyword} placeholder="Tìm thông báo…" onChange={event => setDraft({ original: query.search, value: event.target.value })} />
          </label>
          <label className="field-label"><span className="sr-only">Loại thông báo</span>
            <select value={query.kind} onChange={event => change('kind', event.target.value)}>
              <option value="">Tất cả loại</option>
              {query.kind && !feed.kinds.some(kind => kind.value === query.kind) && <option value={query.kind}>Loại đang lọc</option>}
              {feed.kinds.map(kind => <option value={kind.value} key={kind.value}>{kind.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <NotificationResult items={feed.data?.items ?? []} view={query.view} filtered={Boolean(query.kind || query.search)} />
    </div>
    {!feed.error && feed.data && <InternalPagination page={feed.data.page} limit={feed.data.limit} total={feed.data.total}
      pageSizes={noticePageSizes} recordsLabel="thông báo" showBoundaryControls={feed.data.total > feed.data.limit} showPageNumbers
      onChange={page => change('page', page === 1 ? '' : String(page))}
      onLimitChange={limit => change('limit', limit === 10 ? '' : String(limit))} />}
  </section>;
}
