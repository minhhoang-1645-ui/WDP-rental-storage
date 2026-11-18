import { Link } from 'react-router-dom';
import { code, date, first, label, type Row } from '../../components/manager/portal-data';
import { Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffRowActions, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { staffRecordIdentity } from './staff-work';
import { staffNeedsAction } from '../../utils/work-queue';
import type { StaffTableWorkflow } from './staff-resources';

function handoverRecipient(row: Row) {
  return first(row, 'handoverReport.recipientName', 'recipientName') ||
    /^BIÊN BẢN BÀN GIAO KHO\r?\nNgười nhận: ([^\r\n]+)/.exec(first(row, 'handoverNote'))?.[1] || '—';
}

export function StaffWorkflowTable({ resource, title, items, userId, loadingRows }: {
  resource: StaffTableWorkflow; title: string; items: Row[]; userId: string; loadingRows?: number;
}) {
  const booking = resource === 'reservations';
  const appointments = resource === 'appointments';
  const maintenance = resource === 'maintenance';
  const overdue = (row: Row) => appointments && row.status === 'CONFIRMED' && Date.parse(first(row, 'scheduledAt')) < Date.now();
  const identity = (row: Row) => staffRecordIdentity(row, resource);
  const rowId = (row: Row) => first(row, 'id');
  const columns: StaffColumn<Row>[] = [
    { key: 'identity', label: maintenance ? 'Kho' : booking || appointments ? 'Khách hàng' : 'Khách hàng / Kho', cell: row => {
      const { person, location } = identity(row);
      const primary = maintenance ? location : person || location;
      return <><strong>{primary || '—'}</strong>
        {resource !== 'transfers' && !booking && !appointments && !maintenance && person && location && <small>{location}</small>}
        <CopyRecordCode value={code(row)} /></>;
    } },
  ];
  if (booking) columns.push(
    { key: 'type', label: 'Loại kho', cell: row => identity(row).typeName || '—' },
    { key: 'quantity', label: 'Số lượng', numeric: true, cell: row => identity(row).quantity || '—' },
    { key: 'period', label: 'Thời gian thuê', cell: row => identity(row).period || '—' },
  );
  if (appointments) columns.push(
    { key: 'units', label: 'Kho', cell: row => identity(row).location || 'Chưa phân bổ' },
    { key: 'recipient', label: 'Người nhận', optional: true, cell: handoverRecipient },
    { key: 'assignee', label: 'Nhân viên bàn giao', optional: true, cell: row => first(row, 'assignedStaff.fullName', 'completedBy.fullName') || '—' },
  );
  if (resource === 'transfers') columns.push({ key: 'units', label: 'Kho chuyển', cell: row => {
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
    { key: 'priority', label: 'Ưu tiên', optional: true, cell: row => row.priority ? <Status value={row.priority} /> : '—' },
  );
  if (!booking) columns.push({ key: 'date', label: appointments ? 'Ngày / giờ hẹn' : 'Ngày cập nhật',
    cell: row => <>{date(appointments ? row.scheduledAt : row.updatedAt ?? row.requestedAt ?? row.createdAt, true)}
      {overdue(row) && <small className="staff-table-overdue">Đã quá giờ</small>}</> });
  columns.push(
    { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} /> },
    { key: 'actions', label: 'Thao tác', cell: row => {
      const to = `/staff/${resource}/${encodeURIComponent(rowId(row))}`;
      return booking ? <Link to={to} className="button-secondary">Xem chi tiết</Link> :
        <StaffRowActions to={to} code={code(row)} primary={staffNeedsAction(resource, row, userId) ? 'Mở xử lý' : undefined} />;
    } },
  );
  return <StaffTaskTable title={title} columns={columns} items={items} rowKey={rowId} loadingRows={loadingRows}
    emphasized={row => row.priority === 'HIGH' || overdue(row)} />;
}
