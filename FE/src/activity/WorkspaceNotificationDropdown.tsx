import { ArrowRight, Bell, CalendarCheck, CalendarClock, ClipboardList, FileText, HardHat, Headphones, Package, Receipt, RefreshCw, UserRound, Wallet, Warehouse, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { notificationEntries, type ActivityEntry } from '../utils/activity';
import { isCompactNotificationRole, useWorkspaceNotifications, workspaceInboxPath, workspaceNotificationLink, type NotificationRole } from './workspace-notifications';
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
const compactIcons = { ...icons, users: UserRound, reservations: Warehouse, invoices: Receipt, appointments: CalendarCheck, contracts: FileText, 'payment-submissions': Wallet };
const compactTimestamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function NotificationRows({ role, items, unread, markRead, onOpen }: { role: NotificationRole; items: ActivityEntry[]; unread: Set<string>; markRead: (tokens: string[]) => void; onOpen?: () => void }) {
  const compact = isCompactNotificationRole(role);
  return <ul>{items.map(item => {
    const isUnread = unread.has(item.token);
    const choices = compact ? compactIcons : icons;
    const Icon = choices[item.kind as keyof typeof choices] ?? Bell;
    const link = workspaceNotificationLink(role, item, markRead);
    return <li key={item.id}>
      <Link to={link.to} state={link.state} className="workspace-notification-row" data-unread={isUnread}
        onClick={event => { if (link.onClick(event)) onOpen?.(); }}>
        <Icon size={17} aria-hidden="true" />
        <div className="workspace-notification-copy">
          <strong>{item.title}<span className="sr-only">{isUnread ? ' · Chưa đọc' : ' · Đã đọc'}</span></strong>
          {item.message && <p>{item.message}</p>}
          {item.at && <time dateTime={item.at}>{(compact ? compactTimestamp : timestamp).format(new Date(item.at))}</time>}
          {role === 'ADMIN' && <span className="workspace-notification-detail">{item.web.startsWith('/admin/users/') ? 'Xem tài khoản' : 'Xem sự kiện'}</span>}
        </div>
        {isUnread && <span className="workspace-notification-dot" aria-hidden="true" />}
      </Link>
    </li>;
  })}</ul>;
}

export function CompactNotificationList({ role, viewData, onOpen, actionView = false }: { role: 'ADMIN' | 'CUSTOMER'; viewData: ReturnType<typeof useWorkspaceNotifications>; onOpen?: () => void; actionView?: boolean }) {
  const { activity, entries, unread } = viewData;
  const [view, setView] = useState(actionView ? 'action' : 'unread');
  const [page, setPage] = useState(1);
  const selected = notificationEntries(entries, activity.read, view);
  const pageSize = onOpen ? 6 : 20;
  const pages = Math.max(1, Math.ceil(selected.length / pageSize));
  const currentPage = Math.min(page, pages);
  const loading = activity.loading && activity.checking;
  return <>
    <div className="workspace-notification-controls">
      <div role="group" aria-label="Lọc thông báo">
        {(actionView ? [['unread', 'Chưa đọc'], ['all', 'Tất cả'], ['action', 'Cần xử lý']] : [['unread', 'Chưa đọc'], ['all', 'Tất cả']]).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{label}</button>)}
      </div>
      <button type="button" disabled={!unread.size} onClick={() => activity.markRead([...unread])}>Đánh dấu tất cả đã đọc</button>
    </div>
    <div className="workspace-notification-content" aria-busy={loading}>
      {activity.failed.length > 0 && <div className="workspace-notification-error">
        <span role="status">Chưa tải đủ thông báo.</span>
        <button type="button" onClick={activity.refresh} disabled={activity.checking}><RefreshCw size={14} aria-hidden="true" />{activity.checking ? 'Đang tải…' : 'Thử lại'}</button>
      </div>}
      {selected.length ? <NotificationRows role={role} items={selected.slice((currentPage - 1) * pageSize, currentPage * pageSize)} unread={unread} markRead={activity.markRead} onOpen={onOpen} />
        : !activity.failed.length && <p className="workspace-notification-empty" role={loading ? 'status' : undefined}>{loading ? 'Đang tải thông báo…' : view === 'unread' ? 'Không có thông báo chưa đọc.' : view === 'action' ? 'Không có thông báo cần xử lý.' : 'Chưa có thông báo.'}</p>}
    </div>
    {pages > 1 && <nav className="workspace-notification-pages" aria-label="Trang thông báo">
      <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
      <span>Trang {currentPage}/{pages}{role === 'ADMIN' && <small> · {selected.length} thông báo</small>}</span>
      <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
    </nav>}
  </>;
}

