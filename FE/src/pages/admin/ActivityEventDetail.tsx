import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { date, label } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, Modal, Status } from '../../components/manager/PortalUi';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { auditActor, auditEntity, auditResource, auditTitle, unclassifiedActivity, type AuditEvent } from './audit-labels';
import { loginRole } from './LoginEventDetail';

const facilityStates: Record<string, string> = { OPEN: 'Đang hoạt động', CLOSING: 'Đang ngừng kinh doanh', CLOSED: 'Đã ngừng kinh doanh' };
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function activityFacility(event: AuditEvent) {
  return text(event.metadata?.facilityName) ?? text(event.facilityName);
}

export function auditChanges(event: AuditEvent) {
  const meta = event.metadata ?? {};
  const pairs: [string, string | undefined, string | undefined][] = [];
  function add(name: string, before: unknown, after: unknown, format: (value: string) => string = value => value) {
    if (typeof before === 'string' && before && typeof after === 'string' && after && before !== after) {
      pairs.push([name, format(before), format(after)]);
    }
  }
  if (event.action === 'CHANGE_ROLE' || (event.action === 'ROLE' && event.resource === 'facility-access')) {
    const before = text(meta.previousRole), after = text(meta.nextRole);
    if (before || after) pairs.push(['Vai trò', before && loginRole(before), after && loginRole(after)]);
  }
  const relocated = event.action === 'RELOCATE_FACILITY_ACCESS' || event.action === 'RELOCATE' && event.resource === 'facility-access';
  const source = event.previousFacilityName ?? text(meta.previousFacilityName);
  const destination = activityFacility(event);
  if (relocated && (source || destination)) pairs.push(['Cơ sở', source, destination]);
  if (event.action === 'TASK_ASSIGNMENT') {
    const assignee = (id: unknown, name?: string | null) => id === null ? 'Chưa có người phụ trách'
      : typeof id === 'string' && id.trim() ? name || id : undefined;
    const before = assignee(meta.previousStaffUserId, event.previousAssigneeName);
    const after = assignee(meta.assignedStaffUserId, event.nextAssigneeName);
    if (before || after) pairs.push(['Người phụ trách', before, after]);
  }
  if (event.action === 'FACILITY_LIFECYCLE') {
    add('Trạng thái cơ sở', meta.previousStatus, meta.status, value => Object.hasOwn(facilityStates, value) ? facilityStates[value] : value);
    if (typeof meta.previousBookingEnabled === 'boolean' && typeof meta.bookingEnabled === 'boolean') {
      const booking = (enabled: boolean) => enabled ? 'Đang nhận đặt kho' : 'Tạm dừng nhận đặt kho';
      add('Nhận đặt kho', booking(meta.previousBookingEnabled), booking(meta.bookingEnabled));
    }
  }
  if (event.resource === 'staff-shifts') {
    const before = record(meta.before), after = record(meta.after);
    add('Trạng thái ca', before.status, after.status, label);
    add('Bắt đầu ca (UTC+7)', before.startsAt, after.startsAt, value => date(value, true));
    add('Kết thúc ca (UTC+7)', before.endsAt, after.endsAt, value => date(value, true));
  }
  if (event.action === 'RETURN_INSPECTION_SCHEDULE' && event.resource === 'returns') {
    if ((meta.before === null || text(meta.before)) && (meta.after === null || text(meta.after))) {
      add('Lịch kiểm tra (UTC+7)', meta.before === null ? 'Chưa đặt lịch' : date(meta.before, true),
        meta.after === null ? 'Chưa đặt lịch' : date(meta.after, true));
    }
  }
  if (event.action === 'PUBLISH_GROUP_PRICE_RANGE') {
    const before = record(meta.oldRange), after = record(meta.newRange);
    for (const [key, name] of [['min', 'Giá tối thiểu'], ['max', 'Giá tối đa']]) {
      const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('vi-VN') + ' ₫/tháng' : undefined;
      add(name, money(before[key]), money(after[key]));
    }
  }
  return pairs;
}

