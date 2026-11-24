import { useListPagination } from '../../components/workspace/useListPagination';
import { servicePriceBasis } from '../../utils/service-units';
import { managerStorageLabels } from '../../utils/manager-sections';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { operationPath } from '../../auth/portal-routing';
import { Empty, LoadState, Modal, PageHeader, RecordFactsDialog, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DetailRow } from '../../components/workspace/DetailRow';
import { TableSkeleton } from '../../components/LoadingSkeleton';
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
  const [selected, setSelected] = useState<AdditionalService>();
  const [notice, setNotice] = useState('');
  const refresh = () => { resource.refresh(); inventory.refresh(); };
  const { items, pagination } = useListPagination(resource.data ?? []);
  return <section><Link className="booking-back" to={operationPath(user?.role, '/manager/catalog')}>{managerStorageLabels.catalog.title}</Link>
    <PageHeader title="Dịch vụ tại cơ sở"><button className="button-secondary" disabled={resource.loading} onClick={refresh}>Làm mới</button><button className="button-primary" onClick={() => setActive('new')}>Thêm dịch vụ từ danh mục</button></PageHeader>
    {notice && <div className="portal-success" role="status">{notice}</div>}
    <RefreshStatus active={resource.refreshing || inventory.refreshing} />
    <LoadState loading={resource.loading} error={resource.error || inventory.error} retry={refresh}
      placeholder={<TableSkeleton columns={['service', 'type', 'price', 'status', 'stock', 'actions']} />} />
    {resource.data && !resource.data.length && <Empty title="Chưa có dịch vụ bổ sung" />}
    {resource.data && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Dịch vụ</th><th>Loại</th><th>Giá</th><th>Trạng thái</th><th>Tồn kho / Công suất</th><th>Thao tác</th></tr></thead><tbody>{items.map(item => {
      const state = inventory.data?.find(entry => entry.serviceId === item.id && entry.facilityId===item.facilityId);
      return <DetailRow key={item.id+item.facilityId} detail={{ open: () => setSelected(item), label: `Xem dịch vụ ${item.name}` }}>
        <td><strong>{item.name}</strong><small>{item.code}</small></td>
        <td>{item.kind === 'PURCHASE' ? 'Mua' : 'Thuê'} / {item.billingUnit === 'ONE_TIME' ? 'Một lần' : item.billingUnit === 'DAY' ? 'Ngày' : 'Tháng'}</td>
        <td>{money(item.unitPrice)}<small>{servicePriceBasis(item)}</small></td>
        <td><Status value={item.isActive ? 'ACTIVE' : 'DISABLED'} text={item.isActive ? 'Đang hoạt động' : 'Đã tắt'} /></td>
        <td>{state ? item.kind === 'PURCHASE' ? `${state.stockOnHand} (đã giữ ${state.reservedQuantity}, còn ${state.availableQuantity})` : state.rentalCapacity : 'Chưa tải được'}</td>
        <td><div className="manager-inline-actions"><button className="button-secondary" onClick={() => setActive(item)}>Chỉnh sửa</button><button className="button-secondary" disabled={!state} onClick={() => setStock(item)}>Cập nhật tồn kho</button></div></td>
      </DetailRow>;
    })}</tbody></table></div>}
    {pagination}
    {selected && <RecordFactsDialog title={selected.name} onClose={() => setSelected(undefined)} items={[
      ['Mã dịch vụ', selected.code],
      ['Loại dịch vụ', selected.kind === 'PURCHASE' ? 'Mua' : 'Thuê'],
      ['Đơn giá', `${money(selected.unitPrice)} · ${servicePriceBasis(selected)}`],
      ['Trạng thái', selected.isActive ? 'Đang hoạt động' : 'Đã tắt'],
      ['Mô tả', selected.description],
    ]} />}
    {active && <ServiceForm key={active === 'new' ? 'new' : active.id} item={active === 'new' ? null : active} onClose={() => setActive(null)} onSuccess={() => { setActive(null); setNotice('Đã lưu dịch vụ. Báo giá lịch sử được giữ nguyên.'); refresh(); }} />}
    {stock && <InventoryForm key={stock.id} item={stock} state={inventory.data?.find(item => item.serviceId === stock.id && item.facilityId===stock.facilityId)} onClose={() => setStock(null)} onSuccess={() => { setStock(null); setNotice('Đã cập nhật tồn kho qua hệ thống.'); refresh(); }} />}
  </section>;
}

