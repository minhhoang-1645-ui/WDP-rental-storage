import { useState } from 'react';
import { Bell, ArrowRight, CheckCheck, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useActivity } from './context';
import { useDialog } from '../hooks/useDialog';
import { hasDraft, LIVE_REFRESH } from '../services/live-events';
import type { ActivityEntry } from '../utils/activity';

export function ActivityBell() {
  const activity = useActivity(), [open, setOpen] = useState(false);
  const unread = activity.entries.filter(item => !activity.read.includes(item.token)).length;
  return <><button type="button" className="activity-bell" aria-label={`Thông báo, ${unread} chưa đọc`} onClick={() => setOpen(true)}><Bell size={18} /><span className="activity-bell-label">Thông báo</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>{open && <ActivityPanel onClose={() => setOpen(false)} />}</>;
}
function ActivityPanel({ onClose }: { onClose: () => void }) {
  const activity = useActivity(), [view, setView] = useState<'all' | 'unread' | 'action'>('unread');
  const dialog = useDialog(true, false, onClose);
  const entries = activity.entries.filter(item => view === 'all' || (view === 'action' ? item.action : !activity.read.includes(item.token)));
  return <div className="activity-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="activity-panel" ref={dialog} role="dialog" aria-modal="true" aria-label="Trung tâm thông báo" tabIndex={-1}>
    <header><div><h2>Thông báo & việc cần làm</h2><p>Trạng thái hồ sơ của bạn, kiểm tra khi ứng dụng đang mở.</p></div><button className="icon-button" type="button" aria-label="Đóng thông báo" onClick={onClose}><X size={20} /></button></header>
    <div className="activity-controls"><button type="button" className="button-secondary" onClick={activity.refresh} disabled={activity.checking}><RefreshCw size={15} />{activity.checking ? 'Đang kiểm tra…' : 'Kiểm tra mới'}</button><button type="button" className="portal-text-button" onClick={() => activity.markRead(activity.entries.map(item => item.token))}><CheckCheck size={15} />Đánh dấu đã đọc</button></div>
    <div className="activity-tabs" role="tablist" aria-label="Lọc thông báo">{([['unread', 'Chưa đọc'], ['action', 'Cần thực hiện'], ['all', 'Tất cả']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}>{label} ({activity.entries.filter(item => key === 'all' || (key === 'action' ? item.action : !activity.read.includes(item.token))).length})</button>)}</div>
    <ActivityStatus />
    <div className="activity-items">{activity.loading && !activity.entries.length ? <p role="status">Đang tải thông tin…</p> : !entries.length ? <p className="activity-empty">{view === 'unread' ? 'Bạn đã xem hết thông báo hiện có. Các việc chưa hoàn tất vẫn nằm trong Cần thực hiện.' : 'Chưa có hồ sơ phù hợp trong mục này.'}</p> : entries.map(item => <ActivityLink key={item.id} item={item} onOpen={onClose} />)}</div>
    <footer>{activity.entries.length === 100 && <p>Đang hiển thị 100 hồ sơ ưu tiên. Mở danh sách chức năng tương ứng để xem đầy đủ.</p>}Đã đọc chỉ ghi nhận việc bạn đã xem, không thay đổi trạng thái yêu cầu. Dấu đã đọc được lưu theo tài khoản trên thiết bị này.</footer>
  </section></div>;
}
function ActivityLink({ item, onOpen }: { item: ActivityEntry; onOpen?: () => void }) {
  const activity = useActivity(), unread = !activity.read.includes(item.token);
  return <Link to={item.web} className={`activity-item${unread ? ' is-unread' : ''}`} onClick={() => { activity.markRead([item.token]); onOpen?.(); window.dispatchEvent(new CustomEvent(LIVE_REFRESH)); }}><div><small>{item.code}{item.action ? ' · Cần thực hiện' : ''}{unread ? ' · Chưa đọc' : ''}</small><strong>{item.title}</strong><p>{item.message}</p>{item.at && <time dateTime={item.at}>{new Date(item.at).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}</time>}</div><ArrowRight size={17} /></Link>;
}
export function ActivityStatus() {
  const activity = useActivity();
  return <div className="activity-status"><span>{activity.checkedAt ? `Lần kiểm tra: ${new Date(activity.checkedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Đang kết nối thông báo'} · Tự kiểm tra mỗi 30 giây</span>{activity.failed.length > 0 && <p role="status">Chưa tải được: {activity.failed.join(', ')}. Thông tin đã tải trước đó được giữ lại; dùng Kiểm tra mới để thử lại.</p>}</div>;
}
export function ActivityRefreshNote() {
  const activity = useActivity(), [message, setMessage] = useState('');
  if (!activity.changed) return null;
  return <div className="activity-update-note" role="status"><span>{message || 'Có cập nhật mới trong hồ sơ. Thông báo và các danh sách không có nội dung đang nhập được làm mới tự động.'}</span><button type="button" className="portal-text-button" onClick={() => { if (hasDraft()) { setMessage('Bạn đang nhập nội dung. Hãy lưu hoặc đóng form trước khi cập nhật màn hình để giữ nội dung đang nhập.'); return; } window.dispatchEvent(new CustomEvent(LIVE_REFRESH)); activity.acknowledge(); setMessage(''); }}>Cập nhật màn hình</button><button type="button" className="icon-button" aria-label="Đóng nhắc cập nhật" onClick={activity.acknowledge}><X size={15} /></button></div>;
}
export function ActivitySummary() {
  const activity = useActivity(), [expanded, setExpanded] = useState(false);
  const actionable = activity.entries.filter(item => item.action), unread = activity.entries.filter(item => !activity.read.includes(item.token));
  const urgent = actionable.slice(0, 2);
  const updates = [...unread].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).filter(item => !urgent.some(entry => entry.id === item.id));
  const shown = [...urgent, ...updates.slice(0, 2), ...actionable.slice(2)].filter((item, index, items) => items.findIndex(entry => entry.id === item.id) === index).slice(0, expanded ? 12 : 4);
  return <section className="activity-summary"><div className="work-hub-heading"><div><h2>Cần thực hiện & cập nhật mới</h2><p>{actionable.length} hồ sơ cần thực hiện · {unread.length} cập nhật chưa đọc</p></div><ActivityBell /></div><ActivityStatus />{shown.map(item => <ActivityLink key={item.id} item={item} />)}{activity.loading && <p role="status">Đang kiểm tra hồ sơ…</p>}{!activity.loading && !shown.length && <p className="activity-empty">Chưa có việc cần thực hiện hoặc cập nhật chưa đọc trong dữ liệu đã tải.</p>}{(actionable.length || unread.length) > 4 && <button type="button" className="portal-text-button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn' : 'Xem thêm hồ sơ'}</button>}</section>;
}
