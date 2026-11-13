import { customer, code, date, first, label, recordId, rows, type Row } from '../../components/manager/portal-data';
import { Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffRowActions, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { staffNeedsAction } from '../../utils/work-queue';

import type { StaffTableWorkflow } from './staff-resources';

function handoverRecipient(row: Row) {
  return first(row, 'handoverReport.recipientName', 'recipientName') ||
    /^BIÊN BẢN BÀN GIAO KHO\r?\nNgười nhận: ([^\r\n]+)/.exec(first(row, 'handoverNote'))?.[1] || '—';
}

export function StaffWorkflowTable({ resource, title, items, userId }: {
  resource: StaffTableWorkflow; title: string; items: Row[]; userId: string;
}) {
  const appointments = resource === 'appointments';
  const maintenance = resource === 'maintenance';
  const overdue = (row: Row) => appointments && row.status === 'CONFIRMED' && Date.parse(first(row, 'scheduledAt')) < Date.now();
  const unitCodes = (row: Row) => appointments
    ? rows(row.allocatedUnits).map(unit => first(unit, 'unitCode')).filter(Boolean).join(', ')
    : first(row, 'unit.unitCode', 'storageUnit.unitCode', 'storageUnit.unitNumber');
  const columns: StaffColumn<Row>[] = [
    { key: 'identity', label: maintenance ? 'Kho' : appointments ? 'Khách hàng' : 'Khách hàng / Kho', cell: row => <>
      <strong>{(maintenance ? unitCodes(row) : first(customer(row), 'fullName')) || '—'}</strong>
      {!appointments && !maintenance && unitCodes(row) && <small>Kho {unitCodes(row)}</small>}
      <CopyRecordCode value={code(row)} />
    </> },
    appointments
      ? { key: 'units', label: 'Kho', cell: row => unitCodes(row) || 'Chưa phân bổ' }
      : { key: 'summary', label: maintenance ? 'Nội dung bảo trì' : 'Nội dung hỗ trợ', cell: row => {
        const description = first(row, 'description');
        const subject = first(row, 'subject');
        return <><strong>{subject || label(row.category)}</strong>
          {subject && Boolean(row.category) && <small>{label(row.category)}</small>}
          {description && <small className="staff-table-description" title={description}>{description}</small>}</>;
      } },
    { key: 'date', label: appointments ? 'Ngày / giờ hẹn' : maintenance ? 'Ngày cập nhật' : 'Ngày tạo',
      cell: row => <>{date(appointments ? row.scheduledAt : maintenance ? row.updatedAt ?? row.createdAt : row.createdAt, true)}
        {overdue(row) && <small className="staff-table-overdue">Đã qua giờ</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} /> },
    appointments
      ? { key: 'recipient', label: 'Người nhận', optional: true, cell: handoverRecipient }
      : { key: 'assignee', label: 'Người phụ trách', optional: true, cell: row =>
        first(row, 'assignedStaff.fullName') || 'Chưa phân công' },
  ];
  if (!appointments) columns.push({ key: 'priority', label: 'Ưu tiên', optional: true, cell: row => row.priority ? <Status value={row.priority} /> : '—' });
  columns.push({ key: 'actions', label: 'Thao tác', cell: row =>
    <StaffRowActions to={`/staff/${resource}/${encodeURIComponent(recordId(row))}`} code={code(row)}
      primary={staffNeedsAction(resource, row, userId) ? appointments && row.status === 'CONFIRMED' ? 'Bàn giao' : 'Mở xử lý' : undefined} /> });
  return <StaffTaskTable title={title} columns={columns} items={items} rowKey={recordId}
    emphasized={row => row.priority === 'HIGH' || overdue(row)} />;
}