function ServiceForm({ item, onClose, onSuccess }: { item: AdditionalService | null; onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const facilities = useApiResource<{ facilities: Array<{ id: string; name: string }> }>(item ? null : '/manager/storage-types', user?.id);
  const choices = facilities.data?.facilities ?? [];
  const catalog=useApiResource<AdditionalService[]>(item?null:'/manager/additional-services/catalog',user?.id);
  const [catalogId,setCatalogId]=useState('');
  const catalogItem=catalog.data?.find(row=>row.id===catalogId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (lock.current) return;
    const data = new FormData(event.currentTarget);
    const fieldText = (name: string) => { const value = data.get(name); return typeof value === 'string' ? value.trim() : ''; };
    lock.current = true; setBusy(true); setError('');
    try {
      const target=item??catalogItem;
      if (!target) throw new Error('Chọn dịch vụ trong danh mục chung.');
      await mutate(`/manager/additional-services/${encodeURIComponent(target.id)}${item?'':'/offerings'}`,item?'PATCH':'POST',
        {facilityId:item?.facilityId??fieldText('facilityId'),unitPrice:Number(data.get('unitPrice')),isActive:data.get('isActive')==='on'});
      onSuccess();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không lưu được dịch vụ.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={item ? 'Chỉnh sửa dịch vụ' : 'Thêm dịch vụ từ danh mục'} onClose={onClose} busy={busy}><form className="portal-form" onSubmit={submit}>
    {error && <div className="booking-alert is-error" role="alert">{error}</div>}
    {!item && <LoadState loading={facilities.loading} error={facilities.error} retry={facilities.refresh} />}
    <fieldset disabled={busy || (!item && (!facilities.data || choices.length === 0))}>
      {!item && facilities.data && <label className="field-label">Cơ sở<select name="facilityId" required defaultValue={choices.length === 1 ? choices[0].id : ''}><option value="">Chọn cơ sở được cấp quyền</option>{choices.map(facility => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select>{choices.length === 0 && <small>Chưa có quyền tại cơ sở. Liên hệ quản trị viên để được cấp quyền.</small>}</label>}
      {!item && <><LoadState loading={catalog.loading} error={catalog.error} retry={catalog.refresh}/><label className="field-label">Danh mục chung<select required value={catalogId} onChange={event=>setCatalogId(event.target.value)}><option value="">Chọn dịch vụ có sẵn</option>{catalog.data?.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></>}
      {catalogItem&&<p>{catalogItem.name} · {catalogItem.code}. Giá và tồn chỉ áp dụng tại cơ sở đã chọn.</p>}
      <label className="field-label">Giá đã duyệt (VND)<input name="unitPrice" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required defaultValue={item?.unitPrice ?? ''} /></label>
      <label className="portal-checkbox"><input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} />Đang hoạt động</label>
      <button type="submit" className="button-primary" disabled={busy || (!item && !catalogItem)}>{busy ? 'Đang lưu…' : 'Lưu dịch vụ'}</button>
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
    try { await mutate(`/manager/additional-services/${encodeURIComponent(item.id)}/inventory`, 'PATCH', purchase ? { facilityId:item.facilityId, stockOnHand: value } : { facilityId:item.facilityId,rentalCapacity: value }); onSuccess(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không cập nhật được tồn kho.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={`Tồn kho ${item.name}`} onClose={onClose} busy={busy}><form className="portal-form" onSubmit={submit}>{error && <div className="booking-alert is-error" role="alert">{error}</div>}<fieldset disabled={busy}><label className="field-label">{purchase ? 'Tồn kho thực tế' : 'Công suất cho thuê'}<input name="quantity" type="number" required min={0} max={Number.MAX_SAFE_INTEGER} step={1} defaultValue={purchase ? state?.stockOnHand : state?.rentalCapacity} /></label><p>Đơn vị: {item.physicalUnit ?? 'chưa thiết lập'}. Không chuyển đổi số lượng khi đổi nhãn đơn vị. Hệ thống kiểm tra số lượng đã giữ trước khi lưu.</p><button type="submit" className="button-primary">{busy ? 'Đang lưu…' : 'Lưu tồn kho'}</button></fieldset></form></Modal>;
}
