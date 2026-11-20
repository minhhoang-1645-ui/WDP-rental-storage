import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { date } from '../../components/manager/portal-data';
import { Facts, Status } from '../../components/manager/PortalUi';
import { StockReconciliation } from '../../components/stock/StockReconciliation';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import type { StockMovement } from '../../types/stock';
import { stockMovementLocation } from '../../utils/stock';
import { storedLocation } from '../../utils/stock-units';

export function StaffStockRecord({ row, editor }: { row: StockMovement; editor?: ReactNode }) {
  const completed = row.status === 'COMPLETED';
  const { unit, label } = stockMovementLocation(row);
  const staffName = completed ? row.completedBy?.fullName : row.assignedStaff?.fullName;
  const lines = row.lines ?? [];
  const counted = lines.length > 0 && lines.every(line => line.actualQty != null && line.actualQty >= 0);
  const matches = counted && lines.every(line => line.actualQty === line.requestedQty);
  const plannedAt = Date.parse(row.scheduledAt ?? '');
  const finishedAt = Date.parse(row.completedAt ?? '');
  const completedEarly = completed && Number.isFinite(plannedAt) && Number.isFinite(finishedAt) && finishedAt < plannedAt;
  const facts: Array<[string, ReactNode]> = [];
  if (row.customer?.fullName) facts.push(['Khách hàng', row.customer.fullName]);
  if (unit?.unitNumber) facts.push([label, storedLocation({ storageUnit: unit })]);
  facts.push([completed ? 'Nhân viên thực hiện' : 'Nhân viên', staffName || (completed ? 'Chưa ghi nhận' : 'Chưa phân công')]);
  facts.push(['Lịch hẹn', Number.isFinite(plannedAt) ? date(row.scheduledAt, true) : 'Chưa hẹn']);
  if (completed && Number.isFinite(finishedAt)) {
    facts.push(['Hoàn tất thực tế', <span key="completed" className="staff-stock-completion">
      <time dateTime={row.completedAt!}>{date(row.completedAt, true)}</time>
      {completedEarly && <Status value="completed" text="Hoàn tất sớm" />}
    </span>]);
  }
  return <>
    <section className="manager-section staff-stock-summary">
      <h2>Thông tin thực hiện</h2>
      <Facts items={facts} />
    </section>
    <section className="manager-section stock-fields staff-stock-results">
      {editor ?? <>
        <h2>{completed ? 'Kết quả nhập – xuất' : 'Hàng hóa trong phiếu'}</h2>
        <StockReconciliation compact staffResults lines={lines} movementType={row.type} />
        {completed && lines.some(line => line.storedItem.balance != null && line.storedItem.balance >= 0) && <p className="record-attribution">Số lượng còn trong kho được cập nhật theo tồn hiện tại.</p>}
        {completed && lines.some(line => line.storedItem.balance === null) && <p className="record-attribution">Chỉ hiển thị tồn tại kho hiện tại khi bạn có quyền tra cứu mặt hàng.</p>}
        {completed && matches && <p className="staff-stock-count-status">Đã {row.type === 'IN' ? 'nhập' : 'xuất'} đủ số lượng.</p>}
        {completed && !counted && <p className="record-attribution">Chưa đủ dữ liệu kiểm đếm.</p>}
        {row.status === 'ASSIGNED' && row.rentalContract?.status && row.rentalContract.status !== 'ACTIVE' && <p className="record-attribution">Hợp đồng không còn hoạt động.</p>}
      </>}
      {row.note?.trim() && row.note !== row.completionNote && <div><strong>Ghi chú yêu cầu</strong><p className="record-text">{row.note}</p></div>}
      {row.completionNote?.trim() && <div><strong>Ghi chú kiểm đếm</strong><p className="record-text">{row.completionNote}</p></div>}
    </section>
    <StockRelated row={row} />
    <StockHistory row={row} />
  </>;
}

function StockRelated({ row }: { row: StockMovement }) {
  const contract = row.rentalContract;
  const facts: Array<[string, ReactNode]> = [];
  if (contract?.contractCode) facts.push(['Hợp đồng', contract.contractCode]);
  if (row.currentStorageUnit?.id) facts.push(['Hàng đang lưu theo kho',
    <Link key="unit" to={`/staff/stored-items?${new URLSearchParams({ storageUnitId: row.currentStorageUnit.id })}`}>{row.currentStorageUnit.unitNumber}</Link>,
  ]);
  return facts.length ? <DetailDisclosure title="Hồ sơ liên quan"><Facts items={facts} /></DetailDisclosure> : null;
}

function StockHistory({ row }: { row: StockMovement }) {
  const events = row.history ?? [
    { id: 'complete', label: 'Hoàn tất giao nhận', at: row.status === 'COMPLETED' ? row.completedAt : null, actor: row.completedBy?.fullName },
    { id: 'assign', label: 'Phân công', at: row.assignedAt, actor: row.assignedBy?.fullName },
    { id: 'create', label: 'Tạo phiếu', at: row.createdAt, actor: row.customer?.fullName },
  ].filter(event => Number.isFinite(Date.parse(event.at ?? '')))
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));
  if (!events.length) return null;
  return <DetailDisclosure title="Lịch sử xử lý">
    <ol className="staff-stock-history">
      {events.map(event => <li key={event.id}>
        <div><strong>{event.label}</strong>
          <small>{event.actor || 'Chưa ghi nhận người thực hiện'}</small>
        </div>
        <time dateTime={event.at!}>{date(event.at, true)}</time>
      </li>)}
    </ol>
  </DetailDisclosure>;
}
