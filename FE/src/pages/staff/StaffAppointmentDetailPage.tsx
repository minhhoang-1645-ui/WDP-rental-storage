import { ArrowLeft, Check, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { DetailSkeleton } from '../../components/LoadingSkeleton';
import { Facts, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { first, object, rows, type Row } from '../../components/manager/portal-data';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { useApiResource } from '../../services/useApiResource';
import { hasDraft } from '../../services/live-events';
import { handoverReportView } from '../../utils/handover-report';
import { ManagerActions } from '../manager/ManagerActions';
import { StaffActions } from './StaffActions';
import { handoverCondition, handoverCustomer, handoverRecipient, handoverTime, handoverUnits } from './staff-appointment';
import { useStaffProcessingTarget } from './useStaffProcessingTarget';
import '../../styles/staff-appointments.css';

const confirmationSteps = [
  ['identityVerified', 'Đã đối chiếu người nhận'],
  ['unitInspected', 'Đã kiểm tra hiện trạng kho'],
  ['accessDelivered', 'Đã bàn giao chìa khóa, thẻ hoặc hướng dẫn truy cập'],
  ['documentsDelivered', 'Đã giao giấy tờ bàn giao'],
] as const;

export function StaffAppointmentDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const returnTo = useInternalListReturn('/staff/appointments');
  const data = useApiResource<Row>(id ? `/staff/management/appointments/${encodeURIComponent(id)}` : null, user?.id ?? '', true, true);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState<Row>();
  const row = data.data?.status === 'COMPLETED' ? data.data : submitted ?? data.data;
  const readiness = object(row?.handoverReadiness);
  const assigned = Boolean(user && row && first(row, 'assignedStaff.id') === user.id && first(row, 'assignedStaff.accountStatus') !== 'DISABLED');
  const canAct = assigned && readiness.allowed !== false;
  useStaffProcessingTarget(Boolean(row && ['REQUESTED', 'CONFIRMED'].includes(String(row.status))));

  return <section className="record-detail-page staff-appointment-detail">
    <Link className="booking-back" to={returnTo}><ArrowLeft size={16} />Về danh sách</Link>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} placeholder={<DetailSkeleton form history />} />
    {row && <>
      <AppointmentHeader row={row} refresh={data.refresh} refreshing={data.refreshing} />
      <RefreshStatus active={data.refreshing} />
      {notice && row.status !== 'COMPLETED' && <div className="portal-success" role="status">{notice}</div>}
      <AppointmentSummary row={row} />
      {row.status === 'COMPLETED' && <HandoverResult row={row} />}
      {row.status === 'REQUESTED' && canAct && <section className="manager-section" id="staff-processing" tabIndex={-1}>
        <h2>Xác nhận lịch</h2>
        <ManagerActions resource="appointments" row={row} id={id} refresh={data.refresh} onSuccess={setNotice} />
      </section>}
      {row.status === 'CONFIRMED' && canAct && <StaffActions resource="appointments" row={row} id={id}
        refresh={data.refresh} onSuccess={(message, result) => {
          if (result?.status === 'COMPLETED') setSubmitted(result);
          setNotice(message);
        }} />}
      {['REQUESTED', 'CONFIRMED'].includes(String(row.status)) && !canAct && <section className="manager-section" id="staff-processing" tabIndex={-1}>
        <h2>Chưa thể xử lý bàn giao</h2>
        <p>{!assigned ? 'Chỉ nhân viên được phân công mới được xử lý lịch.' : first(readiness, 'reason') || 'Hãy làm mới hồ sơ để kiểm tra điều kiện bàn giao.'}</p>
      </section>}
      <HandoverNotes row={row} />
      <AppointmentHistory row={row} />
    </>}
  </section>;
}

function AppointmentHeader({ row, refresh, refreshing }: { row: Row; refresh: () => void; refreshing: boolean }) {
  const units = handoverUnits(row);
  const title = units.length ? `Bàn giao · ${units[0].code}${units.length > 1 ? ` và ${units.length - 1} kho khác` : ''}` : 'Lịch bàn giao';
  return <PageHeader title={title} status={<Status value={row.status} text={row.status === 'REQUESTED' ? 'Chờ xác nhận' : undefined} />}
    meta={<>{handoverCustomer(row) && <span>{handoverCustomer(row)}</span>}
      <CopyRecordCode value={first(row, 'appointmentCode')} label="Mã lịch" /></>}>
    <button className="button-secondary" type="button" onClick={() => window.print()}><Printer size={16} />In hồ sơ</button>
    <button className="button-secondary" type="button" onClick={() => { if (!hasDraft() || window.confirm('Làm mới hồ sơ đang nhập?')) refresh(); }} disabled={refreshing}><RefreshCw size={16} />Làm mới</button>
  </PageHeader>;
}

