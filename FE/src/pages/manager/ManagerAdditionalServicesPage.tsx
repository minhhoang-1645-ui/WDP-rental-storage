import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { operationPath } from '../../auth/portal-routing';
import { Empty, LoadState, Modal, PageHeader } from '../../components/manager/PortalUi';
import { money } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import type { AdditionalService, ServiceInventory } from '../../types/additional-service';

export function ManagerAdditionalServicesPage() {
  const { user } = useAuth();
  const resource = useApiResource<AdditionalService[]>('/manager/additional-services', user?.id);
  const inventory = useApiResource<ServiceInventory[]>('/manager/additional-services/inventory', user?.id);
  const [active, setActive] = useState<AdditionalService | 'new' | null>(null);
  const [stock, setStock] = useState<AdditionalService | null>(null);
  const [notice, setNotice] = useState('');
  const refresh = () => { resource.refresh(); inventory.refresh(); };
  return <section><Link className="booking-back" to={operationPath(user?.role, '/manager/catalog')}>Loại kho & bảng giá</Link>
    <PageHeader title="Dịch vụ bổ sung" description="Danh mục, giá và tồn kho được lưu qua hệ thống WDP."><button className="button-secondary" disabled={resource.loading} onClick={refresh}>Làm mới</button><button className="button-primary" onClick={() => setActive('new')}>Tạo dịch vụ</button></PageHeader>
    {notice && <div className="portal-success" role="status">{notice}</div>}
    <LoadState loading={resource.loading || inventory.loading} error={resource.error || inventory.error} retry={refresh} />
    {resource.data && !resource.data.length && <Empty title="Chưa có dịch vụ bổ sung" />}
    {resource.data && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Dịch vụ</th><th>Loại</th><th>Giá</th><th>Trạng thái</th><th>Tồn kho / Công suất</th><th>Thao tác</th></tr></thead><tbody>{resource.data.map(item => {
      const state = inventory.data?.find(entry => entry.serviceId === item.id);
      return <tr key={item.id}><td>{item.name}<small>{item.code}</small></td><td>{item.kind === 'PURCHASE' ? 'Mua' : 'Thuê'} / {item.billingUnit === 'ONE_TIME' ? 'Một lần' : item.billingUnit === 'DAY' ? 'Ngày' : 'Tháng'}</td><td>{money(item.unitPrice)}</td><td>{item.isActive ? 'Đang hoạt động' : 'Đã tắt'}</td><td>{state ? item.kind === 'PURCHASE' ? `${state.stockOnHand} (đã giữ ${state.reservedQuantity}, còn ${state.availableQuantity})` : state.rentalCapacity : 'Chưa tải được'}</td><td><button className="button-secondary" onClick={() => setActive(item)}>Chỉnh sửa</button><button className="button-secondary" disabled={!state} onClick={() => setStock(item)}>Cập nhật tồn kho</button></td></tr>;
    })}</tbody></table></div>}
    {active && <ServiceForm key={active === 'new' ? 'new' : active.id} item={active === 'new' ? null : active} onClose={() => setActive(null)} onSuccess={() => { setActive(null); setNotice('Đã lưu dịch vụ. Báo giá lịch sử được giữ nguyên.'); refresh(); }} />}
    {stock && <InventoryForm key={stock.id} item={stock} state={inventory.data?.find(item => item.serviceId === stock.id)} onClose={() => setStock(null)} onSuccess={() => { setStock(null); setNotice('Đã cập nhật tồn kho qua hệ thống.'); refresh(); }} />}
  </section>;
}

function ServiceForm({ item, onClose, onSuccess }: { item: AdditionalService | null; onClose: () => void; onSuccess: () => void }) {
  const [kind, setKind] = useState(item?.kind ?? 'PURCHASE');
  const [billingUnit, setBillingUnit] = useState(item?.billingUnit ?? 'ONE_TIME');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (lock.current) return;
    const data = new FormData(event.currentTarget);
    lock.current = true; setBusy(true); setError('');
    try {
      await mutate(`/manager/additional-services${item ? '/' + encodeURIComponent(item.id) : ''}`, item ? 'PATCH' : 'POST', { code: String(data.get('code')).trim(), name: String(data.get('name')).trim(), description: String(data.get('description')).trim() || null, kind, billingUnit, unitPrice: Number(data.get('unitPrice')), isActive: data.has('isActive') });
      onSuccess();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không lưu được dịch vụ.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={item ? 'Chỉnh sửa dịch vụ' : 'Tạo dịch vụ'} onClose={onClose} busy={busy}><form className="portal-form" onSubmit={submit}>
    {error && <div className="booking-alert is-error" role="alert">{error}</div>}<fieldset disabled={busy}>
      <label className="field-label">Mã dịch vụ<input name="code" required minLength={2} maxLength={50} pattern="[A-Za-z0-9_]{2,50}" defaultValue={item?.code} /></label>
      <label className="field-label">Tên dịch vụ<input name="name" required minLength={2} maxLength={120} defaultValue={item?.name} /></label>
      <label className="field-label">Mô tả<textarea name="description" maxLength={1000} defaultValue={item?.description ?? ''} /></label>
      <label className="field-label">Loại<select value={kind} disabled={Boolean(item)} onChange={event => { const value = event.target.value as AdditionalService['kind']; setKind(value); setBillingUnit(value === 'PURCHASE' ? 'ONE_TIME' : 'DAY'); }}><option value="PURCHASE">Mua</option><option value="RENTAL">Thuê</option></select></label>
      <label className="field-label">Đơn vị tính<select value={billingUnit} onChange={event => setBillingUnit(event.target.value as AdditionalService['billingUnit'])}>{kind === 'PURCHASE' ? <option value="ONE_TIME">Một lần</option> : <><option value="DAY">Ngày</option><option value="MONTH">Tháng</option></>}</select></label>
      <label className="field-label">Giá đã duyệt (VND)<input name="unitPrice" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required defaultValue={item?.unitPrice ?? ''} /></label>
      <label className="portal-checkbox"><input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} />Đang hoạt động</label>
      <button type="submit" className="button-primary">{busy ? 'Đang lưu…' : 'Lưu dịch vụ'}</button>
    </fieldset>
  </form></Modal>;
}

function InventoryForm({ item, state, onClose, onSuccess }: { item: AdditionalService; state?: ServiceInventory; onClose: () => void; onSuccess: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const purchase = item.kind === 'PURCHASE';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (lock.current) return;
    const value = Number(new FormData(event.currentTarget).get('quantity'));
    lock.current = true; setBusy(true); setError('');
    try { await mutate(`/manager/additional-services/${encodeURIComponent(item.id)}/inventory`, 'PATCH', purchase ? { stockOnHand: value } : { rentalCapacity: value }); onSuccess(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không cập nhật được tồn kho.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={`Tồn kho ${item.name}`} onClose={onClose} busy={busy}><form className="portal-form" onSubmit={submit}>{error && <div className="booking-alert is-error" role="alert">{error}</div>}<fieldset disabled={busy}><label className="field-label">{purchase ? 'Tồn kho thực tế' : 'Công suất cho thuê'}<input name="quantity" type="number" required min={0} max={Number.MAX_SAFE_INTEGER} step={1} defaultValue={purchase ? state?.stockOnHand : state?.rentalCapacity} /></label><p>Hệ thống kiểm tra các số lượng đã giữ trước khi lưu.</p><button type="submit" className="button-primary">{busy ? 'Đang lưu…' : 'Lưu tồn kho'}</button></fieldset></form></Modal>;
}
