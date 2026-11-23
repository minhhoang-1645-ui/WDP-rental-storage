import { ArrowRight, History, LogIn, LogOut, RefreshCw, ShieldCheck, UserRound, UserRoundX, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useLiveRefresh } from '../../services/live-events';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { date, label, type Page } from '../../components/manager/portal-data';
import { LoadState, PageHeader, RefreshStatus } from '../../components/manager/PortalUi';
import { DashboardSkeleton } from '../../components/LoadingSkeleton';
import { auditActor, auditRecordPath, auditResource, auditTitle, type AuditPage } from './audit-labels';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh('/admin/users', refresh);
  const login = useApiResource<AuditPage>(user?.id ? '/admin/audit-events?category=LOGIN&page=1&limit=5' : null, user?.id, true);
  const activity = useApiResource<AuditPage>(user?.id ? '/admin/audit-events?category=ACTIVITY&page=1&limit=5' : null, user?.id, true);
  useLiveRefresh('/admin/users', activity.refresh);
  const key = `${user?.id}:${revision}`;
  const [state, setState] = useState<{ key: string; pages?: Page[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/admin/users?page=1&limit=1', '/admin/users?page=1&limit=1&role=FACILITY_STAFF', '/admin/users?page=1&limit=1&role=FACILITY_MANAGER', '/admin/users?page=1&limit=1&accountStatus=DISABLED'].map(path => apiRequest<Page>(path, { signal: controller.signal })))
      .then(pages => { if (!controller.signal.aborted) setState({ key, pages }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không thể tải tài khoản.' }); });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  const metrics = [
    { title: 'Tổng tài khoản', value: current?.pages?.[0].total, to: '/admin/users', icon: Users, hint: 'Tất cả vai trò' },
    { title: 'Nhân viên', value: current?.pages?.[1].total, to: '/admin/users?role=FACILITY_STAFF', icon: UserRound, hint: 'Xử lý công việc tại kho' },
    { title: 'Quản lý', value: current?.pages?.[2].total, to: '/admin/users?role=FACILITY_MANAGER', icon: ShieldCheck, hint: 'Quản lý hoạt động kho' },
    { title: 'Đã khóa', value: current?.pages?.[3].total, to: '/admin/users?status=DISABLED', icon: UserRoundX, hint: 'Tài khoản bị chặn đăng nhập' },
  ];
  return <section className="admin-dashboard">
    <PageHeader title="Tổng quan quản trị">
      <button className="button-secondary" disabled={!current || login.loading || login.refreshing || activity.loading || activity.refreshing} onClick={() => { refresh(); login.refresh(); activity.refresh(); }}>
        <RefreshCw size={16} />Làm mới
      </button>
      <RefreshStatus active={login.refreshing || activity.refreshing} />
    </PageHeader>
    <LoadState loading={false} error={current?.error ?? ''} retry={refresh} />
    <div className="internal-kpis admin-kpis" aria-busy={!current}>{metrics.map(({ title, value, to, icon: Icon, hint }) =>
      !current ? <DashboardSkeleton key={title} variant="metric" cardClass="internal-kpi" /> :
        <Link className="internal-kpi" key={title} to={to}><span>{title}<Icon size={18} aria-hidden="true" /></span><strong>{value?.toLocaleString('vi-VN') ?? '—'}</strong><small>{hint}</small></Link>
    )}</div>
    <div className="admin-dashboard-panels">
      <AuditPreview id="admin-recent-login" title="Đăng nhập gần đây" to="/admin/login-history" data={login} session />
      <AuditPreview id="admin-recent-audit" title="Hoạt động gần đây" to="/admin/activity" data={activity} />
    </div>
  </section>;
}

function AuditPreview({ id, title, to, data, session = false }: {
  id: string; title: string; to: string; data: ReturnType<typeof useApiResource<AuditPage>>; session?: boolean;
}) {
  return <section className="internal-priority" aria-labelledby={id} aria-busy={data.loading || data.refreshing}>
    <div className="internal-section-heading">
      <h2 id={id}>{title}</h2>
      <Link className="portal-text-button" to={to} aria-label={session ? 'Xem tất cả lịch sử đăng nhập' : 'Xem tất cả hoạt động'}>
        Xem tất cả <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data?.items.length === 0 && <p>{session ? 'Chưa có sự kiện đăng nhập hoặc đăng xuất.' : 'Chưa có hoạt động được ghi nhận.'}</p>}
    <ul className="internal-task-list admin-preview">
      {data.data?.items.slice(0, 5).map(event => {
        const Icon = session ? event.action === 'AUTH_LOGOUT' ? LogOut : LogIn : History;
        const recordPath = auditRecordPath(event);
        return <li key={event.id} className="admin-audit-preview">
          <Icon size={17} aria-hidden="true" />
          <div className="admin-preview-copy">
            <strong>{session ? auditActor(event) : auditTitle(event)}</strong>
            {session && event.actorEmail && (event.actorName || event.attemptAccountName) && <small>{event.actorEmail}</small>}
            {session ? <small>{event.actorRole ? label(event.actorRole) : 'Không ghi nhận vai trò'} · <span className={event.outcome === 'FAILURE' ? 'audit-failure' : undefined}>{auditTitle(event)}</span></small>
              : <small>{event.actorName || event.actorEmail || auditActor(event)} · {recordPath ? <Link className="audit-record-link" to={recordPath}>{auditResource(event.resource)}</Link> : auditResource(event.resource)}{event.outcome === 'FAILURE' && <span className="audit-failure"> · Thất bại</span>}</small>}
            <small><time dateTime={event.createdAt}>{date(event.createdAt, true)}</time></small>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
