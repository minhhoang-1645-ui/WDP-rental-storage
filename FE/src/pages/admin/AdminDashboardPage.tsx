import {
  ArrowRight, BarChart3, Building2, CheckCircle2, Clock3, Hand, Layers3, Lock,
  LogIn, LogOut, Pencil, RefreshCw, Shield, Unlock, Users, XCircle,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date, label } from '../../components/manager/portal-data';
import { LoadState } from '../../components/manager/PortalUi';
import { useNotifications } from '../../activity/workspace-notifications';
import { AdminAvatar } from './AdminAvatar';
import { auditActor, auditRole, auditTitle, type AuditEvent, type AuditPage } from './audit-labels';

const usersPath = '/admin/users?page=1&limit=1';
const auditPath = '/admin/audit-events?page=1&limit=4&category=';
const roles = [
  ['STORAGE_CUSTOMER', 'Customer'], ['FACILITY_STAFF', 'Staff'], ['FACILITY_MANAGER', 'Manager'],
  ['BUSINESS_OPERATIONS_MANAGER', 'BOM'], ['SYSTEM_ADMINISTRATOR', 'Admin'],
] as const;
const roleName = (value?: string | null) => {
  const role = value ? auditRole(value) : '';
  return roles.find(([code]) => code === role)?.[1] ?? (role ? label(role) : '—');
};
const asNumber = new Intl.NumberFormat('vi-VN');
const asShare = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
type AuditResource = ReturnType<typeof useApiResource<AuditPage>>;

export function AdminDashboardPage() {
  const { user } = useAuth();
  const notifications = useNotifications();
  const id = user?.role === 'SYSTEM_ADMINISTRATOR' ? user.id : undefined;
  const total = useApiResource<{ total: number }>(id ? usersPath : null, id, true);
  const active = useApiResource<{ total: number }>(id ? usersPath + '&accountStatus=ACTIVE' : null, id, true);
  const disabled = useApiResource<{ total: number }>(id ? usersPath + '&accountStatus=DISABLED' : null, id, true);
  const grants = useApiResource<{ items: unknown[] }>(id ? '/admin/facility-access?view=directory' : null, id, true);
  const login = useApiResource<AuditPage>(id ? auditPath + 'LOGIN' : null, id, true);
  const activity = useApiResource<AuditPage>(id ? auditPath + 'ACTIVITY' : null, id, true);
  const permissions = useApiResource<AuditPage>(id ? auditPath + 'ACTIVITY&scope=permissions' : null, id, true);
  const [distributionRevision, setDistributionRevision] = useState(0);
  const sources = [total, active, disabled, grants, login, activity, permissions];
  const refreshing = sources.some(source => source.refreshing);
  const metrics = [
    { title: 'Tổng tài khoản', value: total.data?.total, source: total, to: '/admin/users', icon: Users, tone: 'brand' },
    { title: 'Đang hoạt động', value: active.data?.total, source: active, to: '/admin/users?status=ACTIVE', icon: CheckCircle2, tone: 'green' },
    { title: 'Đã khóa', value: disabled.data?.total, source: disabled, to: '/admin/users?status=DISABLED', icon: Lock, tone: 'red' },
    { title: 'Quyền truy cập cơ sở', value: grants.data?.items?.length, source: grants, to: '/admin/facility-access', icon: Layers3, tone: 'blue' },
  ];

  return <section className="admin-dashboard admin-overview">
    <header className="admin-overview-welcome">
      <span className="admin-overview-icon" data-tone="brand"><Hand size={27} aria-hidden="true" /></span>
      <div><h1>{user?.fullName ? 'Xin chào, ' + user.fullName : 'Tổng quan quản trị'}</h1>
        <p>Theo dõi và quản trị tài khoản, vai trò, quyền truy cập cũng như hoạt động bảo mật của hệ thống NestBox Storage.</p>
      </div>
      <button type="button" className="admin-overview-refresh" disabled={refreshing} onClick={() => {
        sources.forEach(source => source.refresh());
        notifications?.refresh();
        setDistributionRevision(value => value + 1);
      }}><RefreshCw size={18} aria-hidden="true" />{refreshing ? 'Đang làm mới…' : 'Làm mới'}</button>
    </header>

    <div className="admin-overview-metrics">
      {metrics.map(({ title, value, source, to, icon: Icon, tone }) => <div key={title} className="admin-overview-metric">
        <Link className="admin-overview-card admin-overview-kpi" to={to} aria-busy={source.loading || source.refreshing}>
          <span className="admin-overview-icon" data-tone={tone}><Icon size={26} aria-hidden="true" /></span>
          <span><span>{title}</span><strong>{source.loading ? '…' : value === undefined ? '—' : asNumber.format(value)}</strong></span>
        </Link>
        {source.error && <button className="portal-text-button" type="button" onClick={source.refresh}>Thử lại {title.toLocaleLowerCase('vi')}</button>}
      </div>)}
    </div>

    <div className="admin-overview-grid">
      <section className="admin-overview-card admin-overview-panel" aria-labelledby="admin-distribution">
        <PanelHeading id="admin-distribution" title="Phân bố tài khoản theo vai trò" icon={<BarChart3 size={21} />} />
        <ul className="admin-overview-roles">
          {roles.map(([role, name], index) => <RoleDistribution key={role} role={role} name={name} index={index}
            userId={id} total={total.data?.total} revision={distributionRevision} />)}
        </ul>
      </section>
      <EventPanel title="Thay đổi quyền gần đây" to="/admin/permission-history" icon={<Clock3 size={21} />} data={permissions} timeline />
      <RecentLogin data={login} />
      <EventPanel title="Hoạt động gần đây" to="/admin/activity" icon={<Layers3 size={22} />} data={activity} />
    </div>
  </section>;
}

