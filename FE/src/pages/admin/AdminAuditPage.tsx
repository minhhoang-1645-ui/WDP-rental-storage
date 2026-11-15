import { internalPageSize } from '../../utils/internal-pagination';
import { RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { date, label } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Pagination, RefreshStatus } from '../../components/manager/PortalUi';
import { auditActor, auditTitle, type AuditEvent } from './audit-labels';

const auditFilterKeys = ['search', 'role', 'from', 'to'] as const;

export function AdminAuditPage({ category }: { category: 'LOGIN' | 'ACTIVITY' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const from = params.get('from') ?? '', to = params.get('to') ?? '';
  const invalidRange = Boolean(from && to && from > to);
  const query = new URLSearchParams({ category, page: String(page), limit: String(limit) });
  for (const key of auditFilterKeys) {
    const value = params.get(key)?.trim();
    if (value) query.set(key, value);
  }
  const data = useInternalListResource<AuditEvent>(user?.role === 'ADMIN' && !invalidRange ? `/admin/audit-events?${query}` : null, user?.id ?? '', true, true);
  const login = category === 'LOGIN';

  function changeFilter(key: typeof auditFilterKeys[number], value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      return next;
    }, { replace: true });
  }

  function clearFilters() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const key of auditFilterKeys) next.delete(key);
      next.delete('page');
      return next;
    }, { replace: true });
  }

  return <section className="admin-audit" data-category={category}>
    <PageHeader title={login ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động'} description="Thời gian Việt Nam (UTC+7).">
      <button className="button-secondary" disabled={invalidRange || data.loading || data.refreshing} onClick={data.refresh}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>
    <nav className="portal-actions" aria-label="Nhóm nhật ký"><Link className={login ? 'button-primary' : 'button-secondary'} to="/admin/login-history">Đăng nhập / đăng xuất</Link><Link className={!login ? 'button-primary' : 'button-secondary'} to="/admin/activity">Hoạt động</Link></nav>
    <div className="portal-toolbar admin-toolbar" role="search" aria-label="Bộ lọc nhật ký">
      <label className="field-label portal-search">Tìm nhật ký<input name="search" type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => changeFilter('search', event.target.value)} placeholder={login ? 'Tên hoặc email' : 'Tên, email hoặc mã hồ sơ'} /></label>
      <label className="field-label">Vai trò<select aria-label="Vai trò" name="role" value={params.get('role') ?? ''} onChange={event => changeFilter('role', event.target.value)}><option value="">Tất cả</option>{['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(role => <option key={role} value={role}>{label(role)}</option>)}</select></label>
      <label className="field-label">Từ ngày<input type="date" name="from" value={from} onChange={event => changeFilter('from', event.target.value)} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'audit-date-error' : undefined} /></label>
      <label className="field-label">Đến ngày<input type="date" name="to" value={to} onChange={event => changeFilter('to', event.target.value)} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'audit-date-error' : undefined} /></label>
      <button type="button" className="button-secondary" onClick={clearFilters}>Xóa bộ lọc</button>
    </div>
    {invalidRange && <p id="audit-date-error" className="booking-alert is-error" role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <div className="manager-table-wrap" tabIndex={0} role="region" aria-label={login ? 'Bảng lịch sử đăng nhập' : 'Bảng nhật ký hoạt động'}><table className="manager-table admin-audit-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">Tài khoản</th><th scope="col">Vai trò</th><th scope="col">{login ? 'Sự kiện' : 'Hoạt động'}</th></tr></thead><tbody>
        {data.data.items.map(event => (
          <tr key={event.id}>
            <td><time dateTime={event.createdAt}>{date(event.createdAt, true)}</time></td>
            <td><strong>{auditActor(event)}</strong>{event.actorEmail && <small>{event.actorEmail}</small>}</td>
            <td>{event.actorRole ? label(event.actorRole) : 'Chưa xác thực'}</td>
            <td><strong className={login && event.outcome === 'FAILURE' ? 'audit-failure' : undefined}>{auditTitle(event)}</strong>{!login && event.outcome === 'FAILURE' && <small className="audit-failure">Thất bại</small>}</td>
          </tr>
        ))}
      </tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp" description="Thử đổi bộ lọc. Lịch sử trước khi bật tính năng không được tạo lại." />}
      <Pagination page={page} limit={limit} onLimitChange={limit => setParams(previous => { const next = new URLSearchParams(previous); next.set('limit', String(limit)); next.delete('page'); return next; }, { replace: true })} total={data.data.total} disabled={data.loading} onChange={next => setParams(previous => { const value = new URLSearchParams(previous); value.set('page', String(next)); return value; })} />
    </>}
  </section>;
}
