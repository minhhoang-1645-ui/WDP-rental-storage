import { useState } from 'react';
import { first, rows, type Row } from './portal-data';
import { LoadState } from './PortalUi';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { rentalImpacts } from '../../utils/maintenance-incident';

type IncidentUnit = { id: string; unitCode: string };

export function IncidentBookingImpact({ row, root, busy, onSave }: {
  row: Row;
  root: string;
  busy: boolean;
  onSave: (affectedUnitIds: string[], expectedAffectedUnitIds: string[]) => void;
}) {
  const current = rows(row.affectedUnits).map(unit => ({
    id: first(unit, 'id'),
    unitCode: first(unit, 'unitCode'),
  }));
  const currentIds = current.map(unit => unit.id);
  const sourceUnit = first(row, 'unit.id');
  const [selected, setSelected] = useState(currentIds);
  const options = usePaginatedResource<IncidentUnit>(sourceUnit ? null : root + '/booking-impact/units');
  const reportedImpact = first(row, 'rentalImpact');
  const candidates = sourceUnit ? [{ id: sourceUnit, unitCode: first(row, 'unit.unitCode', 'unit.unitNumber') }] : options.data?.items ?? [];
  const otherUnits = candidates.filter(unit => !currentIds.includes(unit.id));
  const hasChanges = selected.length !== currentIds.length || selected.some(id => !currentIds.includes(id));

  function toggle(id: string, checked: boolean) {
    setSelected(ids => checked ? [...ids, id] : ids.filter(item => item !== id));
  }

  function unitChoice(unit: IncidentUnit, currentlyBlocked: boolean) {
    const checked = selected.includes(unit.id);
    const change = currentlyBlocked && !checked ? 'Sẽ gỡ khóa' : !currentlyBlocked && checked ? 'Sẽ khóa' : '';
    return <label className="incident-booking-choice" key={unit.id}>
      <input type="checkbox" checked={checked} disabled={busy} onChange={event => toggle(unit.id, event.target.checked)} />
      <span><strong>{unit.unitCode}</strong>{change && <small>{change}</small>}</span>
    </label>;
  }

  return <form className="portal-form incident-booking-impact" onSubmit={event => {
    event.preventDefault();
    onSave(selected, currentIds);
  }}>
    {reportedImpact && rentalImpacts[reportedImpact as keyof typeof rentalImpacts] &&
      <p>Đánh giá ban đầu: {rentalImpacts[reportedImpact as keyof typeof rentalImpacts]}.</p>}
    {current.length > 0 && <fieldset className="incident-booking-group">
      <legend>Ô đang bị phiếu này khóa</legend>
      <small>{row.legacyBookingHold === true
        ? 'Khóa bảo trì vẫn được giữ đến khi nghiệm thu đạt.'
        : 'Bỏ chọn ô đã an toàn để gỡ khóa của phiếu này.'}</small>
      <div className="incident-booking-choices">{current.map(unit => unitChoice(unit, true))}</div>
    </fieldset>}
    <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
    {otherUnits.length > 0 && <fieldset className="incident-booking-group">
      <legend>Chọn thêm ô cần khóa</legend>
      <div className="incident-booking-choices">{otherUnits.map(unit => unitChoice(unit, false))}</div>
    </fieldset>}
    <button type="submit" className="button-secondary" disabled={!hasChanges || busy || options.loading || Boolean(options.error)}>Lưu thay đổi</button>
  </form>;
}
