import { ArrowRight, History, RefreshCw, ShieldCheck, UserRound, UserRoundX, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useLiveRefresh } from '../../services/live-events';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { date, first, label, type Page } from '../../components/manager/portal-data';
import { LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { auditAction, auditResource } from './audit-labels';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh('/admin/users', refresh);
  const audit = useApiResource<Page>(user?.id ? '/admin/audit-events?category=ACTIVITY&role=ADMIN&page=1&limit=5' : null, user?.id, true);
  const refreshAudit = audit.refresh;
  useLiveRefresh('/admin/users', refreshAudit);
  useLiveRefresh('/admin/business-policies', refreshAudit);
  const key = `${user?.id}:${revision}`;
  const [state, setState] = useState<{ key: string; pages?: Page[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/admin/users?page=1&limit=5', '/admin/users?page=1&limit=1&role=STAFF', '/admin/users?page=1&limit=1&role=MANAGER', '/admin/users?page=1&limit=1&accountStatus=DISABLED'].map(path => apiRequest<Page>(path, { signal: controller.signal })))
      .then(pages => { if (!controller.signal.aborted) setState({ key, pages }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không thể tải tài khoản.' }); });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  const metrics = [
    { title: 'Tổng tài khoản', value: current?.pages?.[0].total, to: '/admin/users', icon: Users, hint: 'Tất cả vai trò' },
    { title: 'Nhân viên', value: current?.pages?.[1].total, to: '/admin/users?role=STAFF', icon: UserRound, hint: 'Vai trò Staff' },
    { title: 'Quản lý', value: current?.pages?.[2].total, to: '/admin/users?role=MANAGER', icon: ShieldCheck, hint: 'Vai trò Manager' },
    { title: 'Đã vô hiệu hóa', value: current?.pages?.[3].total, to: '/admin/users?status=DISABLED', icon: UserRoundX, hint: 'Tài khoản bị chặn đăng nhập' },
  ];
  return <section className="admin-dashboard">
    <PageHeader title="Tổng quan quản trị"><button className="button-secondary" disabled={!current || audit.refreshing} onClick={() => { refresh(); refreshAudit(); }}><RefreshCw size={16} />Làm mới</button></PageHeader>
    <LoadState loading={!current} error={current?.error ?? ''} retry={refresh} />
    <div className="internal-kpis admin-kpis" aria-busy={!current}>{metrics.map(({ title, value, to, icon: Icon, hint }) =>
      <Link className="internal-kpi" key={title} to={to}><span>{title}<Icon size={18} aria-hidden="true" /></span><strong>{value?.toLocaleString('vi-VN') ?? '—'}</strong><small>{hint}</small></Link>
    )}</div>
    <div className="admin-dashboard-panels">
      <section className="internal-priority" aria-labelledby="admin-recent-users">
        <div className="internal-section-heading"><h2 id="admin-recent-users">Tài khoản gần đây</h2><Link className="portal-text-button" to="/admin/users" aria-label="Xem tất cả tài khoản">Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link></div>
        {current?.pages && !current.pages[0].items.length && <p>Chưa có tài khoản.</p>}
        <ul className="internal-task-list admin-preview">{current?.pages?.[0].items.slice(0, 5).map(row => <li key={first(row, 'id')}>
          <Link to={`/admin/users/${encodeURIComponent(first(row, 'id'))}`}>
            <div><strong>{first(row, 'fullName')}</strong><small>{first(row, 'email')}</small>
              <small>{label(row.role)}{row.createdAt ? ` · ${date(row.createdAt, true)}` : ''}</small></div>
            <Status value={row.accountStatus} /><ArrowRight size={16} aria-hidden="true" />
          </Link>
        </li>)}</ul>
      </section>
      <section className="internal-priority" aria-labelledby="admin-recent-audit">
        <div className="internal-section-heading"><h2 id="admin-recent-audit">Hoạt động quản trị gần đây</h2><Link className="portal-text-button" to="/admin/activity?role=ADMIN" aria-label="Xem tất cả hoạt động quản trị">Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link></div>
        <LoadState loading={audit.loading} error={audit.error} retry={refreshAudit} />
        {audit.data && !audit.data.items.length && <p>Chưa có sự kiện quản trị được ghi nhận.</p>}
        <ul className="internal-task-list admin-preview">{audit.data?.items.slice(0, 5).map(row => <li key={first(row, 'id')}>
          <div className="admin-audit-preview"><History size={17} aria-hidden="true" />
            <div><strong>{row.resource === 'users' && row.action === 'CREATE' ? 'Tạo tài khoản' : row.resource === 'users' && row.action === 'STATUS' ? 'Đổi trạng thái tài khoản' : `${auditAction(row.action)} · ${auditResource(row.resource)}`}</strong>
              <small>{[first(row, 'actorName', 'actorEmail'), date(row.createdAt, true)].filter(Boolean).join(' · ')}</small></div>
            <Status value={row.outcome === 'SUCCESS' ? 'CONFIRMED' : 'REJECTED'} text={row.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'} />
          </div>
        </li>)}</ul>
      </section>
    </div>
  </section>;
}
