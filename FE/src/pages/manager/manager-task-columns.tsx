import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import type { StaffColumn } from '../../components/workspace/StaffTaskTable';
import { Status } from '../../components/manager/PortalUi';
import { customer, date, first, label, money, rows, type Row } from '../../components/manager/portal-data';
import { unitBookingSummary } from './unit-display';

const resources = ['deposit-settlements', 'invoices', 'payments', 'units'] as const;
type TableResource = typeof resources[number];
export const isManagerTaskResource = (resource: string): resource is TableResource =>
  resources.some(value => value === resource);

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? money(value) : '—';
const contractCodes = (values: unknown, path = 'contractCode') => [...new Set(rows(values).map(value => first(value, path)).filter(Boolean))].join(', ');
const person = (row: Row) => first(customer(row), 'fullName') || '—';

export function managerResourceColumns(resource: TableResource, dateSort?: StaffColumn<Row>['sort']): StaffColumn<Row>[] {
  const status: StaffColumn<Row> = { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} /> };
  if (resource === 'units') return [
    { key: 'unit', label: 'Mã kho', cell: row => <CopyRecordCode label="Mã kho" showLabel={false} value={first(row, 'unitCode')} /> },
    { key: 'type', label: 'Loại kho', cell: row => first(row, 'storageType.name') || '—' },
    { key: 'location', label: 'Tầng / Khu', optional: true, cell: row => [first(row, 'floor'), first(row, 'zone')].filter(Boolean).join(' · ') || '—' },
    { key: 'status', label: 'Trạng thái vật lý', cell: row => <><Status value={row.status} />{unitBookingSummary(row) && <small>{unitBookingSummary(row)}</small>}</> },
    { key: 'customer', label: 'Phân bổ hiện tại', optional: true, cell: row => first(row, 'allocationSummary.current.customer.fullName') || '—' },
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
