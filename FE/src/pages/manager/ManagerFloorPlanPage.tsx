import { useEffect, useState } from 'react';
import { ArrowLeft, Map as MapIcon, MapPinOff, Plus, RefreshCw, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { first, type Row } from '../../components/manager/portal-data';
import { LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { allPages } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { InventoryEditor, NewInventoryUnit } from './InventoryEditor';
import './manager-floor-plan.css';

const located = (unit: Row) => Boolean(first(unit, 'floor') && first(unit, 'zone') &&
  Number.isInteger(unit.row) && Number(unit.row) > 0 && Number.isInteger(unit.position) && Number(unit.position) > 0);
const compare = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true });
const unitCode = (unit: Row) => first(unit, 'unitCode', 'unitNumber');

export function ManagerFloorPlanPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ account: string; revision: number; units: Row[]; error: string }>();
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState('');
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const account = user?.id ?? '';
  const refresh = () => setRevision(value => value + 1);
  const detail = useApiResource<Row>(selected ? '/manager/units/' + encodeURIComponent(selected) : null, account);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    allPages('/manager/units', controller.signal).then(
      page => { if (!controller.signal.aborted) setResult({ account, revision, units: page.items, error: '' }); },
      error => { if (!controller.signal.aborted) setResult({ account, revision, units: [], error: error instanceof Error ? error.message : 'Không tải được sơ đồ kho.' }); },
    );
    return () => controller.abort();
  }, [account, revision]);

  const current = result?.account === account ? result : undefined;
  const units = current?.units ?? [];
  const placed = units.filter(located);
  const unplaced = units.filter(unit => !located(unit));
  const floors = [...new Set(placed.map(unit => first(unit, 'floor')))].sort(compare);
  const activeFloor = floors.includes(floor) ? floor : '';
  const floorUnits = placed.filter(unit => !activeFloor || first(unit, 'floor') === activeFloor);
  const zones = [...new Set(floorUnits.map(unit => first(unit, 'zone')))].sort(compare);
  const activeZone = zones.includes(zone) ? zone : '';
  const mappedUnits = floorUnits.filter(unit => !activeZone || first(unit, 'zone') === activeZone)
    .sort((a, b) => compare(first(a, 'floor'), first(b, 'floor')) || compare(first(a, 'zone'), first(b, 'zone')) ||
      Number(a.row) - Number(b.row) || Number(a.position) - Number(b.position) || compare(unitCode(a), unitCode(b)));
  const areas = new Map<string, { floor: string; zone: string; rows: Map<number, Row[]> }>();
  for (const unit of mappedUnits) {
    const floor = first(unit, 'floor');
    const zone = first(unit, 'zone');
    const key = JSON.stringify([floor, zone]);
    const area = areas.get(key) ?? { floor, zone, rows: new Map<number, Row[]>() };
    areas.set(key, area);
    const row = Number(unit.row);
    const slots = area.rows.get(row) ?? [];
    slots.push(unit);
    area.rows.set(row, slots);
  }

  const unitButton = (unit: Row) => <button key={first(unit, 'id')} type="button" className="manager-plan-unit"
    data-status={String(unit.status ?? '')}
    onClick={() => { setNotice(''); setSelected(first(unit, 'id')); }}>
    <span className="manager-plan-unit-code"><Warehouse size={16} aria-hidden="true" /><strong>{unitCode(unit)}</strong></span>
    <Status value={unit.status} />
    {located(unit) && <small>Vị trí {first(unit, 'position')}</small>}
  </button>;
  function saved(unit: Row) {
    setCreating(false);
    setSelected('');
    setNotice('Đã lưu kho ' + unitCode(unit) + '.');
    refresh();
  }
  return <section className="manager-floor-plan">
    <Link className="booking-back" to="/manager/units"><ArrowLeft size={16} />Danh sách kho</Link>
    <PageHeader title="Sơ đồ kho" description="Xem toàn bộ kho hoặc lọc theo tầng và khu. Chọn một ô kho để cập nhật vị trí.">
      <button className="button-primary" onClick={() => { setNotice(''); setCreating(true); }}><Plus size={16} />Thêm kho</button>
      <button className="button-secondary" onClick={refresh} disabled={current?.revision !== revision}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <LoadState loading={!current} error={current?.error ?? ''} retry={refresh} />
    {current && !current.error &&
      <section className="manager-section">
        <div className="manager-plan-filters">
          <label className="field-label">Tầng<select value={activeFloor} onChange={event => { setFloor(event.target.value); setZone(''); }}>
            <option value="">Tất cả tầng</option>
            {floors.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="field-label">Khu<select value={activeZone} onChange={event => setZone(event.target.value)}>
            <option value="">Tất cả khu</option>
            {zones.map(value => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <p className="manager-plan-caption" role="status"><MapIcon size={18} aria-hidden="true" />
          {activeFloor || activeZone ? `${mappedUnits.length + unplaced.length} / ${units.length} kho` : `${units.length} kho`}
        </p>
        <div className="manager-plan-map" aria-label="Bố trí ô kho">
          {[...areas].map(([key, area]) => <section className="manager-plan-area" key={key}>
            <h2>{area.floor} <span>·</span> {area.zone}</h2>
            {[...area.rows].map(([row, slots]) => <div className="manager-plan-row" key={row}>
              <h3>Hàng {row}</h3>
              <div className="manager-plan-slots">{slots.map(unitButton)}</div>
            </div>)}
          </section>)}
          {unplaced.length > 0 && <section className="manager-plan-area manager-plan-unplaced">
            <h2><MapPinOff size={18} aria-hidden="true" /> Kho chưa có vị trí ({unplaced.length})</h2>
            <p>Chọn kho để bổ sung vị trí còn thiếu.</p>
            <div className="manager-plan-slots">{unplaced.map(unitButton)}</div>
          </section>}
          {units.length === 0 && <p>Chưa có kho để hiển thị.</p>}
        </div>
      </section>
    }
    {selected && !detail.data && <section className="manager-section">
      <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} />
      <button className="button-secondary" onClick={() => setSelected('')}>Đóng</button>
    </section>}
    {detail.data && <InventoryEditor key={selected} kind="unit" record={detail.data} onClose={() => setSelected('')} onSaved={saved} />}
    {creating && <NewInventoryUnit onClose={() => setCreating(false)} onSaved={saved} />}
  </section>;
}
