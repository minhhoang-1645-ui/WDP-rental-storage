import { ArrowRight, Bell, CalendarClock, ClipboardList, HardHat, Headphones, Package, RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { notificationEntries } from '../utils/activity';
import { useWorkspaceNotifications, workspaceInboxPath, workspaceNotificationLink, type NotificationRole } from './workspace-notifications';
import '../styles/workspace-notifications.css';

const icons = {
  appointments: CalendarClock,
  maintenance: HardHat,
  'support-requests': Headphones,
  'stock-movements': Package,
  'damage-claims': Package,
  invoices: Wallet,
  'deposit-settlements': Wallet,
  reservations: ClipboardList,
};
const timestamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

export function WorkspaceNotificationDropdown({ role, userId }: { role: NotificationRole; userId: string }) {
  const { activity, entries, unread } = useWorkspaceNotifications(role, userId);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const id = useId();
  const location = useLocation();
  const inbox = workspaceInboxPath(role);
  const recent = open ? notificationEntries(entries, activity.read, 'all').slice(0, 5) : [];
  const loading = activity.loading && activity.checking;
  const incomplete = activity.failed.length > 0;
  const count = incomplete && Object.keys(activity.data).length === 0 ? 'Chưa rõ số chưa đọc' : `${unread.size} chưa đọc`;

  const position = useCallback(() => {
    const button = trigger.current;
    const popup = panel.current;
    if (!button || !popup) return;
    const anchor = button.getBoundingClientRect();
    const gutter = 12;
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(376, viewportWidth - gutter * 2);
    const below = window.innerHeight - anchor.bottom;
    const above = anchor.top;
    const upward = below < 270 && above > below;
    popup.style.setProperty('--notice-width', `${width}px`);
    popup.style.setProperty('--notice-left', `${Math.max(gutter, Math.min(anchor.right - width, viewportWidth - width - gutter))}px`);
    popup.style.setProperty('--notice-top', upward ? 'auto' : `${anchor.bottom + 8}px`);
    popup.style.setProperty('--notice-bottom', upward ? `${window.innerHeight - anchor.top + 8}px` : 'auto');
    popup.style.setProperty('--notice-height', `${Math.max(0, (upward ? above : below) - 8 - gutter)}px`);
  }, []);

  useEffect(() => { panel.current?.hidePopover(); }, [location.key]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { capture: true, passive: true });
    const resize = new ResizeObserver(position);
    const topbar = trigger.current?.closest('.portal-topbar');
    if (topbar) resize.observe(topbar);
    return () => { resize.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, position]);

  return <div className="workspace-notifications">
    <button ref={trigger} type="button" className="workspace-notification-trigger" popoverTarget={id}
      aria-label={loading ? 'Thông báo, đang tải' : `Thông báo, ${count} trên trình duyệt`}
      aria-controls={id} aria-expanded={open} onClick={event => { keyboard.current = event.detail === 0; position(); }}>
      <Bell size={20} aria-hidden="true" />
      {unread.size > 0 && <span className="workspace-notification-badge" aria-hidden="true">{unread.size > 99 ? '99+' : unread.size}</span>}
    </button>
    <div ref={panel} id={id} popover="auto" role="region" aria-labelledby={`${id}-title`} className="workspace-notification-panel" tabIndex={-1}
      onToggle={event => {
        const expanded = event.currentTarget.matches(':popover-open');
        setOpen(expanded);
        if (expanded && keyboard.current) event.currentTarget.focus();
      }} onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation();
        panel.current?.hidePopover(); trigger.current?.focus();
      }}>
      <div className="workspace-notification-heading">
        <h2 id={`${id}-title`}>Thông báo</h2>
        <span aria-live="polite" aria-atomic="true">{loading ? 'Đang tải…' : count}</span>
      </div>
      <div className="workspace-notification-content" aria-busy={loading}>
        {incomplete && <div className="workspace-notification-error">
          <span role="status">Chưa tải đủ thông báo.</span>
          <button type="button" onClick={activity.refresh} disabled={activity.checking}><RefreshCw size={14} aria-hidden="true" />Thử lại</button>
        </div>}
        {recent.length > 0 ? <ul>{recent.map(item => {
          const isUnread = unread.has(item.token);
          const Icon = icons[item.kind as keyof typeof icons] ?? Bell;
          const link = workspaceNotificationLink(role, item, activity.markRead);
          return <li key={item.id}>
            <Link to={link.to} state={link.state} className="workspace-notification-row" data-unread={isUnread}
              onClick={event => { if (link.onClick(event)) panel.current?.hidePopover(); }}>
              <Icon size={17} aria-hidden="true" />
              <div className="workspace-notification-copy">
                <strong>{item.title}<span className="sr-only">{isUnread ? ' · Chưa đọc' : ' · Đã đọc'}</span></strong>
                <p>{item.message}</p>
                {item.at && <time dateTime={item.at}>{timestamp.format(new Date(item.at))}</time>}
              </div>
              {isUnread && <span className="workspace-notification-dot" aria-hidden="true" />}
            </Link>
          </li>;
        })}</ul> : !incomplete && <p className="workspace-notification-empty" role={loading ? 'status' : undefined}>{loading ? 'Đang tải thông báo…' : 'Chưa có thông báo.'}</p>}
      </div>
      <Link className="workspace-notification-footer" to={inbox} onClick={() => panel.current?.hidePopover()}>
        Xem tất cả thông báo <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  </div>;
}
