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
type FinancialReview = { leaseEnd: string; renewals: { code: string; appendixCode: string; start: string; end: string }[];
  paidAmount: number; outstandingAmount: number; depositAmount: number; dueAmount: number; futureRentIncrease: number; futureRentReduction: number };

/** Inline choices avoid dropdowns clipped by the operation sidebar. */
export function TransferDestinationPicker({ transferId, source, value, onChange, onReady, onReviewed, disabled }: {
  transferId: string; source: Row; value: string; onChange: (id: string) => void; onReady: (ready: boolean) => void; disabled: boolean;
  onReviewed: (hash: string) => void;
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
  const preview = useApiResource<{ sameType: boolean; reviewHash?: string; snapshot?: { effectiveFrom: string; currentRate: number; newRate: number; smaller: boolean; financialReview?: FinancialReview;
    adjustmentTerms?: { fee: number; rentalAdjustment: number; depositAdjustment: number; targetDeposit: number; currentDeposit: number; amountDue: number; refundAmount: number } } }>(selected ? `/manager/transfers/${encodeURIComponent(transferId)}/commercial-preview?destination=${encodeURIComponent(value)}` : null, user?.id);
  const terms = preview.data?.snapshot;
  const finance = terms?.financialReview;
  const rentAdjustment = finance ? finance.futureRentIncrease - finance.futureRentReduction : 0;
  useEffect(() => {
    const reviewed = selected && preview.data && !preview.loading && !preview.refreshing && !preview.error;
    onReady(Boolean(reviewed));
    onReviewed(reviewed ? preview.data?.reviewHash ?? '' : '');
  }, [selected, otherTypes, preview.data, preview.loading, preview.refreshing, preview.error, onReady, onReviewed]);
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
        <p>Chỉ chọn kho cùng loại tại cơ sở hiện tại.</p>
        <label className="field-label">Tình trạng<select value={showUnavailable ? 'all' : 'available'} disabled={disabled} onChange={event => setShowUnavailable(event.target.value === 'all')}>
          <option value="available">Chỉ kho có thể chọn</option><option value="all">Cả kho chưa phù hợp</option>
        </select></label>
        <label className="field-label">Tầng<select value={floor} disabled={disabled} onChange={event => setFloor(event.target.value)}><option value="">Tất cả tầng</option>{floors.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Khu vực<select value={zone} disabled={disabled} onChange={event => setZone(event.target.value)}><option value="">Tất cả khu vực</option>{zones.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
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
      {selected && !terms && <p className="transfer-destination-notice" role="status">Đã chọn kho <strong>{first(selected, 'unitCode')}</strong>. Kho được giữ sau khi duyệt.</p>}
    </>}
    {(preview.loading || preview.refreshing) && <p role="status">Đang tính giá thuê kho mới…</p>}
    {preview.error && <div className="transfer-destination-notice" role="alert"><strong>Chưa thể lập phụ lục đổi loại</strong><p>{preview.error}</p><button type="button" className="button-secondary" disabled={disabled} onClick={preview.refresh}>Kiểm tra lại</button></div>}
    {terms && <div className="transfer-destination-notice transfer-price-review">
      <strong>Phụ lục chuyển kho · {first(source, 'unitCode')} → {first(selected ?? {}, 'unitCode')}</strong>
      <dl className="transfer-price-rates">
        <div><dt>Giá hiện tại</dt><dd>{money(terms.currentRate)}/tháng</dd></div>
        <div><dt>{finance && terms.effectiveFrom >= finance.leaseEnd ? 'Giá nếu gia hạn tiếp' : 'Giá mới từ ' + date(terms.effectiveFrom)}</dt><dd>{money(terms.newRate)}/tháng</dd></div>
      </dl>
      {terms.adjustmentTerms && <p>{terms.adjustmentTerms.fee === 0 ? 'Miễn phí chuyển kho' : `Phí chuyển ${money(terms.adjustmentTerms.fee)}`} · Chênh lệch thuê {money(terms.adjustmentTerms.rentalAdjustment)} · Điều chỉnh cọc {money(terms.adjustmentTerms.depositAdjustment)} · Thu thêm dự kiến {money(terms.adjustmentTerms.amountDue)} · Hoàn dự kiến {money(terms.adjustmentTerms.refundAmount)}</p>}
      {finance && rentAdjustment !== 0 && <p>Tiền thuê kỳ sau {rentAdjustment > 0 ? 'tăng' : 'giảm'} {money(Math.abs(rentAdjustment))}.</p>}
      <p><strong>Khách cần ký phụ lục</strong>{finance && finance.dueAmount > 0 ? ` và trả ${money(finance.dueAmount)} đến hạn` : ''} trước khi nhân viên nhận việc.</p>
      {terms.smaller && <p>Kho mới nhỏ hơn. Khách cần kiểm tra hàng có vừa kho.</p>}
      {finance && <details key={transferId + ':' + value}>
        <summary>Chi tiết thanh toán và gia hạn</summary>
        <dl className="transfer-price-rates">
          <div><dt>Đã trả</dt><dd>{money(finance.paidAmount)}</dd></div>
          <div><dt>Còn phải trả theo hóa đơn</dt><dd>{money(finance.outstandingAmount)}</dd></div>
          <div><dt>Tiền cọc hiện có</dt><dd>{money(terms.adjustmentTerms?.currentDeposit ?? finance.depositAmount)}</dd></div>
        </dl>
        <p>Thời hạn thuê giữ nguyên đến trước {date(finance.leaseEnd)}.</p>
        {finance.renewals.length > 0 && <><p>Giữ nguyên giá đã ký cho các kỳ gia hạn.</p><ul>{finance.renewals.map(item => <li key={item.code}>{item.appendixCode} · {date(item.start)} đến trước {date(item.end)}</li>)}</ul></>}
      </details>}
    </div>}
  </section>;
}
