import { internalPageSize } from '../../utils/internal-pagination';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date, first, label, type Page } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Pagination } from '../../components/manager/PortalUi';
import { auditAction, auditResource } from './audit-labels';

export function AdminAuditPage({ category }: { category: 'LOGIN' | 'ACTIVITY' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const query = new URLSearchParams({ category, page: String(page), limit: String(limit) });
  for (const key of ['search', 'role', 'outcome', 'from', 'to']) if (params.get(key)) query.set(key, params.get(key)!);
  const data = useApiResource<Page>(user?.role === 'ADMIN' ? `/admin/audit-events?${query}` : null, user?.id ?? '');
  const login = category === 'LOGIN';
  const [filterError, setFilterError] = useState('');
  return <section>
    <PageHeader title={login ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động'} description="Nhật ký chỉ đọc. Thời gian hiển thị theo Việt Nam (UTC+7); chỉ gồm sự kiện ghi nhận sau khi tính năng được bật.">
      <button className="button-secondary" disabled={data.loading || data.refreshing} onClick={data.refresh}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    <nav className="portal-actions" aria-label="Nhóm nhật ký"><Link className={login ? 'button-primary' : 'button-secondary'} to="/admin/login-history">Đăng nhập</Link><Link className={!login ? 'button-primary' : 'button-secondary'} to="/admin/activity">Hoạt động</Link></nav>
    <form data-wdp-draft="ignore" className="portal-toolbar" key={`${category}:${params.toString()}`} onSubmit={event => {
      event.preventDefault(); const input = new FormData(event.currentTarget); const next = new URLSearchParams();
      for (const key of ['search', 'role', 'outcome', 'from', 'to']) { const value = String(input.get(key) ?? '').trim(); if (value) next.set(key, value); }
      if (next.get('from') && next.get('to') && next.get('from')! > next.get('to')!) { setFilterError('Ngày kết thúc phải từ ngày bắt đầu trở đi.'); return; }
      setFilterError('');
      setParams(next);
    }}>
      <label className="field-label portal-search">Tìm nhật ký<input name="search" type="search" maxLength={100} defaultValue={params.get('search') ?? ''} placeholder="Tên, email hoặc mã hồ sơ" /></label>
      <label className="field-label">Kết quả<select aria-label="Kết quả" name="outcome" defaultValue={params.get('outcome') ?? ''}><option value="">Tất cả</option><option value="SUCCESS">Thành công</option><option value="FAILURE">Thất bại</option></select></label>
      <label className="field-label">Vai trò<select aria-label="Vai trò" name="role" defaultValue={params.get('role') ?? ''}><option value="">Tất cả</option>{['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(role => <option key={role} value={role}>{label(role)}</option>)}</select></label>
      <label className="field-label">Từ ngày<input type="date" name="from" defaultValue={params.get('from') ?? ''} /></label>
      <label className="field-label">Đến ngày<input type="date" name="to" defaultValue={params.get('to') ?? ''} /></label>
      <button type="submit" className="button-primary">Lọc nhật ký</button>
      <button type="button" className="button-secondary" onClick={() => { setFilterError(''); setParams({}); }}>Xóa bộ lọc</button>
    </form>
    {filterError && <p className="booking-alert is-error" role="alert">{filterError}</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Thời gian</th><th>Tài khoản</th><th>Vai trò</th><th>Thao tác</th><th>Kết quả</th><th>Chi tiết</th></tr></thead><tbody>
        {data.data.items.map(row => <tr key={first(row, 'id')}>
          <td>{date(row.createdAt, true)}</td>
          <td style={{ overflowWrap: 'anywhere' }}><strong>{first(row, 'actorName') || 'Không xác định'}</strong><small>{first(row, 'actorEmail') || 'Không có email hợp lệ'}</small></td>
          <td>{row.actorRole ? label(row.actorRole) : 'Chưa xác thực'}</td>
          <td><strong>{auditAction(row.action)}</strong>{!login && <small>{auditResource(row.resource)}</small>}</td>
          <td><span className={`manager-status ${row.outcome === 'SUCCESS' ? 'is-confirmed' : 'is-rejected'}`}>{row.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'}</span></td>
          <td style={{ maxWidth: 300, overflowWrap: 'anywhere' }}><details><summary>Xem chi tiết</summary><p>Mã hồ sơ: {first(row, 'resourceId') || '—'}</p><p>HTTP: {first(row, 'httpStatus')} · IP: {first(row, 'ipAddress') || '—'}</p><p>{first(row, 'method')} {first(row, 'route')}</p><small>Mã hành động: {first(row, 'action')}</small></details></td>
        </tr>)}
      </tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp" description="Thử đổi bộ lọc. Lịch sử trước khi bật tính năng không được tạo lại." />}
      <Pagination page={page} limit={limit} onLimitChange={limit => setParams(previous => { const next = new URLSearchParams(previous); next.set('limit', String(limit)); next.delete('page'); return next; }, { replace: true })} total={data.data.total} disabled={data.loading} onChange={next => setParams(previous => { const value = new URLSearchParams(previous); value.set('page', String(next)); return value; })} />
    </>}
  </section>;
}
