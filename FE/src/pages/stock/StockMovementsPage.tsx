import { DetailCard } from '../../components/workspace/DetailRow';
import { StoredItemDetail } from '../../components/stock/StoredItemDetail';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { useStaffProcessingTarget } from '../staff/useStaffProcessingTarget';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StockReconciliation } from '../../components/stock/StockReconciliation';
import { StockMovementItems } from '../../components/stock/StockMovementItems';
import { DashboardSkeleton, DetailSkeleton } from '../../components/LoadingSkeleton';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { hasDraft } from '../../services/live-events';
import { internalPageSize } from '../../utils/internal-pagination';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { normalizeRentalSearch } from '../../utils/rental-choice';
import { ItemUnitSelect } from '../../components/ItemUnitSelect';
import { EntitySelect } from '../../components/EntitySelect';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useListPagination } from '../../components/workspace/useListPagination';
import { useAuth } from '../../auth/auth-context';
import { PageHeader, LoadState, Empty, Pagination, Facts, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { date, type Page } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import type { StockDraftLine, StockMovement, StockRole, StoredItem } from '../../types/stock';
import { stockCompleteInput, stockCreateInput, stockLineSummary, stockMovementLocation } from '../../utils/stock';
import { stockHandlingNote, storedLocation } from '../../utils/stock-units';
import { vietnamLocalMinute } from '../../utils/handover';
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';
import { useScopedSelection } from '../../components/customer/useScopedSelection';
import { RentalChoicePicker } from '../../components/customer/RentalChoicePicker';
import type { CustomerContract } from '../../types/customer';
import { StaffStockRecord } from './StaffStockRecord';

const statuses = { REQUESTED: 'Chờ phân công', ASSIGNED: 'Đã phân công', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
const dateTime = (value: unknown) => date(value, true);
const roleRoot = (role: StockRole) => role === 'MANAGER' ? '/manager/operations/stock-movements' : `/${role.toLowerCase()}/stock-movements`;

const freshLine = (): StockDraftLine => ({ key: crypto.randomUUID(), storedItemId: '', name: '', unit: '', quantity: '1', note: '' });

export function StockMovementsPage({ role }: { role: StockRole }) {
  const { user } = useAuth(), { id } = useParams();
  return id ? <StockDetail key={`${user?.id}:${id}`} role={role} id={id} /> : <StockList key={`${user?.id}:${role}`} role={role} />;
}
function StockList({ role }: { role: StockRole }) {
  const { user } = useAuth(), [params, setParams] = useSearchParams(), [creating, setCreating] = useState(() => role === 'CUSTOMER' && params.get('create') === '1'), [notice, setNotice] = useState('');
  const pendingParams = useRef(params);
  useLayoutEffect(() => { pendingParams.current = params; }, [params]);
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1)), query = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const key of ['status', 'type', 'search', 'rentalContractId']) if (params.get(key)) query.set(key, params.get(key)!);
  const data = useApiResource<Page<StockMovement>>(`/${role.toLowerCase()}/stock-movements?${query}`, user?.id, true);
  function update(key: string, value: string) {
    const next = new URLSearchParams(pendingParams.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    pendingParams.current = next;
    setParams(next, { replace: true });
  }
  const ListPagination = role === 'STAFF' ? StaffTaskPagination : Pagination;
  return <section className={role === 'CUSTOMER' ? 'customer-page' : ''}>
    <PageHeader title={role === 'STAFF' ? 'Phiếu nhập – xuất' : 'Nhập – xuất hàng khách'}>
      <button className="button-secondary" disabled={data.loading || creating || role !== 'CUSTOMER' && data.refreshing} onClick={data.refresh}>Làm mới</button>
      {role !== 'CUSTOMER' && <RefreshStatus active={data.refreshing} />}
      {role === 'CUSTOMER' && !creating && <button className="button-primary" onClick={() => setCreating(true)}>Tạo phiếu nhập / xuất</button>}
    </PageHeader>
    {role !== 'CUSTOMER' && <Link className="button-secondary" to={`/${role.toLowerCase()}/stored-items`}>Hàng đang lưu theo kho</Link>}
    {role === 'MANAGER' && <Link className="button-secondary" to="/manager/assignments">Phân công nhân viên</Link>}
    {notice && <p className="booking-alert" role="status">{notice}</p>}
    {role === 'CUSTOMER' && <><Link className="button-secondary" to={params.get('rentalContractId') ? `/customer/stored-items?rentalContractId=${encodeURIComponent(params.get('rentalContractId')!)}` : '/customer/stored-items'}>Hàng đang lưu</Link>{creating && <StockCreate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setNotice('Yêu cầu của bạn đã được gửi. Số lượng hàng sẽ được cập nhật sau khi giao nhận thực tế.'); data.refresh(); }} />}</>}
    <div className={`portal-toolbar${role === 'STAFF' ? ' staff-table-toolbar' : ''}`}>
      <label className={`field-label${role === 'STAFF' ? ' portal-search' : ''}`}>{role === 'STAFF' ? 'Tìm phiếu' : 'Tìm mã phiếu / hợp đồng'}<input type="search" maxLength={100} placeholder={role === 'STAFF' ? 'Mã phiếu, hợp đồng, khách hàng…' : undefined} value={params.get('search') ?? ''} onChange={event => update('search', event.target.value)} /></label>
      <label className="field-label">Trạng thái<select aria-label={role === 'STAFF' ? 'Trạng thái' : undefined} value={params.get('status') ?? ''} onChange={event => update('status', event.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label className="field-label">Loại phiếu<select aria-label={role === 'STAFF' ? 'Loại phiếu' : undefined} value={params.get('type') ?? ''} onChange={event => update('type', event.target.value)}><option value="">Tất cả</option><option value="IN">Nhập hàng</option><option value="OUT">Xuất hàng</option></select></label>
    </div>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} placeholder={role === 'STAFF'
      ? <StaffStockTable items={[]} userId={user?.id ?? ''} loadingRows={Math.min(limit, 6)} />
      : role === 'MANAGER' ? <div className="stock-grid">{[0, 1].map(index => <div className="stock-card" key={index}><DashboardSkeleton variant="activity" /></div>)}</div> : undefined} />
    {!data.loading && !data.error && <>{!data.data?.items.length && <Empty title="Chưa có phiếu phù hợp" />}
      {role === 'STAFF'
        ? data.data?.items.length ? <StaffStockTable items={data.data.items} userId={user?.id ?? ''} /> : null
        : <div className="stock-grid stock-movement-grid">{data.data?.items.map(row => <StockMovementCard key={row.id} row={row} role={role} />)}</div>}
      <ListPagination page={page} limit={limit} onLimitChange={value => update('limit', String(value))} total={data.data?.total ?? 0} onChange={value => update('page', String(value))} />
    </>}
  </section>;
}
function StockMovementCard({ row, role }: { row: StockMovement; role: StockRole }) {
  return <DetailCard className="stock-card stock-movement-card" detail={{ to: roleRoot(role) + '/' + encodeURIComponent(row.id), label: `Mở phiếu ${row.movementCode}` }}>
    <StockMovementItems movement={row} compact />
    <dl className="stock-movement-facts">
      <div><dt>Loại phiếu</dt><dd>{row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'}</dd></div>
      <div className="stock-movement-location"><dt>Kho hiện tại</dt><dd>{storedLocation({ storageUnit: row.currentStorageUnit })}</dd></div>
      {role === 'MANAGER' && <><div><dt>Khách hàng</dt><dd>{row.customer.fullName}</dd></div><div><dt>Phụ trách</dt><dd>{row.assignedStaff?.fullName ?? 'Chưa phân công'}</dd></div></>}
    </dl>
    <div className="stock-card-actions"><Status value={row.status} text={statuses[row.status]} /><Link className="button-secondary" to={roleRoot(role) + '/' + encodeURIComponent(row.id)}>Xem phiếu</Link></div>
  </DetailCard>;
}
function StaffStockTable({ items, userId, loadingRows }: { items: StockMovement[]; userId: string; loadingRows?: number }) {
  const columns: StaffColumn<StockMovement>[] = [
    { key: 'customer', label: 'Khách hàng / Kho', cell: row => {
      const { unit, label } = stockMovementLocation(row);
      return <><strong>{row.customer.fullName}</strong>{unit && <small>
        {row.status === 'COMPLETED' && !row.storageUnitAtCompletion ? `${label} · ` : ''}{storedLocation({ storageUnit: unit })}
      </small>}</>;
    } },
    { key: 'type', label: 'Loại phiếu', cell: row => <><strong>{row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'}</strong><CopyRecordCode value={row.movementCode} /></> },
    { key: 'items', label: 'Hàng hóa', cell: row => stockLineSummary(row.lines ?? [], row.status === 'COMPLETED') || '—' },
    { key: 'scheduled', label: 'Lịch hẹn', cell: row => row.scheduledAt ? dateTime(row.scheduledAt) : 'Chưa hẹn' },
    { key: 'status', label: 'Trạng thái', cell: row => <><Status value={row.status} text={statuses[row.status]} /></> },
  ];
  return <StaffTaskTable title="Danh sách phiếu nhập – xuất" columns={columns} items={items} rowKey={row => row.id} rowDetail={row => ({ to: roleRoot('STAFF') + '/' + encodeURIComponent(row.id), label: `Xem chi tiết phiếu ${row.movementCode}` })} loadingRows={loadingRows}
    emphasized={row => row.status === 'ASSIGNED' && row.assignedStaff?.id === userId} />;
}
function StockCreate({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const [params] = useSearchParams();
  const { user } = useAuth(), contracts = usePaginatedResource<CustomerContract>('/customer/contracts', user?.id);
  const [contract, setContract] = useScopedSelection('rentalContractId', (contracts.data?.items ?? []).filter(row => row.status === 'ACTIVE').map(row => ({ value: row.id })), true);
  const [type, setType] = useState<'IN' | 'OUT'>(() => params.get('type') === 'OUT' ? 'OUT' : 'IN'), [lines, setLines] = useState([freshLine()]), [note, setNote] = useState(''), [schedule, setSchedule] = useState('');
  const items = useApiResource<StoredItem[]>(contract ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contract)}` : null, user?.id, true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const selectedContract = contracts.data?.items.find(row => row.id === contract && row.status === 'ACTIVE');
  const startDate = selectedContract?.startDate?.slice(0, 10);
  const endDate = selectedContract?.endDate?.slice(0, 10);
  const startMinute = startDate ? `${startDate}T00:00` : '';
  const nextMinute = vietnamLocalMinute(now + 60000);
  const minSchedule = startMinute > nextMinute ? startMinute : nextMinute;
  const endTime = endDate ? Date.parse(`${endDate}T00:00:00+07:00`) : NaN;
  const maxSchedule = Number.isFinite(endTime) ? vietnamLocalMinute(endTime - 60000) : undefined;
  const patch = (key: string, change: Partial<StockDraftLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...change } : line));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (lock.current) return; setError('');
    try {
      if (!contracts.data?.items.some(row => row.id === contract && row.status === 'ACTIVE')) throw new Error('Vui lòng chọn hợp đồng đang hoạt động của bạn.');
      if (items.loading || items.error) throw new Error('Cần tải thành công danh sách hàng trước khi gửi.');
      const input = stockCreateInput(contract, type, lines, items.data ?? [], schedule, note);
      if (input.scheduledAt && Date.parse(input.scheduledAt) <= Date.now()) throw new Error('Lịch dự kiến phải ở tương lai.');
      lock.current = true; setBusy(true); await mutate('/customer/stock-movements', 'POST', input, true); onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không gửi được phiếu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <form className="stock-card stock-form" onSubmit={submit}>
    <h2>Tạo phiếu nhập / xuất hàng</h2><p className="booking-alert">{stockHandlingNote}</p><p>Chọn kho bạn muốn gửi hoặc lấy hàng. Hàng đang lưu chỉ gồm mặt hàng còn tồn. Lịch dự kiến theo giờ Việt Nam (UTC+7).</p>
    <LoadState loading={contracts.loading} error={contracts.error} retry={contracts.refresh} />
    <fieldset disabled={busy} className="stock-fields">
      <RentalChoicePicker contracts={contracts.data?.items ?? []} value={contract} disabled={busy} onChange={value => { setContract(value); setLines([freshLine()]); }} />
      {!contracts.loading && !contracts.error && !contracts.data?.items.some(row => row.status === 'ACTIVE') && <p>Chưa có hợp đồng đang hoạt động. Hoàn tất bàn giao kho trước khi gửi phiếu.</p>}
      <label className="field-label">Loại phiếu<select aria-label="Loại phiếu" value={type} onChange={event => { setType(event.target.value as 'IN' | 'OUT'); setLines([freshLine()]); }}><option value="IN">Nhập hàng</option><option value="OUT">Xuất hàng</option></select></label>
      <label className="field-label">Lịch dự kiến (tùy chọn)
        <input type="datetime-local" min={minSchedule} max={maxSchedule} value={schedule} onFocus={() => setNow(Date.now())} onChange={event => setSchedule(event.target.value)} aria-describedby="stock-schedule-hint" />
      </label>
      <small id="stock-schedule-hint">Chọn giờ trong tương lai và trong kỳ thuê, theo giờ Việt Nam. Nếu chưa biết giờ giao nhận, bạn có thể để trống.</small>
      <LoadState loading={items.loading} error={items.error} retry={items.refresh} />
      {lines.map((line, index) => <fieldset key={line.key} className="stock-line"><legend>Hàng {index + 1}</legend>
        <label className="field-label">Mặt hàng<EntitySelect aria-label={`Mặt hàng ${index + 1}`} value={line.storedItemId} required={type === 'OUT'} onValueChange={selectedValue => patch(line.key, { storedItemId: selectedValue })}><option value="">{type === 'IN' ? 'Nhập hàng mới' : 'Chọn hàng đang lưu'}</option>{items.data?.map(item => <option key={item.id} value={item.id}>{item.name} · {item.itemCode} · tồn {item.balance} {item.unit}</option>)}</EntitySelect></label>
        {type === 'IN' && !line.storedItemId && <><label className="field-label">Tên hàng<input required maxLength={160} value={line.name} onChange={event => patch(line.key, { name: event.target.value })} /></label><label className="field-label">Đơn vị<ItemUnitSelect required value={line.unit} onChange={value => patch(line.key, { unit: value })} /></label></>}
        <label className="field-label">Số lượng yêu cầu<input type="number" min={1} max={1000000} step={1} required value={line.quantity} onChange={event => patch(line.key, { quantity: event.target.value })} /></label>
        <label className="field-label">Ghi chú dòng hàng<input maxLength={500} value={line.note} onChange={event => patch(line.key, { note: event.target.value })} /></label>
        <button className="button-secondary" type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Bỏ dòng {index + 1}</button>
      </fieldset>)}
      <button type="button" className="button-secondary" disabled={lines.length >= 100} onClick={() => setLines(current => [...current, freshLine()])}>Thêm dòng hàng</button>
      <label className="field-label">Ghi chú phiếu<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <label className="stock-confirmation"><input required type="checkbox" /><span>Tôi đã đối chiếu hàng hóa và số lượng yêu cầu</span></label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      <div className="portal-actions"><button className="button-primary" disabled={contracts.loading || Boolean(contracts.error) || !contract || items.loading || Boolean(items.error)}>{busy ? 'Đang gửi…' : 'Gửi phiếu'}</button><button className="button-secondary" type="button" onClick={onClose}>Hủy</button></div>
    </fieldset>
  </form>;
}
function StockDetail({ role, id }: { role: StockRole; id: string }) {
  const { user } = useAuth(), data = useApiResource<StockMovement>(`/${role.toLowerCase()}/stock-movements/${encodeURIComponent(id)}`, user?.id, true, role !== 'CUSTOMER');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<StockMovement>();
  const returnPath = useInternalListReturn(roleRoot(role));
  const row = data.error ? null : data.data?.status === 'COMPLETED' ? data.data : saved ?? data.data;
  const unit = row && role === 'STAFF'
    ? row.status === 'COMPLETED' ? row.storageUnitAtCompletion : stockMovementLocation(row).unit
    : row?.storageUnitAtCompletion ?? row?.currentStorageUnit ?? row?.storageUnit;
  const unitNumber = unit?.unitNumber;
  useStaffProcessingTarget(role === 'STAFF' && row?.status === 'ASSIGNED' && row.assignedStaff?.id === user?.id);
  function refresh() {
    if (role === 'STAFF' && hasDraft()) {
      setNotice('Hãy lưu hoặc đóng biểu mẫu kiểm đếm trước khi làm mới.');
      return;
    }
    data.refresh();
  }
  return <section className={role === 'CUSTOMER' ? 'customer-page record-detail-page' : role === 'STAFF' ? 'record-detail-page staff-stock-detail' : 'record-detail-page'}>
    <Link className="booking-back" to={returnPath}>{role === 'STAFF' && <ArrowLeft size={16} aria-hidden="true" />}Về danh sách</Link>
    <PageHeader title={row ? [row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng', unitNumber && (role === 'STAFF' ? unitNumber : `Kho ${unitNumber}`)].filter(Boolean).join(' · ') : 'Chi tiết nhập – xuất hàng'}
      status={row && <Status value={row.status} text={statuses[row.status]} />}
      meta={row && <CopyRecordCode value={row.movementCode} label={role === 'STAFF' ? 'Mã phiếu' : undefined} />}>
      <button className="button-secondary" onClick={refresh} disabled={role === 'STAFF' && (data.loading || data.refreshing)}>
        {role === 'STAFF' && <RefreshCw size={16} aria-hidden="true" />}Làm mới
      </button>
      {role !== 'CUSTOMER' && <RefreshStatus active={data.refreshing} />}
    </PageHeader>
    {notice && <p role="status" className="booking-alert">{notice}</p>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} placeholder={role !== 'CUSTOMER' ? <DetailSkeleton single form={role === 'STAFF'} heading={false} /> : undefined} />
    {row && <StockRecord key={`${row.status}:${row.updatedAt ?? row.assignedStaff?.id}`} row={row} role={role} onSaved={(message, result) => {
      if (result?.status === 'COMPLETED') setSaved({ ...row, ...result, rentalContract: { ...row.rentalContract, ...result.rentalContract } });
      setNotice(message);
      data.refresh();
    }} />}
  </section>;
}
function StockRecord({ row, role, onSaved }: { row: StockMovement; role: StockRole; onSaved: (message: string, result: StockMovement) => void }) {
  const { user } = useAuth(), [note, setNote] = useState(''), [quantities, setQuantities] = useState(Object.fromEntries((row.lines ?? []).map(line => [line.id, line.actualQty == null ? '' : String(line.actualQty)]))), [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const discrepancy = (row.lines ?? []).some(line => Boolean(quantities[line.id]?.trim()) && Number(quantities[line.id]) !== line.requestedQty);
  const completable = role === 'STAFF' && row.status === 'ASSIGNED' && row.assignedStaff?.id === user?.id
    && (!row.rentalContract?.status || row.rentalContract.status === 'ACTIVE')
    && row.lines.length > 0 && row.lines.every(line => line.storedItem.balance != null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (lock.current) return; setError(''); try {
    if (!completable) throw new Error('Bạn không có quyền thao tác ở trạng thái hiện tại.');
    if (!confirmed) throw new Error('Vui lòng xác nhận trước khi lưu.');
    const body = stockCompleteInput(row, quantities, note);
    lock.current = true; setBusy(true);
    const result = await mutate<StockMovement>(`/staff/stock-movements/${encodeURIComponent(row.id)}/complete`, 'POST', body);
    setConfirmed(false); onSaved('Đã hoàn tất phiếu và cập nhật số lượng hàng.', result);
  } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không lưu được phiếu.'); } finally { lock.current = false; setBusy(false); } };
  const editor = completable ? <form onSubmit={submit} id="staff-processing" tabIndex={-1}>
      <fieldset disabled={busy} className="stock-fields">
        <h2>Đối chiếu hàng hóa</h2>
        <StockReconciliation staffResults lines={row.lines} movementType={row.type} quantities={quantities} onQuantityChange={(lineId, value) => {
          setQuantities(current => ({ ...current, [lineId]: value }));
          setConfirmed(false);
        }} />
        <label className="field-label">Ghi chú kiểm đếm{discrepancy ? ' (bắt buộc khi chênh lệch)' : ''}
          <textarea required={discrepancy} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
        </label>
        <label className="stock-confirmation">
          <input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          <span>Tôi đã kiểm đếm và thực hiện giao nhận hàng thực tế</span>
        </label>
        {error && <p role="alert" className="booking-alert is-error">{error}</p>}
        <div className="portal-actions">
          <button className="button-primary" disabled={busy || !confirmed}>{busy ? 'Đang lưu…' : 'Hoàn tất phiếu'}</button>
        </div>
      </fieldset>
    </form> : undefined;
  if (role === 'STAFF') return <StaffStockRecord row={row} editor={editor} />;
  return <article className="stock-card stock-form stock-record-compact">
    <Facts items={[
      ...(role === 'CUSTOMER' ? [] : [['Khách hàng', row.customer?.fullName ?? '—']] as [string, string][]),
      [row.completedAt ? 'Hoàn tất' : 'Lịch hẹn', dateTime(row.completedAt ?? row.scheduledAt)],
      ...(role !== 'CUSTOMER' ? [['Nhân viên', row.completedBy?.fullName || row.assignedStaff?.fullName || 'Chưa phân công']] as [string, string][] : []),
    ]} />
    <section className="stock-fields">
      <h2>{row.status === 'COMPLETED' ? 'Kết quả giao nhận' : 'Hàng hóa trong phiếu'}</h2>
      <StockReconciliation compact lines={row.lines ?? []} movementType={row.type} />
    </section>
    {row.note && <p><strong>Ghi chú: </strong>{row.note}</p>}
    {row.completionNote && <p><strong>Kết quả giao nhận: </strong>{row.completionNote}</p>}
    {!['COMPLETED', 'CANCELLED'].includes(row.status) && <WorkflowHint>{workflowGuide('stock-movements', row.status, role === 'CUSTOMER' ? 'customer' : 'internal')}</WorkflowHint>}
    {row.rentalContract?.contractCode && <DetailDisclosure title="Hồ sơ liên quan">
      <Facts items={[
        ['Hợp đồng', role === 'MANAGER' ? <Link key="contract" to={`/manager/operations/contracts/${encodeURIComponent(row.rentalContract.id)}`}>{row.rentalContract.contractCode}</Link> : <Link key="contract" to={`/customer/contracts?contract=${encodeURIComponent(row.rentalContract.id)}`}>{row.rentalContract.contractCode}</Link>],
        ...(row.currentStorageUnit && row.currentStorageUnit.unitNumber !== row.storageUnitAtCompletion?.unitNumber && row.storageUnitAtCompletion ? [['Kho hiện tại', row.currentStorageUnit.unitNumber]] as [string, string][] : []),
      ]} />
    </DetailDisclosure>}
  </article>;
}
export function StoredItemsPage() {
  const { user } = useAuth(), [params, setParams] = useSearchParams();
  const contractId = params.get('rentalContractId');
  const data = useApiResource<StoredItem[]>('/customer/stored-items' + (contractId ? '?rentalContractId=' + encodeURIComponent(contractId) : ''), user?.id, true);
  const [selected, setSelected] = useState<StoredItem | null>(null);
  const search = params.get('search') ?? '';
  const items = data.data?.filter(item => normalizeRentalSearch(`${item.name} ${item.itemCode} ${item.rentalContract?.contractCode} ${storedLocation(item)}`).includes(normalizeRentalSearch(search))) ?? [];
  const { items: visible, pagination } = useListPagination(items);
  return <section className="customer-page"><PageHeader title="Hàng đang lưu" description="Số lượng hàng của bạn đã được kiểm đếm. Yêu cầu đang chờ xử lý chưa làm thay đổi số lượng này."><Link className="button-secondary" to="/customer/stock-movements">Phiếu nhập – xuất</Link><button className="button-secondary" onClick={data.refresh}>Làm mới</button></PageHeader><label className="field-label">Tìm hàng / mã kho / hợp đồng<input type="search" value={search} onChange={event => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (event.target.value) next.set('search', event.target.value);
    else next.delete('search');
    next.delete('page');
    return next;
  }, { replace: true })} /></label><LoadState loading={data.loading} error={data.error} retry={data.refresh} />{!data.loading && !data.error && <>{!items.length && <Empty title="Chưa có hàng tồn phù hợp" />}<div className="stock-grid">{visible.map(item => <DetailCard className="stock-card" key={item.id} detail={{ open: () => setSelected(item), label: `Xem mặt hàng ${item.name} · ${item.itemCode}` }}><h2>{item.name}</h2><p>{item.itemCode}</p><p><strong>Kho hiện tại: {storedLocation(item)}</strong></p><p>Hợp đồng: {item.rentalContract?.contractCode}</p><strong>Tồn: {item.balance} {item.unit}</strong>{item.note && <p>{item.note}</p>}</DetailCard>)}</div>{pagination}</>}{selected && <StoredItemDetail item={selected} movements="/customer/stock-movements" onClose={() => setSelected(null)} />}</section>;
}
