import { useApiResource } from '../../services/useApiResource';
import { money } from './portal-data';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';
import { first, rows, type Page, type Row } from './portal-data';
import { Box, Check, ChevronDown, RefreshCw, Search } from 'lucide-react';
import { transferDestinationPath, transferLocation } from '../../utils/transfer-request';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
type FinancialReview = { leaseEnd: string; renewals: { code: string; appendixCode: string; start: string; end: string }[];
  paidAmount: number; outstandingAmount: number; depositAmount: number; dueAmount: number; futureRentIncrease: number; futureRentReduction: number };

export function TransferDestinationPicker({ transferId, source, value, onChange, onReady, onReviewed, disabled }: {
  transferId: string; source: Row; value: string; onChange: (unit: Row | null) => void; onReady: (ready: boolean) => void; disabled: boolean;
  onReviewed: (hash: string) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState(''), [floor, setFloor] = useState(''), [zone, setZone] = useState('');
  const [visible, setVisible] = useState(6);
  const [showUnavailable, setShowUnavailable] = useState(false), [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Page; error?: string }>();
  const key = `${user?.id}:${transferId}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    allPages(transferDestinationPath(transferId), controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không tải được danh sách kho.' }); });
    return () => controller.abort();
  }, [key, transferId]);
  const current = state?.key === key ? state : undefined;
  const units = current?.data?.items ?? [], eligible = units.filter(unit => unit.eligible === true);
  const selected = units.find(unit => first(unit, 'id') === value && unit.eligible === true);
  useEffect(() => { if (value && current && !current.data?.items.some(unit => first(unit, 'id') === value && unit.eligible === true)) onChange(null); }, [current, value, onChange]);
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
  }, [selected, preview.data, preview.loading, preview.refreshing, preview.error, onReady, onReviewed]);
  const floors = [...new Set(units.map(unit => first(unit, 'floor')).filter(Boolean))];
  const zones = [...new Set(units.map(unit => first(unit, 'zone')).filter(Boolean))];
  const filteredEligibleCount = choices.filter(unit => unit.eligible === true).length;
  const hasFilters = Boolean(search.trim() || floor || zone || showUnavailable);
  function resetFilters() {
    setSearch('');
    setFloor('');
    setZone('');
    setShowUnavailable(false);
    setVisible(6);
  }

  return <section className="transfer-choices" aria-label="Chọn kho đích">
    <h2><Box size={20} /> Chọn kho đích</h2>
    <div className="transfer-filters">
      <label className="transfer-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Tìm kho đích" placeholder="Nhập mã hoặc loại kho" value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setVisible(6); }} /></label>
      <label className="field-label">Tình trạng<select value={showUnavailable ? 'all' : 'available'} disabled={disabled} onChange={event => { setShowUnavailable(event.target.value === 'all'); setVisible(6); }}>
        <option value="available">Có thể chọn</option><option value="all">Tất cả</option>
      </select></label>
      <label className="field-label">Tầng<select value={floor} disabled={disabled} onChange={event => { setFloor(event.target.value); setVisible(6); }}><option value="">Tất cả</option>{floors.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field-label">Khu vực<select value={zone} disabled={disabled} onChange={event => { setZone(event.target.value); setVisible(6); }}><option value="">Tất cả</option>{zones.map(item => <option key={item}>{item}</option>)}</select></label>
      <button type="button" className="button-secondary" aria-label="Làm mới danh sách kho" disabled={disabled || !current} onClick={() => setRevision(count => count + 1)}><RefreshCw size={16} /></button>
    </div>
    <div className="transfer-filter-summary"><span role="status">{!current ? 'Đang kiểm tra kho trống…' : current.data ? filteredEligibleCount + ' kho có thể chọn' : 'Chưa tải được danh sách kho.'}</span>
      {hasFilters && <button type="button" className="portal-text-button" disabled={disabled} onClick={resetFilters}>Xóa bộ lọc</button>}
    </div>
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <>
      {!eligible.length && <p className="transfer-destination-notice">Chưa có kho cùng loại trống suốt thời gian thuê còn lại.</p>}
      {choices.length > 0 && <div className="transfer-table" role="region" aria-label="Danh sách kho chuyển đến" tabIndex={0}>
        <table><thead><tr><th aria-label="Chọn" /><th scope="col">Mã kho</th><th scope="col">Vị trí</th><th scope="col">Khả dụng</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{choices.slice(0, visible).map(unit => {
            const unitId = first(unit, 'id'), unitCode = first(unit, 'unitCode');
            const available = unit.eligible === true;
            const choose = () => onChange(unit);
            return <tr key={unitId} className={value === unitId ? 'is-selected' : undefined} data-available={available}
              onClick={event => { if (!disabled && available && !(event.target instanceof HTMLInputElement)) choose(); }}>
              <td><input type="radio" name={'transfer-destination-' + transferId} aria-label={'Chọn kho ' + unitCode} value={unitId} checked={value === unitId} disabled={disabled || !available}
                onChange={choose} /></td>
              <td><strong>{unitCode}</strong></td><td>{transferLocation(unit) || 'Chưa có vị trí'}</td>
              <td>{available ? date(first(unit, 'checkedFrom')) + ' – trước ' + date(first(unit, 'checkedUntil')) : first(unit, 'unavailableReason') || 'Kho chưa thể dùng cho lần chuyển này.'}
                {rows(unit.conflicts).map((conflict, index) => <small key={index}>Lịch đã giữ: {date(first(conflict, 'startDate'))} – {date(first(conflict, 'endDate'))}</small>)}</td>
              <td><span className={available ? 'transfer-available' : 'transfer-unavailable'}>{available && <Check size={14} />} {available ? 'Có thể chọn' : 'Chưa phù hợp'}</span></td>
            </tr>;
          })}</tbody>
        </table>
        {choices.length > visible && <button type="button" className="transfer-more" disabled={disabled} onClick={() => setVisible(count => count + 6)}>Xem thêm kho <ChevronDown size={16} /></button>}
      </div>}
      {!choices.length && eligible.length > 0 && <p className="transfer-destination-notice">Không có kho khớp bộ lọc.</p>}
    </>}
    {(preview.loading || preview.refreshing) && <p role="status">Đang tính giá thuê kho mới…</p>}
    {preview.error && <div className="transfer-destination-notice" role="alert"><strong>Chưa thể kiểm tra phương án chuyển kho</strong><p>{preview.error}</p><button type="button" className="button-secondary" disabled={disabled} onClick={preview.refresh}>Kiểm tra lại</button></div>}
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
