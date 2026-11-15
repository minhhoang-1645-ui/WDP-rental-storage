import { internalPageSize } from '../../utils/internal-pagination';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date, label } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Pagination, RefreshStatus } from '../../components/manager/PortalUi';
import { auditActor, auditRecordPath, auditResource, auditTitle, type AuditPage } from './audit-labels';

const auditFilterKeys = ['search', 'role', 'from', 'to'] as const;

export function AdminAuditPage({ category }: { category: 'LOGIN' | 'ACTIVITY' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const query = new URLSearchParams({ category, page: String(page), limit: String(limit) });
  for (const key of auditFilterKeys) if (params.get(key)) query.set(key, params.get(key)!);
  const data = useApiResource<AuditPage>(user?.role === 'ADMIN' ? `/admin/audit-events?${query}` : null, user?.id ?? '', true);
  const login = category === 'LOGIN';
  const [filterError, setFilterError] = useState('');
  return <section className="admin-audit">
    <PageHeader title={login ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động'} description={login ? "Theo dõi đăng nhập và đăng xuất. Thời gian Việt Nam (UTC+7)." : "Theo dõi các thao tác nghiệp vụ. Thời gian Việt Nam (UTC+7)."}>
      <button className="button-secondary" disabled={data.loading || data.refreshing} onClick={data.refresh}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>
    <nav className="portal-actions" aria-label="Nhóm nhật ký"><Link className={login ? 'button-primary' : 'button-secondary'} to="/admin/login-history">Đăng nhập / đăng xuất</Link><Link className={!login ? 'button-primary' : 'button-secondary'} to="/admin/activity">Hoạt động</Link></nav>
    <form data-wdp-draft="ignore" className="portal-toolbar admin-toolbar" key={`${category}:${params.toString()}`} onSubmit={event => {
      event.preventDefault(); const input = new FormData(event.currentTarget); const next = new URLSearchParams();
      for (const key of auditFilterKeys) { const value = String(input.get(key) ?? '').trim(); if (value) next.set(key, value); }
      if (next.get('from') && next.get('to') && next.get('from')! > next.get('to')!) { setFilterError('Ngày kết thúc phải từ ngày bắt đầu trở đi.'); return; }
      setFilterError('');
      setParams(next);
    }}>
      <label className="field-label portal-search">Tìm nhật ký<input name="search" type="search" maxLength={100} defaultValue={params.get('search') ?? ''} placeholder={login ? 'Tên hoặc email' : 'Tên, email hoặc mã hồ sơ'} /></label>
      <label className="field-label">Vai trò<select aria-label="Vai trò" name="role" defaultValue={params.get('role') ?? ''}><option value="">Tất cả</option>{['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(role => <option key={role} value={role}>{label(role)}</option>)}</select></label>
      <label className="field-label">Từ ngày<input type="date" name="from" defaultValue={params.get('from') ?? ''} /></label>
      <label className="field-label">Đến ngày<input type="date" name="to" defaultValue={params.get('to') ?? ''} /></label>
      <button type="submit" className="button-primary">Lọc nhật ký</button>
      <button type="button" className="button-secondary" onClick={() => { setFilterError(''); setParams({}); }}>Xóa bộ lọc</button>
    </form>
    {filterError && <p className="booking-alert is-error" role="alert">{filterError}</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <div className="manager-table-wrap" tabIndex={0} role="region" aria-label={login ? 'Bảng lịch sử đăng nhập' : 'Bảng nhật ký hoạt động'}><table className="manager-table admin-audit-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">Tài khoản</th><th scope="col">Vai trò</th><th scope="col">{login ? 'Sự kiện' : 'Hoạt động'}</th>{!login && <th scope="col">Hồ sơ liên quan</th>}</tr></thead><tbody>
        {data.data.items.map(event => {
          const recordPath = auditRecordPath(event);
          return <tr key={event.id}>
            <td><time dateTime={event.createdAt}>{date(event.createdAt, true)}</time></td>
            <td><strong>{auditActor(event)}</strong>{event.actorEmail && <small>{event.actorEmail}</small>}</td>
            <td>{event.actorRole ? label(event.actorRole) : 'Chưa xác thực'}</td>
            <td><strong className={login && event.outcome === 'FAILURE' ? 'audit-failure' : undefined}>{auditTitle(event)}</strong>{!login && event.outcome === 'FAILURE' && <small className="audit-failure">Thất bại</small>}</td>
            {!login && <td>{auditResource(event.resource)}{event.resourceId && <small>{recordPath ? <Link className="audit-record-link" to={recordPath}>{event.resourceId}</Link> : event.resourceId}</small>}</td>}
          </tr>;
        })}
      </tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp" description="Thử đổi bộ lọc. Lịch sử trước khi bật tính năng không được tạo lại." />}
      <Pagination page={page} limit={limit} onLimitChange={limit => setParams(previous => { const next = new URLSearchParams(previous); next.set('limit', String(limit)); next.delete('page'); return next; }, { replace: true })} total={data.data.total} disabled={data.loading} onChange={next => setParams(previous => { const value = new URLSearchParams(previous); value.set('page', String(next)); return value; })} />
    </>}
  </section>;
}
