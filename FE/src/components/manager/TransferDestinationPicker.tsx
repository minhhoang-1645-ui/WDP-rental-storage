import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';
import { markFormDirty } from '../../services/live-events';
import { first, rows, type Page, type Row } from './portal-data';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

/** Inline choices avoid dropdowns clipped by the operation sidebar. */
export function TransferDestinationPicker({ transferId, source, value, onChange, disabled }: {
  transferId: string; source: Row; value: string; onChange: (id: string) => void; disabled: boolean;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState(''), [floor, setFloor] = useState(''), [zone, setZone] = useState('');
  const [showUnavailable, setShowUnavailable] = useState(false), [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Page; error?: string }>();
  const key = `${user?.id}:${transferId}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    allPages(`/manager/transfers/${encodeURIComponent(transferId)}/destinations`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không tải được danh sách kho.' }); });
    return () => controller.abort();
  }, [key, transferId]);
  const current = state?.key === key ? state : undefined;
  const units = current?.data?.items ?? [], eligible = units.filter(unit => unit.eligible === true);
  const selected = units.find(unit => first(unit, 'id') === value && unit.eligible === true);
  useEffect(() => { if (value && (!current?.data || !current.data.items.some(unit => first(unit, 'id') === value && unit.eligible === true))) onChange(''); }, [current?.data, value, onChange]);
  const choices = units.filter(unit => (showUnavailable || unit.eligible === true) && (!floor || unit.floor === floor) && (!zone || unit.zone === zone)
    && normalize([first(unit, 'unitCode'), first(unit, 'storageType.name'), first(unit, 'floor'), first(unit, 'zone')].join(' ')).includes(normalize(search.trim())))
    .sort((a, b) => Number(b.eligible === true) - Number(a.eligible === true));
  const floors = [...new Set(units.map(unit => first(unit, 'floor')).filter(Boolean))];
  const zones = [...new Set(units.map(unit => first(unit, 'zone')).filter(Boolean))];
  return <section className="transfer-destination-picker" aria-label="Chọn kho đích">
    <div className="transfer-destination-context"><strong>Kho đang dùng: {first(source, 'unitCode')}</strong><span>{first(source, 'storageType.name')}</span><small>Chuyển cùng loại, giữ nguyên giá và thời hạn hợp đồng.</small></div>
    <label className="field-label">Tìm kho đích<input type="search" placeholder="Nhập mã kho, tầng hoặc khu vực…" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /></label>
    <div className="transfer-destination-filters">
      <label className="field-label">Tầng<select value={floor} disabled={disabled} onChange={event => setFloor(event.target.value)}><option value="">Tất cả tầng</option>{floors.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field-label">Khu vực<select value={zone} disabled={disabled} onChange={event => setZone(event.target.value)}><option value="">Tất cả khu vực</option>{zones.map(item => <option key={item}>{item}</option>)}</select></label>
    </div>
    <label className="portal-checkbox"><input type="checkbox" checked={showUnavailable} disabled={disabled} onChange={event => setShowUnavailable(event.target.checked)} />Hiện cả kho chưa thể chuyển để xem lý do</label>
    <button type="button" className="button-secondary" disabled={disabled || !current} onClick={() => setRevision(count => count + 1)}>Kiểm tra lại kho trống</button>
    {!current && <p role="status">Đang kiểm tra toàn bộ kho cùng loại và lịch thuê còn lại…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <>
      <p role="status"><strong>{eligible.length} kho có thể chuyển</strong> / {units.length} kho cùng loại khác kho nguồn. {choices.length} kết quả đang hiển thị.</p>
      {!eligible.length && <p className="transfer-destination-notice">Chưa có kho cùng loại trống suốt kỳ thuê còn lại. Bạn có thể xem lý do từng kho hoặc kiểm tra lại sau; chưa duyệt chuyển khi chưa có kho phù hợp.</p>}
      <fieldset className="transfer-destination-options" disabled={disabled}><legend>Chọn một kho đích</legend>
        {choices.map(unit => <label key={first(unit, 'id')} className={`transfer-destination-card ${value === unit.id ? 'is-selected' : ''} ${unit.eligible !== true ? 'is-unavailable' : ''}`}>
          <input type="radio" name={`transfer-destination-${transferId}`} value={first(unit, 'id')} checked={value === unit.id} disabled={disabled || unit.eligible !== true} required onChange={event => { if (event.target.form) markFormDirty(event.target.form); onChange(event.target.value); }} />
          <span><strong>{first(unit, 'unitCode')}</strong><span>{first(unit, 'storageType.name')}</span><small>{first(unit, 'floor') || 'Chưa có thông tin tầng'} · Khu {first(unit, 'zone') || 'chưa cập nhật'}{unit.row != null ? ` · Dãy ${unit.row}` : ''}{unit.position != null ? ` · Vị trí ${unit.position}` : ''}</small>
            <small>{unit.eligible === true ? `Trống từ ${date(first(unit, 'checkedFrom'))} đến ${date(first(unit, 'checkedUntil'))} (không gồm ngày kết thúc)` : first(unit, 'unavailableReason')}</small>
            {rows(unit.conflicts).map((conflict, index) => <small key={index}>Lịch đã giữ: {date(first(conflict, 'startDate'))} – {date(first(conflict, 'endDate'))}</small>)}
          </span>
        </label>)}
      </fieldset>
      {!choices.length && <p>Không có kho khớp bộ lọc. <button type="button" disabled={disabled} onClick={() => { setSearch(''); setFloor(''); setZone(''); }}>Xóa bộ lọc</button></p>}
      {selected && <p className="transfer-destination-notice" role="status">Đã chọn <strong>{first(selected, 'unitCode')}</strong>. Kho chỉ được giữ sau khi bạn bấm Duyệt chuyển kho thành công.</p>}
    </>}
  </section>;
}
