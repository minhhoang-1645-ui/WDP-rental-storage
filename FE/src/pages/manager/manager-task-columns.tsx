import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import type { StaffColumn } from '../../components/workspace/StaffTaskTable';
import { Status } from '../../components/manager/PortalUi';
import { code, customer, date, first, label, money, rows, type Row } from '../../components/manager/portal-data';
import { unitBookingSummary } from './unit-display';
import { staffDay } from '../staff/staff-resources';
import { physicalUnitLabel } from '../../utils/physical-units';

const recordResources = ['reservations', 'contracts', 'appointments', 'renewals', 'returns', 'customers', 'transfers', 'maintenance', 'support-requests'] as const;
type RecordResource = typeof recordResources[number];
const resources = ['deposit-settlements', 'invoices', 'payments', 'units', ...recordResources] as const;
type TableResource = typeof resources[number];
export const isManagerRecordResource = (resource: string): resource is RecordResource =>
  recordResources.some(value => value === resource);
export const isManagerTaskResource = (resource: string): resource is TableResource =>
  resources.some(value => value === resource);

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? money(value) : '—';
const contractCodes = (values: unknown, path = 'contractCode') => [...new Set(rows(values).map(value => first(value, path)).filter(Boolean))].join(', ');
const person = (row: Row) => first(customer(row), 'fullName') || '—';

const recordCode: StaffColumn<Row> = { key: 'record', label: 'Mã yêu cầu', cell: row => <CopyRecordCode value={code(row)} showLabel={false} /> };
const customerName: StaffColumn<Row> = { key: 'customer', label: 'Khách hàng', cell: row => <strong>{person(row)}</strong> };

function term(start: unknown, end: unknown) {
  return [start ? date(start) : '', end ? date(end) : ''].filter(Boolean).join(' – ') || '—';
}

function returnedTiming(row: Row) {
  const actual = staffDay(first(row, 'overdueSettlement.physicalReturnDate', 'physicallyReturnedAt'));
  const end = staffDay(first(row, 'reservation.effectiveEndDate', 'reservation.endDate'));
  if (!actual || !end) return row.timing === 'EARLY' ? 'Yêu cầu trả trước hạn' : '';
  return actual < end ? 'Trả trước hạn' : actual === end ? 'Trả đúng hạn' : 'Trả quá hạn';
}

