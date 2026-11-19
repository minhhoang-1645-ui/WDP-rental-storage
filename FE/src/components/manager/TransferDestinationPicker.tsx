import { useApiResource } from '../../services/useApiResource';
import { money } from './portal-data';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';
import { markFormDirty } from '../../services/live-events';
import { first, rows, type Page, type Row } from './portal-data';
import { RefreshCw, Search, Warehouse } from 'lucide-react';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

/** Inline choices avoid dropdowns clipped by the operation sidebar. */
export function TransferDestinationPicker({ transferId, source, value, onChange, onReady, disabled }: {
  transferId: string; source: Row; value: string; onChange: (id: string) => void; onReady: (ready: boolean) => void; disabled: boolean;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState(''), [floor, setFloor] = useState(''), [zone, setZone] = useState('');
  const [otherTypes, setOtherTypes] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false), [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Page; error?: string }>();
  const key = `${user?.id}:${transferId}:${otherTypes}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    allPages(`/manager/transfers/${encodeURIComponent(transferId)}/destinations?includeOtherTypes=${otherTypes}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không tải được danh sách kho.' }); });
    return () => controller.abort();
  }, [key, transferId, otherTypes]);
  const current = state?.key === key ? state : undefined;
  const units = current?.data?.items ?? [], eligible = units.filter(unit => unit.eligible === true);
  const selected = units.find(unit => first(unit, 'id') === value && unit.eligible === true);
  useEffect(() => { if (value && (!current?.data || !current.data.items.some(unit => first(unit, 'id') === value && unit.eligible === true))) onChange(''); }, [current?.data, value, onChange]);
  const choices = units.filter(unit => (showUnavailable || unit.eligible === true) && (!floor || unit.floor === floor) && (!zone || unit.zone === zone)
    && normalize([first(unit, 'unitCode'), first(unit, 'storageType.name'), first(unit, 'floor'), first(unit, 'zone')].join(' ')).includes(normalize(search.trim())))
    .sort((a, b) => Number(b.eligible === true) - Number(a.eligible === true));
  const preview = useApiResource<{ sameType: boolean; snapshot?: { effectiveFrom: string; currentRate: number; newRate: number; differencePerMonth: number; smaller: boolean } }>(selected && otherTypes ? `/manager/transfers/${encodeURIComponent(transferId)}/commercial-preview?destination=${encodeURIComponent(value)}` : null, user?.id);
  useEffect(() => { onReady(Boolean(selected && (!otherTypes || preview.data && !preview.loading && !preview.error))); }, [selected, otherTypes, preview.data, preview.loading, preview.error, onReady]);
  const floors = [...new Set(units.map(unit => first(unit, 'floor')).filter(Boolean))];
  const zones = [...new Set(units.map(unit => first(unit, 'zone')).filter(Boolean))];
  const filteredEligibleCount = choices.filter(unit => unit.eligible === true).length;
  const hasFilters = Boolean(search.trim() || floor || zone || otherTypes || showUnavailable);
  function changeTypeScope(includeOthers: boolean) {
    setOtherTypes(includeOthers);
    setFloor('');
    setZone('');
    onChange('');
  }
  function resetFilters() {
    setSearch('');
    setFloor('');
    setZone('');
    setShowUnavailable(false);
    if (otherTypes) changeTypeScope(false);
  }

  return <section className="transfer-destination-picker" aria-label="Chọn kho chuyển đến">
    <div className="transfer-destination-context">
      <Warehouse size={20} aria-hidden="true" />
      <div><small>Kho hiện tại</small><strong>{[first(source, 'unitCode'), first(source, 'storageType.name')].filter(Boolean).join(' · ') || 'Chưa rõ kho'}</strong></div>
    </div>
    <div className="transfer-destination-filter-panel">
      <div className="transfer-destination-toolbar">
        <h3>Tìm kho chuyển đến</h3>
        {hasFilters && <button type="button" className="portal-text-button" disabled={disabled} onClick={resetFilters}>Xóa bộ lọc</button>}
      </div>
      <label className="field-label">Tìm kiếm
        <span className="transfer-destination-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Ví dụ: RV10-SM-04 hoặc Kho nhỏ" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} />
        </span>
      </label>
      <div className="transfer-destination-filters">
        <label className="field-label">Loại kho<select value={otherTypes ? 'all' : 'same'} disabled={disabled} onChange={event => changeTypeScope(event.target.value === 'all')}>
          <option value="same">Cùng loại với kho hiện tại</option><option value="all">Tất cả loại kho</option>
        </select></label>
        <label className="field-label">Tình trạng<select value={showUnavailable ? 'all' : 'available'} disabled={disabled} onChange={event => setShowUnavailable(event.target.value === 'all')}>
          <option value="available">Chỉ kho có thể chọn</option><option value="all">Cả kho chưa phù hợp</option>
        </select></label>
        <label className="field-label">Tầng<select value={floor} disabled={disabled} onChange={event => setFloor(event.target.value)}><option value="">Tất cả tầng</option>{floors.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Khu vực<select value={zone} disabled={disabled} onChange={event => setZone(event.target.value)}><option value="">Tất cả khu vực</option>{zones.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      {otherTypes && <small className="workspace-help">Chọn kho khác loại có thể đổi giá. Khách cần ký phụ lục trước khi chuyển.</small>}
    </div>
    <div className="transfer-destination-toolbar">
      <div>
        <h3>Kho phù hợp</h3>
        <p role="status">{!current ? 'Đang kiểm tra kho trống…' : current.data
          ? `${filteredEligibleCount} kho có thể chọn${showUnavailable ? ` · ${choices.length} kho đang hiển thị` : ''}` : 'Chưa tải được danh sách kho.'}</p>
      </div>
      <button type="button" className="button-secondary" disabled={disabled || !current} onClick={() => setRevision(count => count + 1)}>
        <RefreshCw size={16} aria-hidden="true" /> Làm mới
      </button>
    </div>
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <>
      {!eligible.length && <p className="transfer-destination-notice">Chưa có kho {otherTypes ? '' : 'cùng loại '}trống suốt thời gian thuê còn lại.</p>}
      {choices.length > 0 && <fieldset className="transfer-destination-options" aria-label="Danh sách kho chuyển đến" disabled={disabled}>
        {choices.map(unit => <label key={first(unit, 'id')} className={`transfer-destination-card ${value === unit.id ? 'is-selected' : ''} ${unit.eligible !== true ? 'is-unavailable' : ''}`}>
          <input type="radio" name={`transfer-destination-${transferId}`} value={first(unit, 'id')} checked={value === unit.id} disabled={disabled || unit.eligible !== true} required onChange={event => { if (event.target.form) markFormDirty(event.target.form); onChange(event.target.value); }} />
          <span><span className="transfer-destination-card-heading"><strong>{first(unit, 'unitCode')}</strong><small className={unit.eligible === true ? 'is-available' : ''}>{unit.eligible === true ? 'Có thể chọn' : 'Chưa phù hợp'}</small></span>
            <span>{first(unit, 'storageType.name')}</span><small>{[first(unit, 'floor'), first(unit, 'zone') && 'Khu ' + first(unit, 'zone'), unit.row != null && `Dãy ${unit.row}`, unit.position != null && `Vị trí ${unit.position}`].filter(Boolean).join(' · ') || 'Chưa có thông tin vị trí'}</small>
            <small>{unit.eligible === true ? `Trống từ ${date(first(unit, 'checkedFrom'))} đến trước ${date(first(unit, 'checkedUntil'))}` : first(unit, 'unavailableReason') || 'Kho chưa thể dùng cho lần chuyển này.'}</small>
            {rows(unit.conflicts).map((conflict, index) => <small key={index}>Lịch đã giữ: {date(first(conflict, 'startDate'))} – {date(first(conflict, 'endDate'))}</small>)}
          </span>
        </label>)}
      </fieldset>}
      {!choices.length && eligible.length > 0 && <p className="transfer-destination-notice">Không có kho khớp bộ lọc. Thử đổi tiêu chí hoặc xóa bộ lọc.</p>}
      {selected && <p className="transfer-destination-notice" role="status">Đã chọn kho <strong>{first(selected, 'unitCode')}</strong>. Kho được giữ sau khi duyệt.</p>}
    </>}
    {preview.loading && <p role="status">Đang tính giá thuê kho mới…</p>}
    {preview.error && <p role="alert">{preview.error}</p>}
    {preview.data?.snapshot && <div className="booking-alert"><strong>Đổi loại kho cần khách ký phụ lục</strong><p>Giá hiện tại {money(preview.data.snapshot.currentRate)}/tháng. Giá mới {money(preview.data.snapshot.newRate)}/tháng từ {date(preview.data.snapshot.effectiveFrom)}.</p><p>Chênh lệch tháng {money(Math.abs(preview.data.snapshot.differencePerMonth))} {preview.data.snapshot.differencePerMonth >= 0 ? 'tăng' : 'giảm'}. Kỳ hiện tại và cọc giữ nguyên.</p>{preview.data.snapshot.smaller && <p>Kho mới nhỏ hơn. Khách cần kiểm tra hàng hóa có vừa kho hay không.</p>}</div>}
  </section>;
}