function AppointmentSummary({ row }: { row: Row }) {
  const units = handoverUnits(row);
  const recipient = handoverRecipient(row);
  const staff = first(row, 'assignedStaff.fullName');
  const actualStaff = first(row, 'completedBy.fullName');
  const scheduled = handoverTime(row.scheduledAt);
  const separateRecipient = row.status !== 'COMPLETED' && recipient.name
    && (recipient.authorized || recipient.name !== handoverCustomer(row));
  const facts: Array<[string, string]> = [];
  if (scheduled) facts.push(['Ngày giờ hẹn', scheduled]);
  if (separateRecipient) facts.push(['Người nhận', recipient.authorized ? `${recipient.name} · Được ủy quyền` : recipient.name]);
  if (staff && (row.status !== 'COMPLETED' || staff !== actualStaff)) facts.push(['Nhân viên bàn giao', staff]);
  return <section className="manager-section staff-handover-summary">
    <h2>Tóm tắt lịch bàn giao</h2>
    {units.length > 0 && <ul className="staff-handover-units" aria-label="Kho và vị trí">
      {units.map(unit => <li key={unit.id || unit.code}><strong>{unit.code}</strong>{unit.location && <span>{unit.location}</span>}</li>)}
    </ul>}
    {facts.length > 0 && <Facts items={facts} />}
    {!facts.length && !units.length && <p>Chưa có thông tin kho và giờ hẹn.</p>}
  </section>;
}

function HandoverResult({ row }: { row: Row }) {
  const report = handoverReportView(row);
  const receiver = handoverRecipient(row, report);
  const completed = handoverTime(row.completedAt);
  const performer = first(row, 'completedBy.fullName');
  const checks = rows(report?.unitChecks).filter(unit => unit.inspected === true && first(unit, 'unitCode', 'unitId') && first(unit, 'condition'));
  const condition = report ? handoverCondition(first(report, 'condition')) : '';
  const confirmed = confirmationSteps.filter(([key]) => report?.[key] === true);
  const facts: Array<[string, string]> = [];
  if (completed) facts.push(['Hoàn tất thực tế', completed]);
  if (receiver.name) facts.push(['Người nhận thực tế', receiver.authorized ? `${receiver.name} · Được ủy quyền` : receiver.name]);
  if (performer) facts.push(['Nhân viên thực hiện', performer]);
  if (!checks.length && condition) facts.push(['Hiện trạng khi bàn giao', condition]);
  return <section className="manager-section staff-handover-result">
    <h2>Kết quả bàn giao</h2>
    <p className="staff-handover-done"><Check size={17} aria-hidden="true" />Bàn giao hoàn tất.</p>
    {facts.length > 0 && <Facts items={facts} />}
    {checks.length > 0 && <ul className="staff-handover-units" aria-label="Kết quả kiểm tra từng kho">
      {checks.map(unit => <li key={first(unit, 'unitId', 'unitCode')}>
        <strong>{first(unit, 'unitCode') || 'Kho đã kiểm tra'}</strong>
        <span>{handoverCondition(first(unit, 'condition'))}</span>
        {handoverTime(unit.completedAt) && <time dateTime={first(unit, 'completedAt')}>{handoverTime(unit.completedAt)}</time>}
      </li>)}
    </ul>}
    {confirmed.length > 0 && <ul className="staff-handover-steps" aria-label="Các bước đã xác nhận">
      {confirmed.map(([key, title]) => <li key={key}><Check size={16} aria-hidden="true" />{title}</li>)}
    </ul>}
    {row.usageStatus === 'WAITING_FOR_RENTAL_START' && <p>Kho được kích hoạt khi đến ngày bắt đầu thuê và đủ điều kiện.</p>}
  </section>;
}

function HandoverNotes({ row }: { row: Row }) {
  const report = handoverReportView(row);
  const appointmentNote = first(row, 'note');
  const reportNote = report ? first(report, 'note') : first(row, 'handoverNote');
  const authorization = report ? first(report, 'authorizationBasis') : '';
  const count = report?.accessItemCount;
  const items: Array<[string, string]> = [];
  if (authorization) items.push(['Căn cứ ủy quyền', authorization]);
  if (typeof count === 'number') items.push(['Số chìa khóa/thẻ đã giao', String(count)]);
  if (appointmentNote) items.push(['Ghi chú lịch hẹn', appointmentNote]);
  if (reportNote && reportNote !== appointmentNote) items.push(['Ghi chú bàn giao', reportNote]);
  if (!items.length) return null;
  return <DetailDisclosure title="Biên bản và ghi chú"><Facts items={items} /></DetailDisclosure>;
}

function AppointmentHistory({ row }: { row: Row }) {
  const history = [
    ['createdAt', 'Tạo lịch', 'requestedBy.fullName'],
    ['assignedAt', 'Phân công bàn giao', 'assignedBy.fullName'],
    ['confirmedAt', 'Xác nhận lịch', 'confirmedBy.fullName'],
    ['cancelledAt', 'Hủy lịch', ''],
    ['completedAt', 'Hoàn tất bàn giao', 'completedBy.fullName'],
  ].map(([field, title, actorField]) => ({ field, title, value: first(row, field), actor: first(row, actorField) }))
    .filter(event => handoverTime(event.value)).sort((a, b) => Date.parse(b.value) - Date.parse(a.value));
  if (!history.length) return null;
  return <DetailDisclosure title="Lịch sử xử lý"><ol className="staff-handover-history">
    {history.map(event => <li key={event.field}><div><strong>{event.title}</strong>{event.actor && <small>{event.actor}</small>}</div>
      <time dateTime={event.value}>{handoverTime(event.value)}</time></li>)}
  </ol></DetailDisclosure>;
}