export function WorkspaceNotificationDropdown({ role, userId }: { role: NotificationRole; userId: string }) {
  const viewData = useWorkspaceNotifications(role, userId);
  const { activity, entries, unread } = viewData;
  const compact = role === 'ADMIN' || role === 'CUSTOMER';
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const id = useId();
  const location = useLocation();
  const inbox = workspaceInboxPath(role);
  const recent = open && !compact ? notificationEntries(entries, activity.read, 'all').slice(0, 5) : [];
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
      aria-label={loading ? 'Thông báo, đang tải' : `Thông báo, ${count}${compact ? '' : ' trên trình duyệt'}`}
      aria-controls={id} aria-expanded={open} onClick={event => { keyboard.current = event.detail === 0; position(); }}>
      <Bell size={20} aria-hidden="true" />
      {unread.size > 0 && <span className="workspace-notification-badge" aria-hidden="true">{unread.size > 99 ? '99+' : unread.size}</span>}
    </button>
    <div ref={panel} id={id} popover="auto" role={compact ? 'dialog' : 'region'} aria-labelledby={`${id}-title`} className={`workspace-notification-panel${compact ? ' workspace-notification-compact' : ''}`} tabIndex={-1}
      onToggle={event => {
        const expanded = event.currentTarget.matches(':popover-open');
        setOpen(expanded);
        if (expanded && (keyboard.current || compact)) event.currentTarget.focus();
      }} onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation();
        panel.current?.hidePopover(); trigger.current?.focus();
      }}>
      <div className="workspace-notification-heading">
        <h2 id={`${id}-title`}>Thông báo</h2>
        <span aria-live="polite" aria-atomic="true">{loading ? 'Đang tải…' : count}</span>
        {compact && <button type="button" className="workspace-notification-close" aria-label="Đóng thông báo" onClick={() => { panel.current?.hidePopover(); trigger.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
      </div>
      {compact ? open && <CompactNotificationList role={role} viewData={viewData} onOpen={() => panel.current?.hidePopover()} /> : <div className="workspace-notification-content" aria-busy={loading}>
        {incomplete && <div className="workspace-notification-error">
          <span role="status">Chưa tải đủ thông báo.</span>
          <button type="button" onClick={activity.refresh} disabled={activity.checking}><RefreshCw size={14} aria-hidden="true" />Thử lại</button>
        </div>}
        {recent.length > 0 ? <NotificationRows role={role} items={recent} unread={unread} markRead={activity.markRead} onOpen={() => panel.current?.hidePopover()} />
          : !incomplete && <p className="workspace-notification-empty" role={loading ? 'status' : undefined}>{loading ? 'Đang tải thông báo…' : 'Chưa có thông báo.'}</p>}
      </div>}
      {role === 'ADMIN' ? <nav className="workspace-notification-admin-links" aria-label="Nhật ký Admin">
        <Link to="/admin/login-history" onClick={() => panel.current?.hidePopover()}>Lịch sử đăng nhập</Link>
        <Link to="/admin/activity" onClick={() => panel.current?.hidePopover()}>Nhật ký hoạt động</Link>
      </nav> : <Link className="workspace-notification-footer" to={inbox} onClick={() => panel.current?.hidePopover()}>
        Xem tất cả thông báo <ArrowRight size={15} aria-hidden="true" />
      </Link>}
    </div>
  </div>;
}
