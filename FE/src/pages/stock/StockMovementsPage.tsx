import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { PageHeader, LoadState, Empty, Pagination, Facts } from '../../components/manager/PortalUi';
import { date, label, type Page } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import type { StockDraftLine, StockMovement, StockRole, StoredItem } from '../../types/stock';
import { stockCompleteInput, stockCreateInput } from '../../utils/stock';

const statuses = { REQUESTED: 'Chờ phân công', ASSIGNED: 'Đã phân công', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
const dateTime = (value: unknown) => date(value, true);
const roleRoot = (role: StockRole) => role === 'MANAGER' ? '/manager/operations/stock-movements' : `/${role.toLowerCase()}/stock-movements`;
const freshLine = (): StockDraftLine => ({ key: crypto.randomUUID(), storedItemId: '', name: '', unit: '', quantity: '1', note: '' });

export function StockMovementsPage({ role }: { role: StockRole }) {
  const { user } = useAuth(), { id } = useParams();
  return id ? <StockDetail key={`${user?.id}:${id}`} role={role} id={id} /> : <StockList key={`${user?.id}:${role}`} role={role} />;
}
function StockList({ role }: { role: StockRole }) {
  const { user } = useAuth(), [params, setParams] = useSearchParams(), [creating, setCreating] = useState(false), [notice, setNotice] = useState('');
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1)), query = new URLSearchParams({ page: String(page), limit: '20' });
  for (const key of ['status', 'type', 'search']) if (params.get(key)) query.set(key, params.get(key)!);
  const data = useApiResource<Page<StockMovement>>(`/${role.toLowerCase()}/stock-movements?${query}`, user?.id, true);
  const update = (key: string, value: string) => setParams(current => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; }, { replace: true });
  return <section className={role === 'CUSTOMER' ? 'customer-page' : ''}>
    <PageHeader title="Nhập – xuất hàng khách" description="Phiếu yêu cầu → phân công → kiểm đếm thực tế. Tồn hàng chỉ thay đổi khi hoàn tất phiếu.">
      <button className="button-secondary" disabled={data.loading || creating} onClick={data.refresh}>Làm mới</button>
      {role === 'CUSTOMER' && !creating && <button className="button-primary" onClick={() => setCreating(true)}>Tạo phiếu nhập / xuất</button>}
    </PageHeader>
    {notice && <p className="booking-alert" role="status">{notice}</p>}
    {role === 'CUSTOMER' && <><Link className="button-secondary" to="/customer/stored-items">Hàng đang lưu</Link>{creating && <StockCreate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setNotice('Đã gửi phiếu. Tồn hàng chưa thay đổi; WDP sẽ phân công nhân viên xử lý.'); data.refresh(); }} />}</>}
    <div className="portal-toolbar">
      <label className="field-label">Tìm mã phiếu / hợp đồng<input type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => update('search', event.target.value)} /></label>
      <label className="field-label">Trạng thái<select value={params.get('status') ?? ''} onChange={event => update('status', event.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label className="field-label">Loại phiếu<select value={params.get('type') ?? ''} onChange={event => update('type', event.target.value)}><option value="">Tất cả</option><option value="IN">Nhập hàng</option><option value="OUT">Xuất hàng</option></select></label>
    </div>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {!data.loading && !data.error && <>{!data.data?.items.length && <Empty title="Chưa có phiếu phù hợp" />}
      <div className="stock-grid">{data.data?.items.map(row => <article className="stock-card" key={row.id}><h2>{row.movementCode}</h2><Facts items={[["Loại phiếu", row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'], ['Trạng thái', statuses[row.status]], ['Hợp đồng', row.rentalContract.contractCode], ['Khách hàng', row.customer.fullName], ['Lịch dự kiến', dateTime(row.scheduledAt)], ['Nhân viên', row.assignedStaff?.fullName ?? 'Chưa phân công']]} /><Link className="button-secondary" to={`${roleRoot(role)}/${encodeURIComponent(row.id)}`}>Xem phiếu</Link></article>)}</div>
      <Pagination page={page} limit={20} total={data.data?.total ?? 0} onChange={value => update('page', String(value))} />
    </>}
  </section>;
}
function StockCreate({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const { user } = useAuth(), contracts = usePaginatedResource<{ id: string; contractCode: string; status: string }>('/customer/contracts', user?.id);
  const [contract, setContract] = useState(''), [type, setType] = useState<'IN' | 'OUT'>('IN'), [lines, setLines] = useState([freshLine()]), [note, setNote] = useState(''), [schedule, setSchedule] = useState('');
  const items = useApiResource<StoredItem[]>(contract ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contract)}` : null, user?.id, true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
  const patch = (key: string, change: Partial<StockDraftLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...change } : line));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (lock.current) return; setError('');
    try {
      if (!contracts.data?.items.some(row => row.id === contract && row.status === 'ACTIVE')) throw new Error('Chọn hợp đồng ACTIVE của bạn.');
      if (items.loading || items.error) throw new Error('Cần tải thành công danh sách hàng trước khi gửi.');
      const input = stockCreateInput(contract, type, lines, items.data ?? [], schedule, note);
      lock.current = true; setBusy(true); await mutate('/customer/stock-movements', 'POST', input, true); onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không gửi được phiếu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <form className="stock-card stock-form" onSubmit={submit}>
    <h2>Tạo phiếu nhập / xuất hàng</h2><p>Chọn hợp đồng đang hoạt động. Hàng đang lưu chỉ gồm mặt hàng có tồn lớn hơn 0. Lịch dự kiến theo giờ Việt Nam (UTC+7).</p>
    <LoadState loading={contracts.loading} error={contracts.error} retry={contracts.refresh} />
    <fieldset disabled={busy} className="stock-fields">
      <label className="field-label">Hợp đồng<select required value={contract} onChange={event => { setContract(event.target.value); setLines([freshLine()]); }}><option value="">Chọn hợp đồng</option>{contracts.data?.items.filter(row => row.status === 'ACTIVE').map(row => <option key={row.id} value={row.id}>{row.contractCode}</option>)}</select></label>
      {!contracts.loading && !contracts.error && !contracts.data?.items.some(row => row.status === 'ACTIVE') && <p>Chưa có hợp đồng đang hoạt động. Hoàn tất bàn giao kho trước khi gửi phiếu.</p>}
      <label className="field-label">Loại phiếu<select value={type} onChange={event => { setType(event.target.value as 'IN' | 'OUT'); setLines([freshLine()]); }}><option value="IN">Nhập hàng</option><option value="OUT">Xuất hàng</option></select></label>
      <label className="field-label">Lịch dự kiến (tùy chọn)<input type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} /></label>
      <LoadState loading={items.loading} error={items.error} retry={items.refresh} />
      {lines.map((line, index) => <fieldset key={line.key} className="stock-line"><legend>Hàng {index + 1}</legend>
        <label className="field-label">Mặt hàng<select aria-label={`Mặt hàng ${index + 1}`} value={line.storedItemId} required={type === 'OUT'} onChange={event => patch(line.key, { storedItemId: event.target.value })}><option value="">{type === 'IN' ? 'Nhập hàng mới' : 'Chọn hàng đang lưu'}</option>{items.data?.map(item => <option key={item.id} value={item.id}>{item.name} · {item.itemCode} · tồn {item.balance} {item.unit}</option>)}</select></label>
        {type === 'IN' && !line.storedItemId && <><label className="field-label">Tên hàng<input required maxLength={160} value={line.name} onChange={event => patch(line.key, { name: event.target.value })} /></label><label className="field-label">Đơn vị<input required maxLength={40} placeholder="thùng, cái, kiện…" value={line.unit} onChange={event => patch(line.key, { unit: event.target.value })} /></label></>}
        <label className="field-label">Số lượng yêu cầu<input type="number" min={1} max={1000000} step={1} required value={line.quantity} onChange={event => patch(line.key, { quantity: event.target.value })} /></label>
        <label className="field-label">Ghi chú dòng hàng<input maxLength={500} value={line.note} onChange={event => patch(line.key, { note: event.target.value })} /></label>
        <button className="button-secondary" type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Bỏ dòng {index + 1}</button>
      </fieldset>)}
      <button type="button" className="button-secondary" disabled={lines.length >= 100} onClick={() => setLines(current => [...current, freshLine()])}>Thêm dòng hàng</button>
      <label className="field-label">Ghi chú phiếu<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <label><input required type="checkbox" /> Tôi đã đối chiếu hàng hóa và số lượng yêu cầu</label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      <div className="portal-actions"><button className="button-primary" disabled={contracts.loading || Boolean(contracts.error) || !contract || items.loading || Boolean(items.error)}>{busy ? 'Đang gửi…' : 'Gửi phiếu'}</button><button className="button-secondary" type="button" onClick={onClose}>Hủy</button></div>
    </fieldset>
  </form>;
}
function StockDetail({ role, id }: { role: StockRole; id: string }) {
  const { user } = useAuth(), data = useApiResource<StockMovement>(`/${role.toLowerCase()}/stock-movements/${encodeURIComponent(id)}`, user?.id, true);
  return <section className={role === 'CUSTOMER' ? 'customer-page' : ''}><PageHeader title={data.data?.movementCode ?? 'Chi tiết nhập – xuất hàng'}><Link className="button-secondary" to={roleRoot(role)}>Về danh sách</Link><button className="button-secondary" onClick={data.refresh}>Làm mới</button></PageHeader><LoadState loading={data.loading} error={data.error} retry={data.refresh} />{data.data && <StockRecord key={data.data.updatedAt ?? `${data.data.status}:${data.data.assignedStaff?.id}`} row={data.data} role={role} refresh={data.refresh} />}</section>;
}
function StockRecord({ row, role, refresh }: { row: StockMovement; role: StockRole; refresh: () => void }) {
  const { user } = useAuth(), [staff, setStaff] = useState(row.assignedStaff?.id ?? ''), [note, setNote] = useState(''), [quantities, setQuantities] = useState(Object.fromEntries(row.lines.map(line => [line.id, String(line.requestedQty)]))), [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
  const assignable = role === 'MANAGER' && ['REQUESTED', 'ASSIGNED'].includes(row.status), completable = role === 'STAFF' && row.status === 'ASSIGNED' && row.assignedStaff?.id === user?.id;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (lock.current) return; setError(''); try {
    if (!assignable && !completable) throw new Error('Bạn không có quyền thao tác ở trạng thái hiện tại.');
    const body = assignable ? { staffUserId: staff.trim() } : stockCompleteInput(row, quantities, note);
    if (assignable && !staff.trim()) throw new Error('Nhập mã nhân viên STAFF đang hoạt động.');
    lock.current = true; setBusy(true); await mutate(`/${role.toLowerCase()}/stock-movements/${encodeURIComponent(row.id)}/${assignable ? 'assign' : 'complete'}`, assignable ? 'PATCH' : 'POST', body); refresh();
  } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không lưu được phiếu.'); } finally { lock.current = false; setBusy(false); } };
  return <article className="stock-card stock-form"><Facts items={[["Loại phiếu", row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'], ['Trạng thái', statuses[row.status]], ['Khách hàng', `${row.customer.fullName} · ${row.customer.email}`], ['Hợp đồng', `${row.rentalContract.contractCode} · ${label(row.rentalContract.status)}`], ['Lịch dự kiến', dateTime(row.scheduledAt)], ['Nhân viên', row.assignedStaff?.fullName ?? 'Chưa phân công'], ['Người phân công', row.assignedBy?.fullName], ['Ngày phân công', dateTime(row.assignedAt)], ['Ngày hoàn tất', dateTime(row.completedAt)], ['Người hoàn tất', row.completedBy?.fullName], ['Ghi chú phiếu', row.note], ['Ghi chú hoàn tất', row.completionNote]]} />
    <form onSubmit={submit}><fieldset disabled={busy} className="stock-fields"><h2>Đối chiếu hàng hóa</h2>{row.lines.map(line => <div className="stock-line" key={line.id}><h3>{line.storedItem.name}</h3><p>{line.storedItem.itemCode} · Đơn vị: {line.storedItem.unit}</p><p>Yêu cầu: {line.requestedQty} · Thực tế: {line.actualQty ?? 'Chưa kiểm đếm'} · Tồn hiện tại: {line.storedItem.balance}</p>{line.note && <p>{line.note}</p>}{completable && <label className="field-label">Số lượng thực tế · {line.storedItem.name}<input required type="number" min={1} max={row.type === 'OUT' ? Math.min(1000000, line.storedItem.balance) : 1000000} step={1} value={quantities[line.id]} onChange={event => setQuantities(current => ({ ...current, [line.id]: event.target.value }))} /></label>}</div>)}
      {assignable && <><h2>Phân công nhân viên</h2><p>BE chưa cung cấp danh bạ Staff cho Manager. Lấy mã tài khoản STAFF đang hoạt động từ Admin → Quản lý tài khoản; không dùng email thay mã.</p><label className="field-label">Mã tài khoản Staff<input required maxLength={200} value={staff} onChange={event => setStaff(event.target.value)} /></label></>}
      {completable && <><label className="field-label">Ghi chú kiểm đếm<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label><p>Hoàn tất sẽ {row.type === 'IN' ? 'tăng' : 'giảm'} tồn theo số lượng thực tế, có thể khác số lượng yêu cầu.</p></>}
      {(assignable || completable) && <><label><input type="checkbox" required /> {assignable ? 'Tôi xác nhận nhân viên được giao' : 'Tôi đã kiểm đếm và thực hiện giao nhận hàng thực tế'}</label>{error && <p role="alert" className="booking-alert is-error">{error}</p>}<button className="button-primary">{busy ? 'Đang lưu…' : assignable ? 'Lưu phân công' : 'Hoàn tất phiếu'}</button></>}
    </fieldset></form>
  </article>;
}
export function StoredItemsPage() {
  const { user } = useAuth(), data = useApiResource<StoredItem[]>('/customer/stored-items', user?.id, true);
  const [search, setSearch] = useState('');
  const items = data.data?.filter(item => `${item.name} ${item.itemCode} ${item.rentalContract?.contractCode}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))) ?? [];
  return <section className="customer-page"><PageHeader title="Hàng đang lưu" description="Tồn đã được Staff xác nhận; phiếu chờ xử lý chưa làm thay đổi số lượng."><Link className="button-secondary" to="/customer/stock-movements">Phiếu nhập – xuất</Link><button className="button-secondary" onClick={data.refresh}>Làm mới</button></PageHeader><label className="field-label">Tìm hàng / hợp đồng<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><LoadState loading={data.loading} error={data.error} retry={data.refresh} />{!data.loading && !data.error && <>{!items.length && <Empty title="Chưa có hàng tồn phù hợp" />}<div className="stock-grid">{items.map(item => <article className="stock-card" key={item.id}><h2>{item.name}</h2><p>{item.itemCode}</p><p>Hợp đồng: {item.rentalContract?.contractCode}</p><strong>Tồn: {item.balance} {item.unit}</strong>{item.note && <p>{item.note}</p>}</article>)}</div></>}</section>;
}

