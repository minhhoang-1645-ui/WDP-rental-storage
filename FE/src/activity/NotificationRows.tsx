import { CalendarCheck, Check, ClipboardList, FileText, HardHat, Headphones, Package, Receipt, Repeat2, Undo2, UserRound, Wallet, Warehouse } from 'lucide-react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useNotifications, type Notice, type NoticeView } from './workspace-notifications';

const icons = {
  appointments: CalendarCheck, maintenance: HardHat, 'support-requests': Headphones, 'stock-movements': Package,
  'damage-claims': Package, invoices: Receipt, 'deposit-settlements': Wallet, reservations: Warehouse,
  users: UserRound, contracts: FileText, 'payment-submissions': Wallet, returns: Undo2, 'early-returns': Undo2,
  transfers: Repeat2, 'transfer-orders': FileText, renewals: CalendarCheck,
};
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });

export function NotificationRows({ items, compact = false }: { items: Notice[]; compact?: boolean }) {
  const feed = useNotifications();
  if (!feed) return null;
  return <ul className="workspace-notification-list" aria-label="Danh sách thông báo">{items.map(notice => {
    const Icon = icons[notice.kind as keyof typeof icons] ?? ClipboardList;
    const at = new Date(notice.at);
    const date = Number.isFinite(at.getTime()) ? `${time.format(at)} · ${day.format(at)}` : '';
    return <li key={notice.token} className="workspace-notification-row" data-unread={notice.unread} data-important={notice.important}>
      <Icon className="workspace-notification-icon" size={18} aria-hidden="true" />
      <div className="workspace-notification-copy">
        <div className="workspace-notification-title">
          {notice.unread && <span className="workspace-notification-dot" aria-hidden="true" />}
          {compact && notice.canOpen ?
            <button type="button" className="workspace-notification-open" onClick={() => void feed.open(notice)} disabled={feed.busy}>{notice.title}</button>
            : <strong>{notice.title}</strong>}
          <span className="sr-only">{notice.unread ? 'Chưa đọc' : 'Đã đọc'}</span>
          {date && <time dateTime={notice.at}>{date}</time>}
        </div>
        {notice.summary && <p>{notice.summary}</p>}
        {!compact && notice.actionLabel && <span className="workspace-notification-action-label">Cần xử lý</span>}
        {!notice.canOpen && <p>Hồ sơ không còn khả dụng.</p>}
      </div>
      {!compact && <div className="workspace-notification-row-actions">
        {notice.unread && <button type="button" className="button-secondary workspace-notification-mark" aria-label={`Đánh dấu đã đọc · ${notice.title}`}
          title="Đánh dấu đã đọc" disabled={feed.busy} onClick={() => void feed.mark(notice)}><Check size={16} aria-hidden="true" /></button>}
        {notice.canOpen && <button type="button" className="button-secondary" disabled={feed.busy} onClick={() => void feed.open(notice)}>{notice.actionLabel || 'Xem chi tiết'}</button>}
      </div>}
    </li>;
  })}</ul>;
}

export function NotificationResult({ items, view = 'all', filtered = false, compact = false }: {
  items: Notice[]; view?: NoticeView; filtered?: boolean; compact?: boolean;
}) {
  const feed = useNotifications();
  if (!feed) return null;
  const loading = feed.loading && (!compact || !items.length);
  const empty = filtered ? 'Không tìm thấy thông báo phù hợp.' : view === 'unread' ? 'Bạn đã xem hết thông báo.'
    : view === 'action' ? 'Hiện không có việc cần xử lý.' : 'Bạn chưa có thông báo.';
  return <div className="workspace-notification-content" aria-busy={loading || feed.updating}>
    {feed.operationError && <div className="workspace-notification-error" role="alert">{feed.operationError}</div>}
    {feed.error ? <div className="workspace-notification-error" role="alert">
      <span>Không thể tải thông báo.</span><button type="button" className="button-secondary" onClick={feed.refresh}>Thử lại</button>
    </div> : loading ? <LoadingSkeleton label="Đang tải thông báo…" />
      : items.length ? <NotificationRows items={items} compact={compact} /> : <p className="workspace-notification-empty">{empty}</p>}
  </div>;
}
