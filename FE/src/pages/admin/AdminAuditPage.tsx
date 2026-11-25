import { DateRangePicker } from '../../components/workspace/DateTimeFields';
import { DetailRow } from '../../components/workspace/DetailRow';
import { internalPageSize } from '../../utils/internal-pagination';
import { RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { date, label } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, Modal, PageHeader, Pagination, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { activityActionOptions, auditActor, auditResource, auditRole, auditTitle, type AuditEvent } from './audit-labels';

const auditFilterKeys = ['search', 'role', 'from', 'to', 'action', 'accountId', 'outcome'] as const;
const outcomeText = (outcome: unknown) => outcome === 'SUCCESS' ? 'Thành công' : outcome === 'FAILURE' ? 'Thất bại' : '';

export function AdminAuditPage({ category, permissions = false }: { category: 'LOGIN' | 'ACTIVITY'; permissions?: boolean }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const eventId = params.get('event');
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
  const title = permissions ? 'Lịch sử thay đổi quyền' : login ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động';
  const listPath = permissions ? '/admin/permission-history' : login ? '/admin/login-history' : '/admin/activity';
  const listParams = new URLSearchParams(params);
  listParams.delete('event');
  const eventPath = (id: string) => {
    const next = new URLSearchParams(listParams);
    next.set('event', id);
    return `${listPath}?${next}`;
  };

  function changeFilter(key: typeof auditFilterKeys[number], value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
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
  const drawer = eventId ? (
    <Modal title={event ? auditTitle(event) : login ? 'Chi tiết đăng nhập' : 'Chi tiết hoạt động'}
      className="admin-audit-drawer" onClose={() => setParams(listParams, { replace: true, preventScrollReset: true })}
      titleBadge={event && <Status value={event.outcome === 'FAILURE' ? 'REJECTED' : 'ACTIVE'} text={outcomeText(event.outcome)} />}
      footer={<button type="button" className="button-secondary" onClick={detail.refresh} disabled={detail.loading || detail.refreshing}><RefreshCw size={16} />Làm mới</button>}>
      <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} layout="detail" />
      {event ? <section className="manager-section record-focused-layout">
        <h2>{login ? 'Thông tin sự kiện đăng nhập' : 'Thông tin hoạt động'}</h2>
        <Facts items={[
          ['Thời gian (UTC+7)', <time key="time" dateTime={event.createdAt}>{date(event.createdAt, true)}</time>],
          ['Người thực hiện', auditActor(event)],
          ...(login && event.actorEmail && event.actorEmail !== auditActor(event) ? [['Email', event.actorEmail]] as [string, string][] : []),
          ['Vai trò', event.actorRole ? label(auditRole(event.actorRole)) : 'Không ghi nhận'],
          ...(outcomeText(event.outcome) ? [['Kết quả', outcomeText(event.outcome)] as [string, string]] : []),
          ...(!login && !event.targetAccount ? [['Đối tượng', auditResource(event.resource)] as [string, string]] : []),
          ...(event.metadata?.previousRole ? [['Vai trò trước', label(event.metadata.previousRole)]] as [string, string][] : []),
          ...(event.metadata?.nextRole ? [['Vai trò sau', label(event.metadata.nextRole)]] as [string, string][] : []),
          ...(event.facilityName || event.metadata?.facilityId ? [['Cơ sở', event.facilityName || event.metadata?.facilityId]] as [string, React.ReactNode][] : []),
          ...(event.metadata?.sessionId ? [['Mã phiên', event.metadata.sessionId]] as [string, string][] : []),
          ...(['REVOKE_SESSION', 'REVOKE_SESSIONS'].includes(event.action) && typeof event.metadata?.count === 'number' ? [['Phiên đã thu hồi', String(event.metadata.count)]] as [string, string][] : []),
          ...(event.targetAccount && event.resourceId ? [['Tài khoản liên quan', <Link key="account" to={`/admin/users/${encodeURIComponent(event.targetUserId ?? event.resourceId)}`}>{event.targetAccount.fullName}</Link>]] as [string, React.ReactNode][] : []),
        ]} />
      </section> : detail.data && <Empty title={login ? 'Không tìm thấy sự kiện đăng nhập' : 'Không tìm thấy hoạt động'} description="Mở nhật ký để xem các sự kiện hiện có." />}
    </Modal>
  ) : null;

  return <section className="admin-audit" data-category={category}>
    <PageHeader title={title} description={permissions
      ? 'Đổi vai trò, quyền cơ sở, trạng thái tài khoản và thu hồi phiên. Thời gian Việt Nam (UTC+7).'
      : 'Thời gian Việt Nam (UTC+7).'}>
      <button className="button-secondary" disabled={invalidRange || data.loading || data.refreshing} onClick={data.refresh}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>
    <nav className="portal-actions" aria-label="Nhóm nhật ký"><Link className={login ? 'button-primary' : 'button-secondary'} to="/admin/login-history">Đăng nhập / đăng xuất</Link><Link className={!login && !permissions ? 'button-primary' : 'button-secondary'} to="/admin/activity">Hoạt động</Link><Link className={permissions ? 'button-primary' : 'button-secondary'} to="/admin/permission-history">Thay đổi quyền</Link></nav>
    <div className="portal-toolbar admin-toolbar" role="search" aria-label="Bộ lọc nhật ký">
      <label className="field-label portal-search">Tìm nhật ký<input name="search" type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => changeFilter('search', event.target.value)} placeholder={login ? 'Tên hoặc email' : 'Tên, email hoặc mã hồ sơ'} /></label>
      <label className="field-label">Vai trò người thực hiện<select aria-label="Vai trò người thực hiện" name="role" value={params.get('role') ?? ''} onChange={event => changeFilter('role', event.target.value)}><option value="">Tất cả</option>{['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'].map(role => <option key={role} value={role}>{label(role)}</option>)}</select></label>
      <label className="field-label">Mã tài khoản<input name="accountId" maxLength={120} value={params.get('accountId') ?? ''}
        onChange={event => changeFilter('accountId', event.target.value)} placeholder="ID tài khoản" /></label>
      <label className="field-label">Hành động<select value={params.get('action') ?? ''} onChange={event => changeFilter('action', event.target.value)}>
        <option value="">Tất cả</option>
        {(login ? [['AUTH_LOGIN', 'Đăng nhập'], ['AUTH_LOGOUT', 'Đăng xuất'], ['AUTH_LOGIN_ACCOUNT_DISABLED', 'Đăng nhập tài khoản đã khóa']]
          : [['CHANGE_ROLE', 'Đổi vai trò'], ['GRANT_FACILITY_ACCESS', 'Cấp quyền cơ sở'], ['REVOKE_FACILITY_ACCESS', 'Thu hồi quyền cơ sở'],
            ['REVOKE_SESSION', 'Thu hồi một phiên'], ['REVOKE_SESSIONS', 'Thu hồi toàn bộ phiên'], ['DISABLE_ACCOUNT', 'Khóa tài khoản'], ['REACTIVATE_ACCOUNT', 'Mở khóa tài khoản'],
            ...(!permissions ? activityActionOptions() : [])]
        ).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
      <label className="field-label">Kết quả<select value={params.get('outcome') ?? ''} onChange={event => changeFilter('outcome', event.target.value)}>
        <option value="">Tất cả</option><option value="SUCCESS">Thành công</option><option value="FAILURE">Thất bại</option>
      </select></label>
      <DateRangePicker from={{ label: 'Từ ngày', value: from, onChange: value => changeFilter('from', value) }}
        to={{ label: 'Đến ngày', value: to, onChange: value => changeFilter('to', value) }} />
      <button type="button" className="button-secondary" onClick={clearFilters}>Xóa bộ lọc</button>
    </div>
    {invalidRange && <p id="audit-date-error" className="booking-alert is-error" role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <div className="manager-table-wrap" tabIndex={0} role="region" aria-label={title}><table className="manager-table admin-audit-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">{permissions ? 'Người thực hiện' : 'Tài khoản'}</th>
        <th scope="col">{permissions ? 'Tài khoản bị tác động' : 'Vai trò'}</th>
        <th scope="col">{permissions ? 'Thay đổi quyền' : login ? 'Sự kiện' : 'Hoạt động'}</th><th scope="col">Kết quả</th></tr></thead><tbody>
        {data.data.items.map(event => (
          <DetailRow key={event.id} detail={{ to: eventPath(event.id), label: `Xem sự kiện ${auditTitle(event)} · ${auditActor(event)} · ${date(event.createdAt, true)}` }}>
            <td><time dateTime={event.createdAt}>{date(event.createdAt, true)}</time></td>
            <td><strong>{auditActor(event)}</strong>{event.actorEmail && (event.actorName || event.attemptAccountName) && <small>{event.actorEmail}</small>}</td>
            <td>{permissions
              ? event.targetAccount && event.resourceId
                ? <Link className="audit-target-link" to={'/admin/users/' + encodeURIComponent(event.targetUserId ?? event.resourceId)}>{event.targetAccount.fullName}</Link>
                : 'Không ghi nhận'
              : event.actorRole ? label(auditRole(event.actorRole)) : 'Không ghi nhận'}</td>
            <td>
              <strong className={login && event.outcome === 'FAILURE' ? 'audit-failure' : undefined}>{auditTitle(event)}</strong>
              {!login && !permissions && event.targetAccount && event.resourceId && <small>
                Tài khoản <Link className="audit-target-link" to={`/admin/users/${encodeURIComponent(event.targetUserId ?? event.resourceId)}`}>{event.targetAccount.fullName}</Link>
              </small>}
              {permissions && event.metadata?.previousRole && event.metadata.nextRole && <small>
                {label(event.metadata.previousRole)} → {label(event.metadata.nextRole)}
              </small>}
              {event.facilityName && <small>{event.facilityName}</small>}
            </td>
            <td><Status value={event.outcome === 'FAILURE' ? 'REJECTED' : 'ACTIVE'} text={outcomeText(event.outcome)} /></td>
          </DetailRow>
        ))}
      </tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp" description="Thử đổi bộ lọc. Lịch sử trước khi bật tính năng không được tạo lại." />}
      <Pagination page={page} limit={limit} onLimitChange={limit => setParams(previous => { const next = new URLSearchParams(previous); next.set('limit', String(limit)); next.delete('page'); return next; }, { replace: true })} total={data.data.total} disabled={data.loading} onChange={next => setParams(previous => { const value = new URLSearchParams(previous); value.set('page', String(next)); return value; })} />
    </>}
    {drawer}
  </section>;
}