function PanelHeading({ id, title, to, icon }: { id?: string; title: string; to?: string; icon: ReactNode }) {
  return <header className="admin-overview-panel-heading">
    <span aria-hidden="true">{icon}</span><h2 id={id}>{title}</h2>
    {to && <Link to={to} aria-label={'Xem tất cả ' + title.toLocaleLowerCase('vi')}>Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link>}
  </header>;
}

function RoleDistribution({ role, name, index, userId, total, revision }: {
  role: string; name: string; index: number; userId?: string; total?: number; revision: number;
}) {
  const source = useApiResource<{ total: number }>(userId ? usersPath + '&role=' + role : null, userId, true);
  const { refresh } = source;
  useEffect(() => { if (revision) refresh(); }, [revision, refresh]);
  const count = source.data?.total;
  const fraction = count !== undefined && total !== undefined ? (total > 0 ? Math.min(count / total, 1) : 0) : undefined;
  return <li data-role-index={index}>
    <Link to={'/admin/users?role=' + role} aria-busy={source.loading || source.refreshing}>
      <span>{name}</span>
      <span className="admin-overview-role-bar" aria-hidden="true"><span style={{ width: ((fraction ?? 0) * 100) + '%' }} /></span>
      <strong>{source.loading ? '…' : count === undefined ? '—' : asNumber.format(count)}</strong>
      <span className="admin-overview-role-share">{fraction === undefined ? '—' : asShare.format(fraction)}</span>
    </Link>
    {source.error && <button type="button" className="portal-text-button" onClick={refresh}>Tải lại {name}</button>}
  </li>;
}

function eventIcon(event: AuditEvent) {
  if (['DISABLE_ACCOUNT', 'STATUS'].includes(event.action)) return { icon: Lock, tone: 'red' };
  if (event.action === 'REACTIVATE_ACCOUNT') return { icon: Unlock, tone: 'green' };
  if (event.action === 'ROLE' || event.action === 'CHANGE_ROLE') return { icon: Users, tone: 'neutral' };
  if (event.resource === 'facility-access' || event.metadata?.facilityId) return { icon: Building2, tone: 'neutral' };
  if (['UPDATE', 'AUTH_PROFILE_UPDATE'].includes(event.action)) return { icon: Pencil, tone: 'neutral' };
  if (event.resource === 'users') return { icon: Users, tone: 'neutral' };
  return { icon: Shield, tone: 'neutral' };
}

