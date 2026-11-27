import { useState } from 'react';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { hasDraft } from '../../services/live-events';
import { Facts, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { date, first, rows, type Row } from '../../components/manager/portal-data';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { RecordTimeline } from '../../components/workspace/RecordTimeline';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { InventoryEditor } from './InventoryEditor';
import { allocationDisplay, unitBookingSummary, unitLocation, unitMeasurements, unitStatusDescription } from './unit-display';

export function ManagerUnitDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const result = useApiResource<Row>(id ? `/manager/units/${encodeURIComponent(id)}` : null, user?.id, true, true);
  const back = useInternalListReturn('/manager/units');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const unit = result.data;
  const storageType = first(unit ?? {}, 'storageType.name');
  const category = first(unit ?? {}, 'category.name');
  const measurements = unitMeasurements(unit ?? {});
  const statusDescription = unitStatusDescription(unit ?? {});
  const upcomingBooking = unitBookingSummary(unit ?? {});
  const condition = unit?.condition === 'STANDARD' ? 'Tiêu chuẩn (không điều hòa)'
    : unit?.condition === 'AIR_CONDITIONED' ? 'Có điều hòa' : '—';
  const allocations = rows(unit?.allocations);
  const audit = rows(unit?.history);
  const createdAt = first(unit ?? {}, 'createdAt');
  const events = [
    ...(!audit.some(item => item.action === 'CREATE') && createdAt ? [{ action: 'Tạo kho', at: createdAt }] : []),
    ...audit.map(item => ({ action: item.action === 'CREATE' ? 'Tạo kho' : 'Sửa thông tin kho', actor: first(item, 'actorName'), at: first(item, 'createdAt') })),
    ...allocations.flatMap(item => {
      const reference = first(item, 'contract.contractCode', 'reservationReference');
      const allocatedAt = first(item, 'createdAt');
      const releasedAt = first(item, 'releasedAt');
      return [
        ...(allocatedAt ? [{ action: `Tạo phân bổ${reference ? ` · ${reference}` : ''}`, at: allocatedAt }] : []),
        ...(releasedAt ? [{ action: `Giải phóng phân bổ${reference ? ` · ${reference}` : ''}`, at: releasedAt }] : []),
      ];
    }),
  ].sort((left, right) => left.at.localeCompare(right.at));
  return <section className="record-detail-page manager-unit-detail">
    <Link className="booking-back" to={back}><ArrowLeft size={16} aria-hidden="true" />Về danh sách kho</Link>
    <LoadState loading={result.loading} layout="detail" error={result.error} retry={result.refresh} />
    {unit && <>
      <PageHeader title={first(unit, 'unitCode', 'unitNumber') || 'Chi tiết kho'}
        status={<Status value={unit.status} />}
        meta={<span>{[first(unit, 'storageType.name'), unitLocation(unit)].filter(Boolean).join(' · ')}</span>}>
        <button className="button-secondary" onClick={() => setEditing(true)}>Sửa thông tin kho</button>
        <button className="button-secondary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />In hồ sơ</button>
        <button className="button-secondary" aria-label="Làm mới hồ sơ" disabled={result.refreshing} onClick={() => { if (!hasDraft()) result.refresh(); }}><RefreshCw size={16} aria-hidden="true" /></button>
        <RefreshStatus active={result.refreshing} />
      </PageHeader>
      {notice && <p className="portal-success" role="status">{notice}</p>}
      <section className="manager-section">
        <h2>Thông tin kho</h2>
        <Facts items={[
          ['Loại kho', storageType || '—'],
          ...(category !== storageType || !category ? [['Nhóm kích thước', category || '—'] as [string, string]] : []),
          ['Kích thước (rộng × dài × cao)', measurements.dimensions],
          ['Điều kiện bảo quản', condition],
          ['Diện tích sàn', measurements.area],
          ['Thể tích', measurements.volume],
        ]} />
        {statusDescription && <p className="record-text">{statusDescription}</p>}
        {unit.status === 'OCCUPIED' && !unit.currentAllocation && !first(unit, 'allocationSummary.current.id') &&
          <p className="record-text">Đang sử dụng. Chưa xác định được phân bổ hiện tại.</p>}
      </section>
      <section className="manager-section">
        <h2>Lịch phân bổ & lịch sử</h2>
        {upcomingBooking && <p className="record-text"><strong>{upcomingBooking}.</strong> Kiểm tra khả dụng theo kỳ thuê.</p>}
        {allocations.length ? <div className="manager-table-wrap" role="region" tabIndex={0} aria-label="Lịch phân bổ">
          <table className="manager-table">
            <thead><tr><th scope="col">Đặt kho / Hợp đồng</th><th scope="col">Kỳ phân bổ</th><th scope="col">Khách hàng</th><th scope="col">Tình trạng</th></tr></thead>
            <tbody>{allocations.map(item => {
              const reference = first(item, 'reservationReference');
              const contract = first(item, 'contract.contractCode');
              const contractId = first(item, 'contract.id');
              const currentId = first(unit, 'currentAllocation.id', 'allocationSummary.current.id');
              const state = allocationDisplay(item, unit.status === 'OCCUPIED' && currentId === first(item, 'id') && !first(item, 'contract.status'));
              return <tr key={first(item, 'id')}>
                <td>{reference && <Link to={`/manager/reservations/${encodeURIComponent(reference)}`}>{reference}</Link>}
                  {contract && <small>{contractId ? <Link to={`/manager/operations/contracts/${encodeURIComponent(contractId)}`}>{contract}</Link> : contract}</small>}</td>
                <td>{date(item.startDate)} – {date(item.endDate)}</td>
                <td>{first(item, 'customer.fullName') || '—'}</td>
                <td><Status value={state.status} text={state.text} />{item.releasedAt != null && <small>{date(item.releasedAt, true)}</small>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <p>Chưa có lịch phân bổ.</p>}
      </section>
      {events.length > 0 && <DetailDisclosure title="Lịch sử xử lý"><RecordTimeline events={events} /></DetailDisclosure>}
      {editing && <InventoryEditor kind="unit" record={unit} onClose={() => setEditing(false)} onSaved={() => {
        setEditing(false);
        setNotice('Đã cập nhật kho.');
        result.refresh();
      }} />}
    </>}
  </section>;
}
