import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date } from '../../components/manager/portal-data';
import { Facts, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { staffWorkItems } from './staff-work';
import { staffRentalPeriod, staffRentalPeriods, staffRentalsPath, staffRentalTarget, useStaffRentalToday, type StaffRental, type StaffRentalContract } from './staff-rentals';

function RentalWork({ rental, contract }: { rental: StaffRental; contract: StaffRentalContract }) {
  const { user } = useAuth();
  const activity = useActivity();
  const { pathname, search } = useLocation();
  const tasks = staffWorkItems(activity, user?.id, false, {
    id: contract.unit.id,
    number: contract.unit.unitCode,
    rental: { contractId: contract.id, reservationId: rental.reservationId, reservationReference: rental.reservationReference },
  });
  if (!tasks.length) return null;
  return <section className="manager-section">
    <h2>Công việc liên quan</h2>
    <ul className="staff-unit-work">
      {tasks.map(task => <li key={task.entry.id}>
        <div><strong>{task.title}</strong><Status value={task.status} /></div>
        <Link to={task.entry.web} state={{ returnTo: pathname + search }} aria-label={`Xem công việc ${task.title.toLocaleLowerCase('vi')} · ${task.entry.code}`}>
          Xem công việc <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </section>;
}

export function StaffRecordPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const { user } = useAuth();
  const result = useApiResource<StaffRental>(`${staffRentalsPath}/${encodeURIComponent(id)}`, user?.id, true);
  const today = useStaffRentalToday();
  const rental = result.data;
  const returnPath = useInternalListReturn(staffRentalsPath);
  const contracts = rental?.contracts.filter(item => item.status === 'ACTIVE') ?? [];
  const requestedContract = params.get('contract');
  const requestedUnit = params.get('unit');
  const hasSelection = requestedContract !== null || requestedUnit !== null;
  const selected = hasSelection
    ? contracts.find(contract => (requestedContract === null || contract.id === requestedContract) && (requestedUnit === null || contract.unit.id === requestedUnit))
    : contracts.length === 1 ? contracts[0] : undefined;
  const showPicker = !hasSelection && contracts.length > 1;
  const error = result.status === 403 || result.status === 404 || (rental && !selected && !showPicker)
    ? 'Không tìm thấy hồ sơ thuê thuộc kho bạn phụ trách.'
    : result.error;
  const period = selected && staffRentalPeriods[staffRentalPeriod(selected.endDate, today)];
  const unit = selected?.unit;

  return <section className="record-detail-page staff-rental-detail">
    <Link className="booking-back" to={returnPath}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Link>
    {!result.loading && <PageHeader title={unit?.unitCode ?? 'Kho đang thuê'} description={unit?.storageType?.name}
      status={period && <Status value={period.badge} text={period.label} />}>
      {selected && <>
        <button type="button" className="button-secondary" aria-label="Làm mới hồ sơ" onClick={result.refresh} disabled={result.refreshing}>
          <RefreshCw size={16} aria-hidden="true" />Làm mới
        </button>
        <RefreshStatus active={result.refreshing} />
      </>}
    </PageHeader>}
    <LoadState loading={result.loading} error={error} retry={result.refresh} layout="detail" />
    {showPicker && rental && <section className="manager-section">
      <h2>Chọn kho để xem</h2>
      <ul className="staff-unit-work">
        {contracts.map(item => <li key={item.id}>
          <Link to={staffRentalTarget(rental.reservationId, { contract: item.id })} state={state}>
            {item.unit.unitCode} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <span>Hết hạn {date(item.endDate)}</span>
        </li>)}
      </ul>
    </section>}
    {rental && selected && <div className="staff-record-stack">
      <section className="manager-section">
        <h2>Thông tin thuê</h2>
        <Facts items={[
          ['Khách hàng', rental.customer.fullName],
          ['Bắt đầu thuê', date(selected.startDate)],
          ['Hết hạn hiện tại', date(selected.endDate)],
          ['Hợp đồng', <CopyRecordCode key={selected.id} label="Mã hợp đồng" value={selected.contractCode} />],
          ['Trạng thái hợp đồng', <Status key="contract-status" value={selected.status} text="Đang hiệu lực" />],
        ]} />
      </section>
      <section className="manager-section">
        <h2>Thông tin kho</h2>
        <Facts items={[
          ['Vị trí', [selected.unit.floor, selected.unit.zone].filter(Boolean).join(' · ') || '—'],
          ['Trạng thái sử dụng', <Status key="unit-status" value={selected.unit.status} />],
        ]} />
      </section>
      <RentalWork rental={rental} contract={selected} />
    </div>}
  </section>;
}
