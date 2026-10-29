import { useState } from 'react';
import { Bell, ArrowLeft, ArrowRight, CheckCheck, RefreshCw, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useActivity } from './context';
import { useDialog } from '../hooks/useDialog';
import { hasDraft, LIVE_REFRESH } from '../services/live-events';
import { filterNotifications, notificationGroup, notificationKinds } from '../utils/notification-tools';
import type { ActivityEntry } from '../utils/activity';

function useInboxPath() { const { user } = useAuth(); return `/${user?.role.toLowerCase() ?? 'customer'}/notifications`; }
export function ActivityBell() {
  const activity = useActivity(), [open, setOpen] = useState(false);
  const unread = activity.entries.filter(item => !activity.read.includes(item.token)).length;
  return <><button type="button" className="activity-bell" aria-label={`Thông báo, ${unread} chưa đọc`} onClick={() => setOpen(true)}><Bell size={18} /><span className="activity-bell-label">Thông báo</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>{open && <ActivityPanel onClose={() => setOpen(false)} />}</>;
}
function ActivityPanel({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(true, false, onClose), path = useInboxPath();
  return <div className="activity-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="activity-panel" ref={dialog} role="dialog" aria-modal="true" aria-label="Trung tâm thông báo" tabIndex={-1}>
    <header><div><h2>Thông báo & việc cần làm</h2><p>Chọn một hồ sơ để xem kết quả hoặc thực hiện bước tiếp theo.</p></div><button className="icon-button" type="button" aria-label="Đóng thông báo" onClick={onClose}><X size={20} /></button></header>
    <NotificationList compact onOpen={onClose} />
    <footer><Link to={path} onClick={onClose}>Mở trung tâm thông báo <ArrowRight size={14} /></Link><p>Đã đọc chỉ ghi nhận bạn đã xem, không hoàn tất công việc. Dấu đọc được lưu theo tài khoản trên trình duyệt này.</p></footer>
  </section></div>;
}
export function ActivityInboxPage() {
  const path = useInboxPath(), home = path.replace('/notifications', '');
  return <section className="activity-inbox-page"><Link to={home} className="customer-back"><ArrowLeft size={16} />Về tổng quan</Link><header className="work-hub-heading"><div><h1>Thông báo & việc cần làm</h1><p>Tra cứu trạng thái mới nhất của từng hồ sơ và mở đúng nơi cần xử lý.</p></div></header><NotificationList /><p className="activity-inbox-footnote">Mỗi mục phản ánh trạng thái hiện tại của một hồ sơ, không phải toàn bộ lịch sử sự kiện. Xem chi tiết hồ sơ để đối chiếu quá trình xử lý. Dấu đọc lưu trên trình duyệt này; chưa có thông báo đẩy khi ứng dụng đóng.</p></section>;
}
function NotificationList({ compact = false, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const activity = useActivity(), [params] = useSearchParams();
  const [view, setView] = useState(params.get('view') === 'action' ? 'action' : 'unread');
  const [kind, setKind] = useState('all'), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const selected = filterNotifications(activity.entries, activity.read, view, kind, search);
  const size = compact ? 8 : 20, pages = Math.max(1, Math.ceil(selected.length / size)), currentPage = Math.min(page, pages);
  const visible = selected.slice((currentPage - 1) * size, currentPage * size);
  const kinds = [...new Set(activity.entries.map(notificationGroup))];
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  return <>
    <div className="activity-controls"><button type="button" className="button-secondary" onClick={activity.refresh} disabled={activity.checking}><RefreshCw size={15} />{activity.checking ? 'Đang kiểm tra…' : 'Kiểm tra mới'}</button><button type="button" className="portal-text-button" disabled={!selected.some(item => !activity.read.includes(item.token))} title="Đánh dấu các kết quả đang lọc là đã đọc" onClick={() => activity.markRead(selected.map(item => item.token))}><CheckCheck size={15} />Đánh dấu đã đọc</button></div>
    <div className="activity-tabs" aria-label="Lọc thông báo">{([['unread', 'Chưa đọc'], ['action', 'Cần thực hiện'], ['all', 'Tất cả']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => change(setView, key)}>{label} ({activity.entries.filter(item => key === 'all' || (key === 'action' ? item.action : !activity.read.includes(item.token))).length})</button>)}</div>
    <div className="notification-filters"><label><span><Search size={14} />Tìm thông báo</span><input aria-label="Tìm thông báo" type="search" value={search} onChange={event => change(setSearch, event.target.value)} placeholder="Mã hồ sơ, nội dung, kết quả…" /></label><label><span>Nghiệp vụ</span><select aria-label="Nghiệp vụ" value={kind} onChange={event => change(setKind, event.target.value)}><option value="all">Tất cả nghiệp vụ</option>{kinds.map(value => <option key={value} value={value}>{notificationKinds[value] ?? value}</option>)}</select></label></div>
    <ActivityStatus />
    <div className="activity-items" aria-busy={activity.loading}>
      {activity.loading && !activity.entries.length ? <p role="status">Đang tải thông tin…</p> : !visible.length ? <p className="activity-empty">{activity.failed.length ? 'Chưa lấy đủ thông tin. Hãy kết nối lại và kiểm tra mới; chưa thể kết luận không có công việc.' : search ? 'Không có kết quả phù hợp. Thử xóa từ khóa hoặc đổi bộ lọc.' : view === 'unread' ? 'Bạn đã xem hết thông báo hiện có. Việc chưa hoàn tất vẫn nằm trong Cần thực hiện.' : 'Chưa có hồ sơ trong mục này.'}</p> : visible.map(item => <ActivityLink key={item.id} item={item} onOpen={onOpen} />)}
    </div>
    {selected.length > 0 && <div className="notification-pagination"><span>{(currentPage - 1) * size + 1}–{Math.min(currentPage * size, selected.length)} / {selected.length} hồ sơ</span><div><button type="button" className="button-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</button><span>Trang {currentPage}/{pages}</span><button type="button" className="button-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div></div>}
  </>;
}
function ActivityLink({ item, onOpen }: { item: ActivityEntry; onOpen?: () => void }) {
  const activity = useActivity(), unread = !activity.read.includes(item.token);
  return <Link to={item.web} className={`activity-item${unread ? ' is-unread' : ''}`} onClick={() => { activity.markRead([item.token]); onOpen?.(); window.dispatchEvent(new CustomEvent(LIVE_REFRESH)); }}><div><small>{notificationKinds[item.kind]} · {item.code}{item.action ? ' · Cần thực hiện' : ''}{unread ? ' · Chưa đọc' : ''}</small><strong>{item.title}</strong><p>{item.message}</p>{item.at && <time dateTime={item.at}>{new Date(item.at).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}</time>}<span className="activity-item-cta">{item.action ? 'Xem bước tiếp theo' : 'Xem chi tiết'} <ArrowRight size={13} /></span></div></Link>;
}
export function ActivityStatus() {
  const activity = useActivity();
  return <div className="activity-status"><span className={activity.failed.length ? 'connection-dot is-warning' : 'connection-dot'} aria-hidden="true" /><span>{activity.checking ? 'Đang kiểm tra cập nhật…' : activity.checkedAt ? `Lần kiểm tra: ${new Date(activity.checkedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Đang kết nối thông báo'} · Tự kiểm tra mỗi 15 giây khi mở trang</span>{activity.failed.length > 0 && <p role="status">Chưa tải được: {activity.failed.join(', ')}. Dữ liệu đã có được giữ lại và có thể chưa mới nhất. Kết nối lại để tự cập nhật hoặc bấm Kiểm tra mới.</p>}</div>;
}
export function ActivityRefreshNote() {
  const activity = useActivity(), path = useInboxPath(), [message, setMessage] = useState('');
  if (!activity.changed) return null;
  return <div className="activity-update-note" role="status" aria-live="polite"><Bell size={17} /><span>{message || `Vừa nhận ${activity.updateCount} cập nhật hồ sơ. Các màn hình không có nội dung đang nhập đã tự làm mới.`}</span><Link to={path} onClick={activity.acknowledge}>Xem thông báo</Link><button type="button" className="portal-text-button" onClick={() => { if (hasDraft()) { setMessage('Bạn đang nhập nội dung. Hãy lưu hoặc đóng form trước khi cập nhật màn hình để giữ nội dung đang nhập.'); return; } window.dispatchEvent(new CustomEvent(LIVE_REFRESH)); activity.acknowledge(); setMessage(''); }}>Cập nhật màn hình</button><button type="button" className="icon-button" aria-label="Đóng nhắc cập nhật" onClick={activity.acknowledge}><X size={15} /></button></div>;
}
export function ActivitySummary() {
  const activity = useActivity(), path = useInboxPath(), [expanded, setExpanded] = useState(false);
  const actionable = activity.entries.filter(item => item.action), unread = activity.entries.filter(item => !activity.read.includes(item.token));
  const recent = [...unread].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  const combined = [...actionable, ...recent].filter((item, index, items) => items.findIndex(entry => entry.id === item.id) === index);
  return <section className="activity-summary"><div className="work-hub-heading"><div><h2>Cần thực hiện & cập nhật mới</h2><p>{activity.loading ? 'Đang tải công việc và thông báo…' : `${actionable.length} hồ sơ cần thực hiện · ${unread.length} cập nhật chưa đọc`}</p></div><Link to={path} className="portal-text-button">Xem tất cả <ArrowRight size={14} /></Link></div><ActivityStatus />{combined.slice(0, expanded ? 12 : 2).map(item => <ActivityLink key={item.id} item={item} />)}{activity.loading && <p role="status">Đang kiểm tra hồ sơ…</p>}{!activity.loading && !combined.length && <p className="activity-empty">{activity.failed.length ? 'Chưa lấy đủ dữ liệu. Kiểm tra kết nối để cập nhật công việc.' : 'Chưa có việc cần thực hiện hoặc cập nhật chưa đọc.'}</p>}{combined.length > 2 && <button type="button" className="portal-text-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn' : 'Xem thêm việc & cập nhật'}</button>}</section>;
}
