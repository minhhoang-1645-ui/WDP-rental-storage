import { ArrowLeft, Check, Printer, RefreshCw } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { DetailSkeleton } from '../../components/LoadingSkeleton';
import { code, date, first, label, rows, type Row } from '../../components/manager/portal-data';
import { LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { useApiResource } from '../../services/useApiResource';
import '../../styles/staff-reservations.css';

type HistoryEvent = { at: string; action: string; actor: string | null; result: string };
type ReservationWorkflow = {
  contracts: { code: string; status: string; allocationId: string; acceptedAt: string | null }[];
  allocationComplete: boolean;
  contractsSigned: boolean;
  handoverReady: boolean;
  paymentStatus?: string | null;
  appointment: ({ status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED'; assignment: 'SELF' | 'OTHER' | 'UNASSIGNED' } & {
    id?: string; code?: string; scheduledAt?: string;
  }) | null;
  history: HistoryEvent[];
};
type ReservationDetail = Row & { workflow?: ReservationWorkflow };
type Step = { title: string; state: 'done' | 'current' | 'waiting' };

function progress(row: ReservationDetail) {
  const workflow = row.workflow;
  const appointment = workflow?.appointment;
  const completed = appointment?.status === 'COMPLETED';
  const paid = workflow?.paymentStatus === 'PAID';
  const steps: Step[] = [{ title: 'Xác nhận đặt kho', state: row.status === 'CONFIRMED' ? 'done' : 'current' }];
  if (row.status === 'PENDING') return { steps, next: 'Quản lý theo dõi ngoại lệ phân bổ kho.' };
  if (row.status !== 'CONFIRMED') return { steps: [], next: ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(String(row.status))
    ? 'Hồ sơ đã đóng.' : 'Chưa xác định được bước tiếp theo.' };

  const paymentDone = Boolean(workflow?.contractsSigned && paid);
  const scheduled = appointment?.status === 'CONFIRMED' || completed;
  steps.push(
    { title: 'Hợp đồng và thanh toán', state: paymentDone ? 'done' : 'current' },
    { title: 'Xếp lịch bàn giao', state: scheduled && (paymentDone || completed) ? 'done' : paymentDone ? 'current' : 'waiting' },
    { title: 'Hoàn tất bàn giao', state: completed ? 'done' : scheduled && paymentDone ? 'current' : 'waiting' },
  );
  if (completed) return { steps, next: 'Đã hoàn tất bàn giao.', showAppointment: Boolean(appointment?.id) };
  if (!workflow) return { steps, next: 'Chưa có dữ liệu hợp đồng, hóa đơn và lịch để xác định bước tiếp theo.' };
  if (!workflow.allocationComplete) return { steps, next: 'Cần đối chiếu số kho phân bổ và hợp đồng.' };
  if (!workflow.contractsSigned) return { steps, next: 'Chờ khách ký đủ hợp đồng.' };
  if (!workflow.paymentStatus) return { steps, next: 'Chưa có hóa đơn ban đầu để đối chiếu.' };
  if (workflow.paymentStatus === 'VOID') return { steps, next: 'Hóa đơn ban đầu đã hủy. Chờ quản lý đối chiếu.' };
  if (!paid) return { steps, next: 'Chờ khách thanh toán đủ hóa đơn ban đầu.' };
  if (!workflow.handoverReady) return { steps, next: 'Cần đối chiếu tình trạng hợp đồng trước khi bàn giao.' };
  if (!appointment) return { steps, next: 'Chờ khách đặt lịch nhận kho.' };
  if (appointment.assignment === 'UNASSIGNED') return { steps, next: 'Chờ quản lý phân công lịch bàn giao.' };
  if (appointment.assignment === 'OTHER') return { steps, next: 'Lịch bàn giao đã giao cho nhân viên phụ trách.' };
  return {
    steps,
    next: appointment.status === 'REQUESTED' ? 'Kiểm tra lịch bàn giao khách đề xuất.' : rows(row.allocatedUnits)
      .some(unit => !unit.releasedAt && ['MAINTENANCE', 'OCCUPIED'].includes(first(unit, 'physicalStatus')))
      ? 'Kiểm tra lại kho đang sử dụng hoặc bảo trì trước khi bàn giao.'
      : 'Xem lịch và xử lý bàn giao khi đủ điều kiện.',
    showAppointment: Boolean(appointment.id),
  };
}

const stepLabels = { done: 'Hoàn tất', current: 'Hiện tại', waiting: 'Đang chờ' };
const physicalLabels: Record<string, string> = { AVAILABLE: 'Kho trống', RESERVED: 'Đang giữ', OCCUPIED: 'Đang sử dụng', MAINTENANCE: 'Đang bảo trì' };

export function StaffReservationDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const data = useApiResource<ReservationDetail>(
    user?.role === 'FACILITY_STAFF' && id ? `/staff/management/reservations/${encodeURIComponent(id)}` : null, user?.id, true, true,
  );
  const row = data.data;
  const back = useInternalListReturn('/staff/appointments');
  const { pathname } = useLocation();
  if (user?.role !== 'FACILITY_STAFF') return null;

  const backLink = <Link className="booking-back" to={back}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Link>;
  const load = <LoadState loading={data.loading} error={data.error} retry={data.refresh} placeholder={<DetailSkeleton single />} />;
  if (!row) return <section className="record-detail-page staff-booking-detail">
    {backLink}
    {!data.loading && <PageHeader title="Chi tiết yêu cầu đặt kho" />}
    {load}
  </section>;

  const name = first(row, 'product.name', 'storageType.name');
  const title = [name || 'Yêu cầu đặt kho', first(row, 'customer.fullName')].filter(Boolean).join(' · ');
  const workflow = row.workflow;
  const appointment = workflow?.appointment;
  const { steps, next, showAppointment } = progress(row);
  const contractByAllocation = new Map(workflow?.contracts.map(contract => [contract.allocationId, contract]));
  const units = rows(row.allocatedUnits);
  const activeCount = row.status === 'CONFIRMED' ? units.filter(unit => !unit.releasedAt).length : 0;
  const note = first(row, 'customerNotes', 'internalNotes');
  const phone = first(row, 'customer.phone');
  const email = first(row, 'customer.email');
  const availability = first(row, 'availability.result.message', 'availability.message');
  const history = workflow?.history ?? [
    { at: first(row, 'createdAt'), action: 'Gửi yêu cầu', actor: first(row, 'customer.fullName'), result: 'Đã tiếp nhận' },
    { at: first(row, 'confirmedAt'), action: 'Xác nhận đặt kho', actor: null, result: 'Đã xác nhận' },
  ].filter(event => event.at).sort((a, b) => b.at.localeCompare(a.at));

  return <section className="record-detail-page staff-booking-detail">
    {backLink}
    {load}
    <PageHeader title={title} meta={<><CopyRecordCode value={code(row)} /><Status value={row.status} /></>}>
      <Link className="button-secondary" to="/staff/policies">Tra cứu chính sách</Link>
      <button type="button" className="button-secondary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />In hồ sơ</button>
      <button type="button" className="button-secondary" disabled={data.refreshing} onClick={data.refresh}><RefreshCw size={16} aria-hidden="true" />Làm mới</button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>
    <section className="manager-section" aria-labelledby="reservation-progress-title">
      <h2 id="reservation-progress-title">Tiến độ và bước tiếp theo</h2>
      {steps.length > 0 && <ol className="staff-booking-steps">
        {steps.map((step, index) => <li key={step.title} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="staff-booking-step-number" aria-hidden="true">{step.state === 'done' ? <Check size={15} /> : index + 1}</span>
          <span><strong>{step.title}</strong><small>{stepLabels[step.state]}</small></span>
        </li>)}
      </ol>}
      <div className="staff-booking-next"><strong>{next}</strong>
        <div className="staff-booking-related">
          {units.some(unit => contractByAllocation.has(first(unit, 'id'))) && <a href="#reservation-units">Xem hợp đồng</a>}
          {showAppointment && appointment?.id && <Link to={`/staff/appointments/${encodeURIComponent(appointment.id)}`}
            state={{ returnTo: pathname }}>Xem lịch bàn giao{appointment.scheduledAt && ` · ${date(appointment.scheduledAt, true)}`}</Link>}
        </div>
      </div>
    </section>

    <section className="manager-section" aria-labelledby="reservation-term-title">
      <h2 id="reservation-term-title">Thông tin thuê</h2>
      <dl className="staff-booking-facts">
        <div><dt>Loại kho</dt><dd>{name || '—'}</dd></div>
        <div><dt>Số lượng</dt><dd>{first(row, 'quantity') || '—'} kho</dd></div>
        <div><dt>Bắt đầu thuê</dt><dd>{date(row.startDate)}</dd></div>
        <div><dt>Kết thúc kỳ thuê</dt><dd>{date(row.endDateExclusive ?? row.endDate)}</dd></div>
      </dl>
    </section>

    <section className="manager-section" id="reservation-units" aria-labelledby="reservation-units-title">
      <header className="staff-booking-unit-header"><h2 id="reservation-units-title">Kho được phân bổ</h2>
        <strong>{activeCount} / {first(row, 'quantity') || '—'} kho</strong>
      </header>
      {!units.length ? <p>Chưa phân bổ kho.</p> : <ul className="staff-booking-units">
        {units.map(unit => {
          const unitId = first(unit, 'id', 'unitId', 'unitNumber');
          const location = [first(unit, 'floor'), first(unit, 'zone')].filter(Boolean).join(' · ');
          const contract = contractByAllocation.get(unitId);
          const physical = first(unit, 'physicalStatus');
          const ready = workflow?.handoverReady && !unit.releasedAt && physical && !['MAINTENANCE', 'OCCUPIED'].includes(physical);
          return <li key={unitId}>
            <div><strong>{first(unit, 'unitNumber')}</strong>{location && <small>{location}</small>}</div>
            {contract && <div className="staff-booking-contract"><small>Hợp đồng</small><strong>{contract.code}</strong>
              <small>{contract.acceptedAt ? 'Đã ký' : 'Chưa ký'} · {label(contract.status)}</small></div>}
            <div className="staff-booking-unit-status">
              <Status value={unit.releasedAt ? 'CANCELLED' : row.status} text={unit.releasedAt ? 'Đã giải phóng' : row.status === 'CONFIRMED' ? 'Đã phân bổ' : 'Chưa xác nhận phân bổ'} />
              {physical && <small>Tình trạng vật lý · {physicalLabels[physical] ?? label(physical)}</small>}
              {ready && <small>Hợp đồng đủ điều kiện xếp lịch</small>}
            </div>
          </li>;
        })}
      </ul>}
    </section>

    {(phone || email || note || row.adjacencyPreference === true) && <section className="manager-section" aria-labelledby="reservation-extra-title">
      <h2 id="reservation-extra-title">Thông tin bổ sung</h2>
      <div className="staff-booking-contact">{phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a>}{email && <a href={`mailto:${email}`}>{email}</a>}</div>
      {row.adjacencyPreference === true && <p>Khách ưu tiên các kho gần nhau.</p>}
      {note && <p className="staff-booking-note">{note}</p>}
    </section>}
    <DetailDisclosure title="Lịch sử xử lý">
      {history.length ? <ul className="staff-booking-history">{history.map(event => <li key={`${event.at}:${event.action}:${event.result}`}>
        <time dateTime={event.at}>{date(event.at, true)}</time>
        <div><strong>{event.action}</strong>{event.actor && <small>{event.actor}</small>}</div>
        <span>{event.result}</span>
      </li>)}</ul> : <p>Chưa có mốc xử lý được ghi nhận.</p>}
      {availability && <div className="staff-booking-snapshot"><strong>Kết quả kiểm tra khả dụng đã lưu</strong><p>{availability}</p></div>}
    </DetailDisclosure>
  </section>;
}