export function ActivityEventDetail({ event, loaded, loading, error, retry, close, permissions = false }: {
  event?: AuditEvent; permissions?: boolean; loaded: boolean; loading: boolean; error: string; retry: () => void; close: () => void;
}) {
  const targetId = event?.targetUserId || (event?.resource === 'users' ? event.resourceId : null);
  const targetLink = event?.targetAccount && targetId ? '/admin/users/' + encodeURIComponent(targetId) : null;
  const differences = event ? auditChanges(event) : [];
  const reason = event?.action === 'FACILITY_LIFECYCLE' ? text(event.metadata?.closureReason)
    : event?.action === 'RETURN_INSPECTION_SCHEDULE' && event.resource === 'returns' ? text(event.metadata?.note)
    : event?.resource === 'staff-shifts' ? text(record(event.metadata?.after).reason)
    : ['TASK_ASSIGNMENT', 'TASK_ESCALATED', 'TASK_RESUMED', 'RELOCATE_FACILITY_ACCESS', 'CHANGE_ROLE', 'GRANT_FACILITY_ACCESS', 'REVOKE_FACILITY_ACCESS'].includes(event?.action ?? '')
      ? text(event?.metadata?.reason) ?? text(event?.metadata?.handoverNote) ?? text(event?.metadata?.note) : undefined;
  return <Modal title={permissions ? 'Chi tiết thay đổi quyền' : 'Chi tiết hoạt động'} subtitle={event && <span className="admin-login-event">
    <Activity size={16} aria-hidden="true" /><span>{auditTitle(event)}</span>
  </span>} className="admin-login-event-dialog admin-activity-event-dialog" focusTitle onClose={close} footer={<>
    <button type="button" className="button-secondary" onClick={close}>Đóng</button>
    {targetLink && <Link className="button-primary" to={targetLink}>Xem hồ sơ tài khoản</Link>}
  </>}>
    <LoadState loading={loading} error={error} retry={retry} layout="detail" />
    {event ? <>
      <section className="admin-activity-detail-section"><h3>Kết quả</h3>
        <Status value={event.outcome === 'FAILURE' ? 'REJECTED' : 'ACTIVE'} text={event.outcome === 'FAILURE' ? 'Thất bại' : 'Thành công'} />
      </section>
      <section className="admin-activity-detail-section"><h3>Người thực hiện</h3><Facts items={[
        ['Tài khoản', auditActor(event)],
        ...(event.actorEmail && event.actorEmail !== auditActor(event) ? [['Email', event.actorEmail] as [string, string]] : []),
        ['Vai trò tại thời điểm hoạt động', loginRole(event.actorRole)],
      ]} /></section>
      <section className="admin-activity-detail-section"><h3>Thông tin hoạt động</h3><Facts items={[
        ['Thời gian (UTC+7)', <time dateTime={event.createdAt}>{date(event.createdAt, true)}</time>],
        [permissions ? 'Tài khoản bị tác động' : 'Đối tượng', event.targetAccount?.fullName
          ?? (permissions ? 'Không ghi nhận' : auditResource(auditEntity(event)))],
        ...(permissions && event.targetAccount?.email ? [['Email tài khoản bị tác động', event.targetAccount.email] as [string, string]] : []),
        ...(!permissions && event.action.startsWith('TASK_') && event.resourceId ? [['Mã hồ sơ', event.resourceId] as [string, string]] : []),
        ...(event.action === 'PUBLISH_GROUP_PRICE_RANGE' && text(event.metadata?.groupName)
          ? [['Nhóm kho', text(event.metadata?.groupName)!] as [string, string]] : []),
        ...(activityFacility(event) && !differences.some(([field]) => field === 'Cơ sở') ? [['Cơ sở', activityFacility(event)] as [string, string]] : []),
        ...(reason ? [['Lý do', reason] as [string, string]] : []),
        ...(['REVOKE_SESSION', 'REVOKE_SESSIONS'].includes(event.action) && typeof event.metadata?.count === 'number'
          ? [['Phiên đã thu hồi', String(event.metadata.count)] as [string, string]] : []),
      ]} /></section>
      {!!differences.length && <section className="admin-activity-detail-section">
        <h3>Nội dung thay đổi</h3>
        <table className="manager-table admin-activity-changes"><thead><tr>
          <th scope="col">Thuộc tính</th><th scope="col">Trước thay đổi</th><th scope="col">Sau thay đổi</th>
        </tr></thead><tbody>{differences.map(([name, before, after]) =>
          <tr key={name}><th scope="row">{name}</th><td>{before ?? '—'}</td><td>{after ?? '—'}</td></tr>)}</tbody></table>
      </section>}
      {!permissions && auditTitle(event) === unclassifiedActivity && /^[A-Z][A-Z0-9_]{0,79}$/.test(event.action) &&
        <DetailDisclosure title="Thông tin kỹ thuật"><Facts items={[[ 'Mã hoạt động', event.action ]]} /></DetailDisclosure>}
    </> : loaded && <Empty title="Không tìm thấy hoạt động" description="Mở danh sách để xem các hoạt động hiện có." />}
  </Modal>;
}
