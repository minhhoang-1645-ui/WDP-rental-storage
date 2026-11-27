import { useEffect, useState } from 'react';
import { ArrowLeft, Map as MapIcon, Plus, RefreshCw } from 'lucide-react';
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
  const activeFloor = floors.includes(floor) ? floor : floors[0] ?? '';
  const floorUnits = placed.filter(unit => first(unit, 'floor') === activeFloor);
  const zones = [...new Set(floorUnits.map(unit => first(unit, 'zone')))].sort(compare);
  const activeZone = zones.includes(zone) ? zone : zones[0] ?? '';
  const zoneUnits = floorUnits.filter(unit => first(unit, 'zone') === activeZone)
    .sort((a, b) => Number(a.row) - Number(b.row) || Number(a.position) - Number(b.position) ||
      compare(first(a, 'unitCode', 'unitNumber'), first(b, 'unitCode', 'unitNumber')));
  const banks: Row[][] = [];
  for (const unit of zoneUnits) {
    const bank = banks.at(-1);
    if (!bank || bank[0].row !== unit.row || bank.length === 5) banks.push([unit]);
    else bank.push(unit);
  }

  const unitButton = (unit: Row) => <button key={first(unit, 'id')} type="button" className="manager-plan-unit"
    onClick={() => { setNotice(''); setSelected(first(unit, 'id')); }}>
    <strong>{first(unit, 'unitCode', 'unitNumber')}</strong><Status value={unit.status} />
    {located(unit) && <small>Vị trí {first(unit, 'position')}</small>}
  </button>;
  function saved(unit: Row) {
    setCreating(false);
    setSelected('');
    setFloor(first(unit, 'floor'));
    setZone(first(unit, 'zone'));
    setNotice('Đã lưu kho ' + first(unit, 'unitCode', 'unitNumber') + '.');
    refresh();
  }
  return <section className="manager-floor-plan">
    <Link className="booking-back" to="/manager/units"><ArrowLeft size={16} />Danh sách kho</Link>
    <PageHeader title="Sơ đồ kho" description="Chọn tầng và khu để xem vị trí từng ô kho. Chọn một ô để cập nhật tầng, khu, hàng và vị trí.">
      <button className="button-primary" onClick={() => { setNotice(''); setCreating(true); }}><Plus size={16} />Thêm kho</button>
      <button className="button-secondary" onClick={refresh} disabled={current?.revision !== revision}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <LoadState loading={!current} error={current?.error ?? ''} retry={refresh} />
    {current && !current.error && <>
      <section className="manager-section">
        <div className="manager-plan-filters">
          <label className="field-label">Tầng<select value={activeFloor} onChange={event => { setFloor(event.target.value); setZone(''); }}>
            {!floors.length && <option value="">Chưa có tầng</option>}
            {floors.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="field-label">Khu<select value={activeZone} onChange={event => setZone(event.target.value)}>
            {!zones.length && <option value="">Chưa có khu</option>}
            {zones.map(value => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        {banks.length ? <>
          <p className="manager-plan-caption"><MapIcon size={16} /> Sơ đồ minh họa theo hàng và vị trí · {zoneUnits.length} kho</p>
          <div className="manager-plan-map" aria-label="Bố trí ô kho">
            {banks.map((bank, i) => <section className="manager-plan-bank" key={first(bank[0], 'id')} aria-label={'Hàng ' + first(bank[0], 'row')}>
              <h3>Hàng {first(bank[0], 'row')}</h3>
              {bank.map(unitButton)}
              {i % 2 === 0 && <span className="manager-plan-aisle" aria-hidden="true">Lối đi</span>}
            </section>)}
          </div>
        </> : <p>Chưa có ô kho đủ thông tin vị trí để dựng sơ đồ.</p>}
      </section>
      {unplaced.length > 0 && <section className="manager-section">
        <h2>Kho chưa có vị trí ({unplaced.length})</h2>
        <p>Chọn kho để bổ sung vị trí còn thiếu.</p>
        <div className="manager-plan-unplaced">{unplaced.map(unitButton)}</div>
      </section>}
    </>}
    {selected && !detail.data && <section className="manager-section">
      <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} />
      <button className="button-secondary" onClick={() => setSelected('')}>Đóng</button>
    </section>}
    {detail.data && <InventoryEditor key={selected} kind="unit" record={detail.data} onClose={() => setSelected('')} onSaved={saved} />}
    {creating && <NewInventoryUnit onClose={() => setCreating(false)} onSaved={saved} />}
  </section>;
}
