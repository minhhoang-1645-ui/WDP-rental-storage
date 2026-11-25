import { useState } from 'react';
import { first, label, rows, type Row } from './portal-data';
import { LoadState } from './PortalUi';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { rentalImpacts } from '../../utils/maintenance-incident';

type IncidentUnit = { id: string; unitCode: string; status: string };

export function IncidentBookingImpact({ row, root, busy, onSave }: {
  row: Row;
  root: string;
  busy: boolean;
  onSave: (affectedUnitIds: string[], expectedAffectedUnitIds: string[]) => void;
}) {
  const current = rows(row.affectedUnits);
  const currentIds = current.map(unit => first(unit, 'id'));
  const sourceUnit = first(row, 'unit.id');
  const [selected, setSelected] = useState(currentIds);
  const options = usePaginatedResource<IncidentUnit>(sourceUnit ? null : root + '/booking-impact/units');
  const reportedImpact = first(row, 'rentalImpact');

  function toggle(id: string, checked: boolean) {
    setSelected(ids => checked ? [...ids, id] : ids.filter(item => item !== id));
  }

  return <form className="portal-form portal-form-divider" onSubmit={event => {
    event.preventDefault();
    onSave(selected, currentIds);
  }}>
    <p>Staff báo: {rentalImpacts[reportedImpact as keyof typeof rentalImpacts] || 'Phiếu cũ chưa ghi mức ảnh hưởng'}.</p>
    {row.legacyBookingHold === true && <p>Ô đang có khóa bảo trì từ quy trình cũ. Khóa bảo trì đó được xử lý tại bước nghiệm thu.</p>}
    {sourceUnit ? <label className="incident-choice"><input type="checkbox" checked={selected.includes(sourceUnit)}
      onChange={event => toggle(sourceUnit, event.target.checked)} /> Tạm ngừng nhận đặt ô {first(row, 'unit.unitCode')}</label> : <>
      <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
      <div className="incident-unit-options">{options.data?.items.map(unit => <label key={unit.id}>
        <input type="checkbox" checked={selected.includes(unit.id)} onChange={event => toggle(unit.id, event.target.checked)} /> {unit.unitCode} · {label(unit.status)}
      </label>)}</div>
    </>}
    <small>Bỏ chọn khi đã xác nhận ô đủ điều kiện. Khóa từ phiếu khác và các điều kiện thuê vẫn được áp dụng.</small>
    <button type="submit" className="button-secondary" disabled={busy || options.loading || Boolean(options.error)}>Lưu đánh giá</button>
  </form>;
}
