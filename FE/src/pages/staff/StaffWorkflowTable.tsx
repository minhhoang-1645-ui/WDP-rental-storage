import { Link, useLocation } from 'react-router-dom';
import { code, date, first, label, type Row } from '../../components/manager/portal-data';
import { Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { staffRecordIdentity } from './staff-work';
import type { StaffTableWorkflow } from './staff-resources';
import { handoverCustomer, handoverRecipient, handoverTime, handoverUnits } from './staff-appointment';

export function StaffWorkflowTable({ resource, title, items, loadingRows }: {
  resource: StaffTableWorkflow; title: string; items: Row[]; loadingRows?: number;
}) {
  const { pathname, search } = useLocation();
  const appointments = resource === 'appointments';
  const maintenance = resource === 'maintenance';
  const overdue = (row: Row) => appointments && row.status === 'CONFIRMED' && Date.parse(first(row, 'scheduledAt')) < Date.now();
  const identity = (row: Row) => staffRecordIdentity(row, resource);
  const rowId = (row: Row) => first(row, 'id');
  const columns: StaffColumn<Row>[] = [
    { key: 'identity', label: maintenance ? 'Kho / Mã phiếu' : resource === 'transfers' || resource === 'support-requests' ? 'Khách hàng / Hồ sơ' : 'Khách hàng / Kho', cell: row => {
      if (appointments) {
        const name = handoverCustomer(row);
        const units = handoverUnits(row).map(unit => unit.code).join(', ');
        return <><strong>{name || units || '—'}</strong>
          {name && units && <small>{units}</small>}
          <CopyRecordCode value={first(row, 'appointmentCode')} /></>;
      }
      const { person, location } = identity(row);
      const primary = maintenance ? location : person || location;
      return <><strong>{primary || '—'}</strong>
        {resource !== 'transfers' && !maintenance && person && location && <small>{location}</small>}
        <CopyRecordCode value={code(row)} /></>;
    } },
  ];
  if (resource === 'transfers') columns.push({ key: 'units', label: 'Kho nguồn → Kho đích', cell: row => {
    const from = first(row, 'fromUnit.unitCode', 'fromUnit.unitNumber');
    const to = first(row, 'toUnit.unitCode', 'toUnit.unitNumber');
    return [from, to].filter(Boolean).join(' → ') || '—';
  } });
  if (maintenance || resource === 'support-requests') columns.push(
    { key: 'summary', label: maintenance ? 'Nội dung bảo trì' : 'Nội dung hỗ trợ', cell: row => {
      const description = first(row, 'description');
      const subject = first(row, 'subject') || label(row.category);
      return <><strong>{subject}</strong>
        {description && <small className="staff-table-description" title={description}>{description}</small>}</>;
    } },
    { key: 'priority', label: 'Ưu tiên', cell: row => row.priority ? <Status value={row.priority} /> : '—' },
  );
  columns.push({ key: 'date', label: appointments ? 'Ngày giờ hẹn' : 'Ngày cập nhật',
    cell: row => <>{appointments ? handoverTime(row.scheduledAt) || '—' : date(row.updatedAt ?? row.requestedAt ?? row.createdAt, true)}
      {overdue(row) && <small className="staff-table-overdue">Đã quá giờ</small>}</> });
  if (appointments) columns.push({ key: 'recipient', label: 'Người nhận', cell: row => {
    const { name, authorized } = handoverRecipient(row);
    if (!name) return '—';
    if (!authorized && name.trim().toLocaleLowerCase('vi') === handoverCustomer(row).trim().toLocaleLowerCase('vi')) return <small>Khách thuê</small>;
    return <><strong>{name}</strong>{authorized && <small>Được ủy quyền</small>}</>;
  } });
  columns.push({ key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} /> });
  if (appointments) columns.push({ key: 'actions', label: 'Thao tác', cell: row =>
    <Link to={`/staff/appointments/${encodeURIComponent(rowId(row))}`} state={{ returnTo: pathname + search }} className="button-secondary">Xem chi tiết</Link>,
  });
  return <StaffTaskTable title={title} columns={columns} items={items} rowKey={rowId} rowDetail={row => rowId(row) ? { to: `/staff/${resource}/${encodeURIComponent(rowId(row))}`, label: `Xem chi tiết hồ sơ ${code(row)}` } : undefined} loadingRows={loadingRows}
    emphasized={row => row.priority === 'HIGH' || overdue(row)} />;
}