function EventPanel({ title, to, icon, data, timeline = false }: {
  title: string; to: string; icon: ReactNode; data: AuditResource; timeline?: boolean;
}) {
  return <section className="admin-overview-card admin-overview-panel" aria-label={title} aria-busy={data.loading || data.refreshing}>
    <PanelHeading title={title} to={to} icon={icon} />
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data?.items.length === 0 && <p className="admin-overview-empty">Chưa có sự kiện được ghi nhận.</p>}
    {!!data.data?.items.length && <ul className={'admin-overview-events' + (timeline ? ' is-timeline' : '')}>
      {data.data.items.map(event => {
        const { icon: Icon, tone } = eventIcon(event);
        const transition = event.metadata?.previousRole && event.metadata.nextRole
          ? roleName(event.metadata.previousRole) + ' → ' + roleName(event.metadata.nextRole) : '';
        const sites = event.previousFacilityName && event.facilityName
          ? event.previousFacilityName + ' → ' + event.facilityName : event.facilityName;
        const titleDetail = transition || sites;
        const summary = [auditActor(event), event.targetAccount?.fullName ? 'Tài khoản: ' + event.targetAccount.fullName : ''].filter(Boolean);
        return <li key={event.id}>
          <Link to={to + '?event=' + encodeURIComponent(event.id)}>
            <span className="admin-overview-icon" data-tone={tone}><Icon size={18} aria-hidden="true" /></span>
            <span className="admin-overview-event-copy">
              <strong>{auditTitle(event)}{titleDetail ? ': ' + titleDetail : ''}</strong>
              <small>{summary.join(' · ')}{event.outcome === 'FAILURE' && <span className="admin-overview-failed"> · Thất bại</span>}</small>
            </span>
            <time dateTime={event.createdAt}>{date(event.createdAt, true)}</time>
          </Link>
        </li>;
      })}
    </ul>}
  </section>;
}

function RecentLogin({ data }: { data: AuditResource }) {
  const to = '/admin/login-history';
  return <section className="admin-overview-card admin-overview-panel" aria-label="Đăng nhập gần đây" aria-busy={data.loading || data.refreshing}>
    <PanelHeading title="Đăng nhập gần đây" to={to} icon={<LogIn size={22} />} />
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data?.items.length === 0 && <p className="admin-overview-empty">Chưa có sự kiện đăng nhập.</p>}
    {!!data.data?.items.length && <div className="admin-overview-logins"><table>
      <thead><tr><th scope="col">Tài khoản</th><th scope="col">Vai trò</th><th scope="col">Trạng thái</th><th scope="col">Thời gian</th></tr></thead>
      <tbody>{data.data.items.map(event => {
        const actor = auditActor(event);
        const failed = event.outcome === 'FAILURE';
        const logout = event.action === 'AUTH_LOGOUT';
        const Icon = failed ? XCircle : logout ? LogOut : CheckCircle2;
        return <tr key={event.id}>
          <td><Link className="admin-overview-login-account" data-role={event.actorRole ? auditRole(event.actorRole) : undefined} to={to + '?event=' + encodeURIComponent(event.id)}>
            <AdminAvatar name={actor} /><span><strong>{actor}</strong>{event.actorEmail && event.actorEmail !== actor && <small>{event.actorEmail}</small>}</span>
          </Link></td>
          <td><span className="admin-overview-role-share">{roleName(event.actorRole)}</span></td>
          <td><span className="admin-overview-login-status" data-tone={failed ? 'red' : logout ? 'neutral' : 'green'}>
            <Icon size={15} aria-hidden="true" />{failed ? auditTitle(event) : logout ? 'Đăng xuất' : 'Đăng nhập thành công'}
          </span></td>
          <td><time dateTime={event.createdAt}>{date(event.createdAt, true)}</time></td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