export function managerRecordAction(resource: RecordResource, row: Row) {
  if (['COMPLETED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(String(row.status))) return 'Xem chi tiết';
  if (resource === 'reservations' && row.status === 'PENDING') return 'Xử lý đặt kho';
  if (resource === 'appointments' && row.waitingForManager === true) return 'Xem vướng mắc';
  if (resource === 'appointments' && ['REQUESTED', 'CONFIRMED'].includes(String(row.status))) return 'Xử lý lịch hẹn';
  if (resource === 'renewals' && row.status === 'PENDING') return 'Xem xét gia hạn';
  if (resource === 'returns' && (row.status === 'PENDING_SETTLEMENT' || row.overdueFacilityReview === true)) return 'Xem quyết toán';
  return 'Xem chi tiết';
}

function managerRecordColumns(resource: RecordResource, status: StaffColumn<Row>, activeUnits?: ReadonlyMap<string, number>): StaffColumn<Row>[] {
  const physical: StaffColumn<Row> = { key: 'unit', label: resource === 'transfers' ? 'Kho nguồn → Kho đích' : 'Mã kho',
    cell: row => {
      const type = resource === 'transfers' ? '' : first(row, 'storageType.name', 'storageUnit.storageType.name', 'unit.storageType.name', 'reservation.storageType.name', 'product.name');
      const quantity = resource === 'reservations' ? first(row, 'quantity') : '';
      const unit = physicalUnitLabel(row, resource);
      return <><strong>{unit || (resource === 'reservations' ? 'Chưa phân bổ' : '—')}</strong>
        {(type || quantity) && <small>{[type, quantity && quantity + ' kho'].filter(Boolean).join(' · ')}</small>}</>;
    } };
  switch (resource) {
    case 'reservations': return [
      { ...recordCode, label: 'Mã đơn đặt kho' },
      { ...customerName, cell: row => <><strong>{person(row)}</strong>{first(customer(row), 'phone') && <small>{first(customer(row), 'phone')}</small>}</> },
      { ...physical, label: 'Mã kho / Nhu cầu' },
      { key: 'term', label: 'Thời gian thuê', cell: row => term(row.startDate, row.endDateExclusive ?? row.endDate) },
      { key: 'date', label: 'Ngày đặt', cell: row => date(row.createdAt, true) },
      { ...status, cell: row => <><Status value={row.status} />{first(row, 'confirmationBlockReason', 'bookingBlockReason') && <small>{first(row, 'confirmationBlockReason', 'bookingBlockReason')}</small>}</> },
    ];
    case 'contracts': return [
      { ...recordCode, label: 'Mã hợp đồng' }, customerName,
      { ...physical, label: 'Mã kho / Loại kho' },
      { key: 'term', label: 'Thời hạn thuê', cell: row => term(row.startDate, row.endDate) }, status,
    ];
    case 'appointments': return [
      { ...customerName, label: 'Khách hàng / Mã lịch', cell: row => <><strong>{person(row)}</strong><CopyRecordCode value={code(row)} showLabel={false} /></> },
      physical,
      { key: 'date', label: 'Lịch hẹn', cell: row => date(row.scheduledAt, true) },
      { key: 'staff', label: 'Người phụ trách', cell: row => {
        const staffId = first(row, 'assignedStaff.id');
        return <>{first(row, 'assignedStaff.fullName') || (staffId ? 'Đã có người phụ trách'
          : ['REQUESTED', 'CONFIRMED'].includes(String(row.status)) ? 'Chưa có người phụ trách' : '—')}
          {staffId && staffId === first(row, 'assignedBy.id') && <small>Staff tự nhận</small>}</>;
      } },
      { ...status, label: 'Trạng thái bàn giao', cell: row => {
        const reason = first(row, 'bookingBlockReason', 'handoverReadiness.reason');
        const progress = row.waitingForManager === true ? 'Chờ quản lý xử lý'
          : row.status === 'CONFIRMED' && (first(row, 'coordination.phase') === 'IN_PROGRESS' || rows(row.unitHandoverProgress).length) ? 'Đang bàn giao'
          : row.status === 'CONFIRMED' && first(row, 'coordination.phase') === 'UNASSIGNED' ? 'Chưa có người tiếp nhận' : '';
        return <><Status value={row.status} />{progress && <small>{progress}</small>}{reason && <small>{reason}</small>}</>;
      } },
    ];
    case 'renewals': return [
      recordCode, customerName,
      physical,
      { key: 'term', label: 'Hạn thuê hiện tại', cell: row => date(row.previousEndDate ?? first(row, 'reservation.currentEndDate')) },
      { key: 'renewal', label: 'Kỳ gia hạn đề xuất', cell: row => <>{term(row.previousEndDate, row.requestedEndDate)}
        {first(row, 'termMonths') && <small>{first(row, 'termMonths')} tháng</small>}</> }, status,
    ];
    case 'returns': return [
      recordCode, customerName,
      physical,
      { key: 'date', label: 'Thời gian trả kho', cell: row => {
        const actual = first(row, 'actualReturnDate');
        const scheduled = first(row, 'inspectionScheduledAt');
        const expected = first(row, 'expectedReturnDate');
        return <>{actual ? date(actual) : scheduled ? date(scheduled, true) : 'Chưa có lịch'}
          {expected && !actual && <small>Dự kiến trả {date(expected)}</small>}
          {returnedTiming(row) && <small>{returnedTiming(row)}</small>}</>;
      } },
      { key: 'inspection', label: 'Kết quả kiểm tra', cell: row => {
        const total = first(row, 'inspectionSummary.total');
        const pending = first(row, 'inspectionSummary.pending');
        const assessed = total && pending ? Number(total) - Number(pending) : null;
        const staff = first(row, 'assignedStaff.fullName');
        return <><span>{row.physicallyReturnedAt || (assessed !== null && assessed > 0 && pending === '0') ? 'Staff đã kiểm tra'
          : row.status === 'REQUESTED' ? 'Chờ kiểm tra' : row.status === 'INSPECTION_IN_PROGRESS' ? 'Đang kiểm tra'
          : row.status === 'ISSUE_FOUND' ? 'Có vấn đề cần đối chiếu' : '—'}</span>
          {assessed !== null && assessed > 0 && <small>{assessed}/{total} kho đã kiểm tra</small>}
          {Number(first(row, 'inspectionSummary.issues')) > 0 && <small>{first(row, 'inspectionSummary.issues')} kho có vấn đề</small>}
          {staff && !row.physicallyReturnedAt && <small>Phụ trách {staff}</small>}</>;
      } },
      { key: 'settlement', label: 'Quyết toán và công nợ', cell: row => {
        const settlement = first(row, 'settlementStatus');
        const pendingRentRefund = Boolean(first(row, 'earlyReturnCloseout.appliedAt')) && (!first(row, 'rentRefund.approvedAt')
          || Number(first(row, 'earlyReturnCloseout.refundAmount')) > 0 && !first(row, 'rentRefund.refundedAt'));
        return <>{pendingRentRefund ? <Status value="PENDING_SETTLEMENT" /> : settlement ? <Status value={settlement} text={settlement === 'PENDING_REVIEW' ? 'Chờ quyết toán'
          : settlement === 'APPROVED' ? 'Đã duyệt quyết toán cọc' : settlement === 'SETTLED' ? 'Đã quyết toán cọc' : undefined} />
          : row.status === 'PENDING_SETTLEMENT' ? <Status value={row.status} /> : '—'}
          {row.physicallyReturnedAt && <small>Đã nhận kho</small>}
          {row.debtStatus === 'OUTSTANDING' && <small>Còn công nợ</small>}
          {row.debtStatus === 'NEEDS_RECONCILIATION' && <small>Cần đối soát công nợ</small>}</>;
      } },
    ];
    case 'customers': return [
      { key: 'customer', label: 'Họ tên', cell: row => <strong>{first(row, 'fullName') || '—'}</strong> },
      { key: 'contact', label: 'Liên hệ', cell: row => <>{first(row, 'email') || '—'}{first(row, 'phone') && <small>{first(row, 'phone')}</small>}</> },
      { key: 'units', label: 'Kho đang thuê', numeric: true, cell: row => activeUnits ? activeUnits.get(first(row, 'id')) ?? 0 : '—' },
      { key: 'bookings', label: 'Tổng lượt đặt', numeric: true, cell: row => first(row, 'reservationCount') || '—' },
    ];
    case 'transfers':
    case 'maintenance':
    case 'support-requests':
      return [
        { ...recordCode, label: 'Mã hồ sơ' },
        customerName,
        physical,
        { key: 'subject', label: resource === 'transfers' ? 'Lý do chuyển kho' : 'Nội dung', cell: row => <>
          <strong>{first(row, 'subject') || label(row.category ?? row.reason)}</strong>
          {first(row, 'description', 'locationNote') && <small className="staff-table-description">{first(row, 'description', 'locationNote')}</small>}
        </> },
        { key: 'date', label: 'Ngày tạo', cell: row => date(row.createdAt, true) },
        { ...status, cell: row => <><Status value={row.status} />{first(row, 'priority') && <small>Ưu tiên {label(row.priority)}</small>}</> },
      ];
  }
}

export function managerResourceColumns(resource: TableResource, dateSort?: StaffColumn<Row>['sort'], activeUnits?: ReadonlyMap<string, number>): StaffColumn<Row>[] {
  const status: StaffColumn<Row> = { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} /> };
  if (isManagerRecordResource(resource)) return managerRecordColumns(resource, status, activeUnits);
  if (resource === 'units') return [
    { key: 'unit', label: 'Mã kho', cell: row => <CopyRecordCode label="Mã kho" showLabel={false} value={first(row, 'unitCode')} /> },
    { key: 'type', label: 'Loại kho', cell: row => first(row, 'storageType.name') || '—' },
    { key: 'location', label: 'Tầng / Khu', optional: true, cell: row => [first(row, 'floor'), first(row, 'zone')].filter(Boolean).join(' · ') || '—' },
    { key: 'status', label: 'Trạng thái kho', cell: row => {
      const upcoming = unitBookingSummary(row);
      return <><Status value={row.status} />{upcoming && <small>{upcoming}</small>}</>;
    } },
    { key: 'customer', label: 'Khách được phân bổ', optional: true, cell: row => {
      const customer = first(row, 'allocationSummary.current.customer.fullName');
      if (!customer) return '—';
      const usingUnit = row.status === 'OCCUPIED' && first(row, 'allocationSummary.current.contract.status') === 'ACTIVE';
      return <>{customer}<small>{usingUnit ? 'Đang sử dụng kho' : row.status === 'RESERVED' ? 'Được giữ kho' : 'Được phân bổ'}</small></>;
    } },
  ];
  if (resource === 'deposit-settlements') return [
    { key: 'customer', label: 'Khách hàng / Kho', cell: row => <><strong>{person(row)}</strong>
      <small>{contractCodes(row.physicalInspections, 'unit.unitCode') || first(row, 'reservation.storageType.name')}</small>
      <CopyRecordCode value={first(row, 'settlementCode')} />
    </> },
    { key: 'contract', label: 'Hợp đồng', optional: true, cell: row => contractCodes(row.physicalInspections, 'contract.contractCode') || '—' },
    { key: 'deposit', label: 'Tiền cọc', numeric: true, cell: row => amount(row.depositAmount) },
    { key: 'deduction', label: 'Khấu trừ', numeric: true, cell: row => row.status === 'PENDING_REVIEW' ? '—' : amount(row.deductionAmount) },
    { key: 'refund', label: 'Tiền cọc hoàn lại', numeric: true, cell: row => row.status === 'PENDING_REVIEW' ? '—' : amount(row.refundAmount) },
    { key: 'date', label: 'Ngày tạo', optional: true, sort: dateSort, cell: row => date(row.createdAt, true) },
    { ...status, label: 'Trạng thái cọc' },
  ];
  if (resource === 'invoices') return [
    { key: 'customer', label: 'Khách hàng / Hợp đồng', cell: row => <><strong>{person(row)}</strong><small>{contractCodes(row.contracts)}</small><CopyRecordCode value={first(row, 'invoiceCode')} /></> },
    { key: 'type', label: 'Loại hóa đơn', cell: row => label(row.type) },
    { key: 'total', label: 'Tổng phải thu', numeric: true, cell: row => amount(row.totalAmount) },
    { key: 'paid', label: 'Đã thanh toán', numeric: true, cell: row => amount(row.amountPaid) },
    { key: 'balance', label: 'Còn phải thu', numeric: true, cell: row => <strong>{amount(row.balanceDue)}</strong> },
    { key: 'date', label: 'Ngày phát hành', optional: true, cell: row => date(row.issuedAt, true) },
    status,
  ];
  return [
    { key: 'customer', label: 'Khách hàng / Hóa đơn', cell: row => <><strong>{person(row)}</strong><small>{first(row, 'invoice.invoiceCode')}</small><CopyRecordCode value={first(row, 'paymentCode')} /></> },
    { key: 'method', label: 'Phương thức', cell: row => row.method === 'VNPAY' ? 'VNPay' : label(row.method) },
    { key: 'amount', label: 'Đã thu', numeric: true, cell: row => <strong>{amount(row.amount)}</strong> },
    { key: 'date', label: 'Ngày ghi nhận', cell: row => date(row.receivedAt, true) },
    { key: 'reference', label: 'Tham chiếu', optional: true, cell: row => first(row, 'reference') || '—' },
  ];
}
