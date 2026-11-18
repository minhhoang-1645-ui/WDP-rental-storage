import { ArrowRight, Bell, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NotificationResult } from './NotificationRows';
import { useNotifications, workspaceInboxPath, type NotificationRole } from './workspace-notifications';
import '../styles/workspace-notifications.css';

export function WorkspaceNotificationDropdown({ role }: { role: NotificationRole }) {
  const feed = useNotifications();
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const { key } = useLocation();

  const position = useCallback(() => {
    if (!trigger.current || !panel.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const popup = panel.current;
    const gutter = 12;
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(420, viewportWidth - gutter * 2);
    const below = window.innerHeight - anchor.bottom;
    const upward = below < 240 && anchor.top > below;
    popup.style.setProperty('--notice-width', `${width}px`);
    popup.style.setProperty('--notice-left', `${Math.max(gutter, Math.min(anchor.right - width, viewportWidth - width - gutter))}px`);
    popup.style.setProperty('--notice-top', upward ? 'auto' : `${anchor.bottom + 8}px`);
    popup.style.setProperty('--notice-bottom', upward ? `${window.innerHeight - anchor.top + 8}px` : 'auto');
    popup.style.setProperty('--notice-height', `${Math.max(0, (upward ? anchor.top : below) - 8 - gutter)}px`);
  }, []);

  useEffect(() => { panel.current?.hidePopover(); }, [key]);
  useEffect(() => {
    if (!expanded) return;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { capture: true, passive: true });
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [expanded, position]);

  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus();
  }
  if (!feed) return null;
  const count = feed.unread === null ? (feed.loading ? 'Đang tải…' : 'Chưa rõ số chưa đọc') : `${feed.unread} chưa đọc`;
  return <div className="workspace-notifications">
    <button ref={trigger} type="button" className="workspace-notification-trigger" popoverTarget={id}
      aria-label={`Thông báo, ${count}`} aria-controls={id} aria-expanded={expanded} onClick={position}>
      <Bell size={20} aria-hidden="true" />
      {(feed.unread ?? 0) > 0 && <span className="workspace-notification-badge" aria-hidden="true">{feed.unread! > 99 ? '99+' : feed.unread}</span>}
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-labelledby={id + '-title'} className="workspace-notification-panel" tabIndex={-1}
      onToggle={event => {
        const open = event.currentTarget.matches(':popover-open');
        setExpanded(open);
        if (open) event.currentTarget.focus();
      }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <header className="workspace-notification-heading">
        <h2 id={id + '-title'}>Thông báo</h2>
        <span aria-live="polite">{count}</span>
        <button type="button" className="workspace-notification-close" aria-label="Đóng thông báo" onClick={close}><X size={18} aria-hidden="true" /></button>
      </header>
      {expanded && <NotificationResult items={feed.recent.slice(0, 5)} compact />}
      <Link className="workspace-notification-footer" to={workspaceInboxPath(role)} onClick={() => panel.current?.hidePopover()}>
        Xem tất cả thông báo <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  </div>;
}
