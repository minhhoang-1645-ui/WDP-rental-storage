import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ActivityEntry } from '../../utils/activity';
import { date } from '../manager/portal-data';

export function InternalKpis({ items }: { items: { title: string; value: ReactNode; hint?: string; to: string }[] }) {
  return <div className="internal-kpis">{items.map(item => <Link className="internal-kpi" key={item.title} to={item.to}><span>{item.title}</span><strong>{item.value}</strong>{item.hint && <small>{item.hint}</small>}</Link>)}</div>;
}
export function InternalPriority({ entries, to, loading, failed, onRead }: { entries: ActivityEntry[]; to: string; loading: boolean; failed: string[]; onRead: (tokens: string[]) => void }) {
  return <section className="internal-priority" aria-label="Việc ưu tiên">
    <div className="internal-section-heading"><h2>Việc ưu tiên</h2><Link className="portal-text-button" to={to}>Xem tất cả <ArrowRight size={15} /></Link></div>
    {loading && <p role="status">Đang tải công việc…</p>}
    {failed.length > 0 && <p role="alert" className="booking-alert is-error">Chưa tải được: {failed.join(', ')}. Danh sách hiện chưa đầy đủ.</p>}
    {!loading && !failed.length && !entries.length && <p>Không có việc cần xử lý.</p>}
    <ul className="internal-task-list">{entries.slice(0, 5).map(item => <li key={item.id}><Link to={item.web} onClick={() => onRead([item.token])}><div><strong>{item.title}</strong><small>{item.code}{item.at ? ` · ${date(item.at, true)}` : ''}</small></div><ArrowRight size={18} /></Link></li>)}</ul>
  </section>;
}
