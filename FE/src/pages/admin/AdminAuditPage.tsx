import { DateRangePicker } from '../../components/workspace/DateTimeFields';
import { DetailRow } from '../../components/workspace/DetailRow';
import { internalPageSize } from '../../utils/internal-pagination';
import { RefreshCw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { date } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Pagination, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { activityActionOptions, auditActor, auditTitle, permissionActionOptions, type AuditEvent } from './audit-labels';

import { ActivityEventDetail, activityFacility, auditChanges } from './ActivityEventDetail';
import { accountRoleLabel } from './AccountRole';
import { AuditAccountScope, LoginEventDetail, LoginEventLabel, LoginEventTime, loginRole } from './LoginEventDetail';

const auditFilterKeys = ['search', 'role', 'from', 'to', 'action', 'accountId', 'outcome'] as const;
const activityFilters = activityActionOptions();
const outcomeText = (outcome: unknown) => outcome === 'SUCCESS' ? 'Thành công' : outcome === 'FAILURE' ? 'Thất bại' : '';

function permissionSummary(event: AuditEvent) {
  const change = auditChanges(event)[0];
  if (change) {
    const [field, before, after] = change;
    return before && after ? <>{before} → {after}</>
      : <>{before ? field + ' trước' : field + ' sau'} · {before ?? after}</>;
  }
  const count = event.metadata?.count;
  if (['REVOKE_SESSION', 'REVOKE_SESSIONS'].includes(event.action) && typeof count === 'number') return count + ' phiên';
  return activityFacility(event) ?? '—';
}

export function AdminAuditPage({ category, permissions = false }: { category: 'LOGIN' | 'ACTIVITY'; permissions?: boolean }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const eventId = params.get('event');
  const eventScroll = useRef<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (eventId || !eventScroll.current) return;
    const position = eventScroll.current;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ ...position, behavior: 'instant' });
      eventScroll.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [eventId]);
  const from = params.get('from') ?? '', to = params.get('to') ?? '';
  const invalidRange = Boolean(from && to && from > to);
  const query = new URLSearchParams({ category, page: String(page), limit: String(limit) });
  if (permissions) query.set('scope', 'permissions');
  for (const key of auditFilterKeys) {
    const value = params.get(key)?.trim();
    if (value) query.set(key, value);
  }
  const data = useInternalListResource<AuditEvent>(user?.role === 'SYSTEM_ADMINISTRATOR' && !invalidRange ? `/admin/audit-events?${query}` : null, user?.id ?? '', true, true);
  const eventQuery = new URLSearchParams({ category, page: '1', limit: '1' });
  if (permissions) eventQuery.set('scope', 'permissions');
  if (eventId) eventQuery.set('event', eventId);
  const detail = useInternalListResource<AuditEvent>(eventId && user?.role === 'SYSTEM_ADMINISTRATOR'
    ? '/admin/audit-events?' + eventQuery : null, user?.id ?? '', true, true);
  const login = category === 'LOGIN';
  const activity = !login && !permissions;
  const accountId = params.get('accountId')?.trim();
  const title = permissions ? 'Lịch sử thay đổi quyền' : login ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động';
  const listParams = new URLSearchParams(params);
  listParams.delete('event');
  function changeFilter(key: typeof auditFilterKeys[number], value: string) {
    setParams(previous => {
      const next = new URLSearchParams(window.location.search || previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      next.delete('event');
      return next;
    }, { replace: true });
  }

  function clearFilters() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const key of auditFilterKeys) next.delete(key);
      next.delete('page');
      next.delete('event');
      return next;
    }, { replace: true });
  }

  const event = detail.data?.items.find(item => item.id === eventId);
  const closeEvent = () => setParams(listParams, { replace: true, preventScrollReset: true });
  function openEvent(id: string) {
    eventScroll.current = { left: window.scrollX, top: window.scrollY };
    const next = new URLSearchParams(window.location.search);
    next.set('event', id);
    setParams(next, { preventScrollReset: true });
  }

  return <section className={permissions ? 'admin-audit admin-activity-audit admin-permission-audit' : activity ? 'admin-audit admin-activity-audit' : 'admin-audit'} data-category={category}>
    <PageHeader title={title} description={permissions
      ? 'Đổi vai trò, quyền cơ sở, trạng thái tài khoản và thu hồi phiên. Thời gian Việt Nam (UTC+7).'
      : 'Thời gian Việt Nam (UTC+7).'}>
      <button className="button-secondary" disabled={invalidRange || data.loading || data.refreshing} onClick={data.refresh}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>
    <div className="portal-toolbar admin-toolbar" role="search" aria-label="Bộ lọc nhật ký">
      <label className="field-label portal-search">{login || permissions ? 'Tìm tài khoản' : 'Tìm nhật ký'}<input name="search" type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => changeFilter('search', event.target.value)} placeholder={login || permissions ? 'Tên hoặc email' : 'Tên, email hoặc mã hồ sơ'} /></label>
      <label className="field-label">{permissions ? 'Vai trò người thực hiện' : 'Vai trò'}<select aria-label={permissions ? 'Vai trò người thực hiện' : 'Vai trò'} name="role" value={params.get('role') ?? ''} onChange={event => changeFilter('role', event.target.value)}><option value="">Tất cả</option>{['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'].map(role => <option key={role} value={role}>{accountRoleLabel(role)}</option>)}</select></label>
      <label className="field-label">{login ? 'Sự kiện' : activity ? 'Hoạt động' : 'Loại thay đổi quyền'}<select aria-label={activity ? 'Hoạt động' : undefined} value={params.get('action') ?? ''} onChange={event => changeFilter('action', event.target.value)}>
        <option value="">Tất cả</option>
        {(login ? [['AUTH_LOGIN', 'Đăng nhập'], ['AUTH_LOGOUT', 'Đăng xuất'], ['AUTH_LOGIN_ACCOUNT_DISABLED', 'Đăng nhập tài khoản đã khóa']]
          : activity ? activityFilters
          : permissionActionOptions
        ).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
      <label className="field-label">Kết quả<select aria-label={activity ? 'Kết quả' : undefined} value={params.get('outcome') ?? ''} onChange={event => changeFilter('outcome', event.target.value)}>
        <option value="">Tất cả</option><option value="SUCCESS">Thành công</option><option value="FAILURE">Thất bại</option>
      </select></label>
      <DateRangePicker from={{ label: 'Từ ngày', value: from, onChange: value => changeFilter('from', value) }}
        to={{ label: 'Đến ngày', value: to, onChange: value => changeFilter('to', value) }} />
      <button type="button" className="button-secondary" onClick={clearFilters}>Xóa bộ lọc</button>
      {accountId && <div className="admin-login-account-scope">
        <AuditAccountScope id={accountId} adminId={user?.id} />
        <button type="button" className="portal-text-button" onClick={() => changeFilter('accountId', '')}>
          <X size={15} aria-hidden="true" /> Bỏ lọc theo tài khoản
        </button>
      </div>}
    </div>
    {invalidRange && <p id="audit-date-error" className="booking-alert is-error" role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <div className="manager-table-wrap" tabIndex={0} role="region" aria-label={title}><table className="manager-table admin-audit-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">{login ? 'Tài khoản' : 'Người thực hiện'}</th>
        {!activity && <th scope="col">{permissions ? 'Tài khoản bị tác động' : 'Vai trò'}</th>}
        <th scope="col">{permissions ? 'Thay đổi quyền' : login ? 'Sự kiện' : 'Hoạt động'}</th>{permissions && <th scope="col">Nội dung thay đổi</th>}<th scope="col">Kết quả</th>{permissions && <th scope="col">Thao tác</th>}</tr></thead><tbody>
        {data.data.items.map(event => (
          <DetailRow key={event.id} detail={{ open: () => openEvent(event.id),
            label: `Xem sự kiện ${auditTitle(event)} · ${auditActor(event)} · ${date(event.createdAt, true)}` }}>
            <td><LoginEventTime value={event.createdAt} /></td>
            <td><strong>{auditActor(event)}</strong>
              {event.actorEmail && (event.actorName || event.attemptAccountName) && <small>{event.actorEmail}</small>}
              {(activity || permissions) && event.actorRole && <small>{loginRole(event.actorRole)}</small>}
            </td>
            {!activity && <td>{permissions
              ? event.targetAccount && event.targetUserId
                ? <><Link className="audit-target-link" to={'/admin/users/' + encodeURIComponent(event.targetUserId)}>{event.targetAccount.fullName}</Link>
                  {event.targetAccount.email && <small>{event.targetAccount.email}</small>}</>
                : 'Không ghi nhận'
              : loginRole(event.actorRole)}</td>}
            <td>
              {login ? <LoginEventLabel event={event} /> : <strong>{auditTitle(event)}</strong>}
              {activity && (event.targetAccount || activityFacility(event)) && <small>
                {[event.targetAccount?.fullName, activityFacility(event)].filter(Boolean).join(' · ')}
              </small>}
            </td>
            {permissions && <td>{permissionSummary(event)}</td>}
            <td><Status value={event.outcome === 'FAILURE' ? 'REJECTED' : 'ACTIVE'} text={outcomeText(event.outcome)} /></td>
            {permissions && <td><button type="button" className="portal-text-button" onClick={() => openEvent(event.id)}>Xem chi tiết</button></td>}
          </DetailRow>
        ))}
      </tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp" description="Thử đổi bộ lọc. Lịch sử trước khi bật tính năng không được tạo lại." />}
      <Pagination page={page} limit={limit} onLimitChange={limit => setParams(previous => { const next = new URLSearchParams(previous); next.set('limit', String(limit)); next.delete('page'); return next; }, { replace: true })} total={data.data.total} disabled={data.loading} onChange={next => setParams(previous => { const value = new URLSearchParams(previous); value.set('page', String(next)); return value; })} />
    </>}
    {(activity || permissions) && eventId && <ActivityEventDetail event={event} permissions={permissions} loaded={Boolean(detail.data)}
      loading={detail.loading} error={detail.error} retry={detail.refresh} close={closeEvent} />}
    {login && eventId && <LoginEventDetail event={event} adminId={user?.id} loaded={Boolean(detail.data)}
      loading={detail.loading} error={detail.error} retry={detail.refresh} close={closeEvent} />}
  </section>;
}
