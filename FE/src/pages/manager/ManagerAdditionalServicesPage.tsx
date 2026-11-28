import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Empty, LoadState, Modal, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DetailRow } from '../../components/workspace/DetailRow';
import { useListPagination } from '../../components/workspace/useListPagination';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import type { AdditionalService, ServiceDefinition, ServiceInventory } from '../../types/additional-service';
import { normalizeSearch } from '../../utils/notification-tools';
import './manager-additional-services.css';

const endpoint = '/manager/additional-services';
const capacityLimit = 2_147_483_647;
const categories = { PURCHASE: 'Sản phẩm tiêu hao', RENTAL: 'Thiết bị cho thuê' };
const billing = { ONE_TIME: 'Mua một lần', DAY: 'Theo ngày', MONTH: 'Theo tháng' };
const statuses = {
  active: ['ACTIVE', 'Đang cung cấp'],
  local: ['NEUTRAL', 'Ngừng cung cấp'],
  global: ['NEUTRAL', 'Tắt toàn hệ thống'],
  review: ['PENDING', 'Cần cập nhật cấu hình'],
  soldOut: ['PENDING', 'Hết hàng'],
  noEquipment: ['PENDING', 'Hết thiết bị khả dụng'],
  incomplete: ['PENDING', 'Chưa đủ cấu hình'],
} as const;

function statusOf(item: AdditionalService, inventory?: ServiceInventory): keyof typeof statuses {
  if (item.configurationReview) return 'review';
  if (item.globalIsActive === false) return 'global';
  if (!(item.localIsActive ?? item.isActive)) return 'local';
  if (!item.unitPrice || (item.kind === 'PURCHASE' ? item.stockOnHand === null : item.rentalCapacity === null)) return 'incomplete';
  if (item.kind === 'PURCHASE' && inventory?.availableQuantity === 0) return 'soldOut';
  if (item.kind === 'RENTAL' && inventory?.rentalCapacity === 0) return 'noEquipment';
  return 'active';
}

const number = (value: number) => value.toLocaleString('vi-VN');
const quantity = (value?: number | null, unit?: string | null) => value == null ? 'Chưa thiết lập' : [number(value), unit].filter(Boolean).join(' ');
const basis = (item: Pick<AdditionalService, 'billingUnit' | 'physicalUnit'>) => ['đ', item.physicalUnit, item.billingUnit === 'ONE_TIME' ? null : item.billingUnit === 'DAY' ? 'ngày' : 'tháng'].filter(Boolean).join('/');
const price = (item: AdditionalService) => item.unitPrice == null ? 'Chưa thiết lập' : number(item.unitPrice) + basis(item.configurationReview?.before ?? item);
const updateTitle = (item: AdditionalService) => item.kind === 'PURCHASE' ? 'Cập nhật tồn kho' : 'Cập nhật số lượng thiết bị';
const recordPath = (item: AdditionalService) => endpoint + '/' + encodeURIComponent(item.id);
const validQuantity = (value: string) => /^\d+$/.test(value) && Number(value) <= capacityLimit;
type Dialog = { mode: 'add' } | { mode: 'detail' | 'edit' | 'quantity'; item: AdditionalService };

export function ManagerAdditionalServicesPage() {
  const { user } = useAuth();
  const facilityId = useOutletContext<string>();
  const identity = user?.id + ':' + facilityId;
  const resource = useApiResource<AdditionalService[]>(facilityId ? endpoint : null, identity, true);
  const inventory = useApiResource<ServiceInventory[]>(facilityId ? endpoint + '/inventory' : null, identity, true);
  const [dialog, setDialog] = useState<Dialog>();
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [params] = useSearchParams();
  const targetFacility = params.get('facilityId');
  const targetItem = params.get('offering');
  const opened = useRef('');
  const scoped = resource.data?.filter(row => row.facilityId === facilityId) ?? [];
  const quantities = new Map(inventory.data?.filter(row => row.facilityId === facilityId).map(row => [row.serviceId, row]));
  useEffect(() => {
    if (!targetFacility || !targetItem) {
      opened.current = '';
      return;
    }
    if (targetFacility !== facilityId) return;
    const key = targetFacility + ':' + targetItem;
    const item = resource.data?.find(row => row.id === targetItem && row.facilityId === facilityId);
    if (item && opened.current !== key) {
      opened.current = key;
      setDialog({ mode: item.configurationReview ? 'edit' : 'detail', item });
    }
  }, [facilityId, resource.data, targetFacility, targetItem]);
  const visible = scoped.filter(item =>
    normalizeSearch(item.name + ' ' + item.code).includes(normalizeSearch(query)) &&
    (!category || item.kind === category) &&
    (!status || statusOf(item, quantities.get(item.id)) === status));
  const { items, pagination, reset } = useListPagination(visible);
  const refresh = () => { resource.refresh(); inventory.refresh(); };
  const close = () => setDialog(undefined);
  const saved = (message: string) => { close(); setNotice(message); refresh(); };
  const loading = resource.loading || inventory.loading;
  const error = resource.error || inventory.error;
  const activeItem = dialog && dialog.mode !== 'add' ? dialog.item : undefined;
  const activeQuantity = activeItem && quantities.get(activeItem.id);

  return <section className="facility-services">
    <PageHeader title="Dịch vụ tại cơ sở" description="Quản lý sản phẩm và dịch vụ bổ trợ được cung cấp tại cơ sở.">
      <button className="button-primary" disabled={!resource.data || !!resource.error} onClick={() => setDialog({ mode: 'add' })}>Thêm từ danh mục</button>
    </PageHeader>
    {notice && <div className="portal-success" role="status">{notice}</div>}
    <RefreshStatus active={resource.refreshing || inventory.refreshing} />
    <LoadState loading={loading} error={error} retry={refresh} placeholder={<TableSkeleton columns={['service', 'type', 'price', 'stock', 'sales', 'status']} />} />
    {resource.data && !loading && <div className="facility-services-filters">
      <label>Tìm sản phẩm / dịch vụ<input type="search" placeholder="Nhập tên hoặc mã" value={query} onChange={event => { setQuery(event.target.value); reset(); }} /></label>
      <label>Phân loại<select value={category} onChange={event => { setCategory(event.target.value); reset(); }}>
        <option value="">Tất cả phân loại</option>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); reset(); }}>
        <option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([key, [, label]]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>}
    {!error && !loading && resource.data && !visible.length && <Empty title={scoped.length ? 'Không tìm thấy sản phẩm hoặc dịch vụ phù hợp' : 'Chưa có sản phẩm hoặc dịch vụ tại cơ sở'} />}
    {!!items.length && !loading && <div className="manager-table-wrap">
      <table className="manager-table"><thead><tr>{['Sản phẩm / Dịch vụ', 'Phân loại', 'Giá', 'Số lượng còn lại', 'Đã bán / Đã thuê', 'Trạng thái'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map(item => {
        const state = quantities.get(item.id);
        const key = statusOf(item, state);
        return <DetailRow key={item.id} detail={{ open: () => setDialog({ mode: 'detail', item }), label: 'Xem ' + item.name }}>
          <td><strong>{item.name}</strong><small>{item.code}</small></td>
          <td>{categories[item.kind]}</td>
          <td>{price(item)}</td>
          <td><QuantityCell item={item} state={state} /></td>
          <td>{inventoryDefinition(item).kind === 'PURCHASE' ? soldQuantity(state) : state?.completedRentalCount == null ? '—' :
            <>{number(state.completedRentalCount)}<small title="Số dòng thuê đã xác nhận, có bàn giao kho và đã hết kỳ thuê thiết bị.">Lượt thuê hết kỳ</small></>}</td>
          <td><Status value={statuses[key][0]} text={statuses[key][1]} /></td>
        </DetailRow>;
      })}</tbody></table>
    </div>}
    {!loading && pagination}
    {dialog?.mode === 'detail' && <OfferingDetail item={dialog.item} state={activeQuantity} onClose={close}
      onEdit={() => setDialog({ ...dialog, mode: 'edit' })} onQuantity={() => setDialog({ ...dialog, mode: 'quantity' })} />}
    {(dialog?.mode === 'add' || dialog?.mode === 'edit') &&
      <ServiceForm key={dialog.mode} item={activeItem} configured={scoped} facilityId={facilityId} identity={identity}
        onClose={close} onSuccess={() => saved('Đã lưu cấu hình tại cơ sở.')} />}
    {dialog?.mode === 'quantity' && activeQuantity && <InventoryForm item={dialog.item} state={activeQuantity} onClose={close}
      onSuccess={() => saved('Đã lưu số lượng tại cơ sở.')} />}
  </section>;
}

function previousQuantity(item: AdditionalService) {
  const previous = item.configurationReview?.before;
  return quantity(previous?.kind === 'PURCHASE' ? item.stockOnHand : item.rentalCapacity, previous?.physicalUnit);
}

function inventoryDefinition(item: AdditionalService) {
  return item.configurationReview?.before ?? item;
}

function QuantityCell({ item, state }: { item: AdditionalService; state?: ServiceInventory }) {
  const definition = inventoryDefinition(item);
  const purchase = definition.kind === 'PURCHASE';
  const amount = purchase ? state?.availableQuantity : state?.rentalCapacity ?? item.rentalCapacity;
  return <>{amount == null ? '—' : quantity(amount, definition.physicalUnit)}
    {!purchase && <small>Tổng số thiết bị</small>}
    {item.configurationReview && <small>Theo cấu hình trước</small>}</>;
}

function soldQuantity(state?: ServiceInventory) {
  if (!state?.soldByUnit) return '—';
  if (!state.soldByUnit.length) return '0';
  return state.soldByUnit.map(entry => quantity(entry.quantity, entry.unit ?? '(chưa rõ đơn vị)')).join(' · ');
}

function Facts({ values }: { values: [string, string | undefined | null][] }) {
  return <dl className="facility-services-facts">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
}

function SharedFacts({ item }: { item: AdditionalService }) {
  return <Facts values={[
    ['Phân loại', categories[item.kind]], ['Hình thức tính phí', billing[item.billingUnit]], ['Đơn vị tính', item.physicalUnit],
    ['Thuê tối thiểu', item.billingUnit === 'MONTH' ? `${item.minimumRentalMonths ?? 1} tháng` : null],
  ]} />;
}

function ItemSubtitle({ item, showName = true }: { item: AdditionalService; showName?: boolean }) {
  return <p className="facility-services-subtitle">{showName && <strong>{item.name}</strong>}<span>{item.code}</span></p>;
}

function QuantityValue({ value, unit }: { value?: number | null; unit?: string | null }) {
  return <><strong>{value == null ? '—' : number(value)}</strong>{value != null && unit && <small>{unit}</small>}</>;
}

function QuantityFacts({ item, state, variant }: { item: AdditionalService; state?: ServiceInventory; variant: 'detail' | 'update' }) {
  const definition = inventoryDefinition(item);
  const purchase = definition.kind === 'PURCHASE';
  const availableLabel = 'Số lượng còn lại';
  const cards = purchase ? [
    [variant === 'detail' ? 'Tồn kho thực tế' : 'Tồn kho', state?.stockOnHand ?? item.stockOnHand],
    ...(variant === 'detail'
      ? [[availableLabel, state?.availableQuantity], ['Đã giữ hàng', state?.reservedQuantity]] as const
      : [['Đã giữ hàng', state?.reservedQuantity], [availableLabel, state?.availableQuantity]] as const),
  ] as const : [
    ['Tổng số thiết bị', state?.rentalCapacity ?? item.rentalCapacity],
    ['Đã đặt đồng thời tối đa từ hôm nay', state?.peakCommittedQuantity],
  ] as const;
  return <>
    <dl className={'facility-services-metrics ' + (variant === 'detail' ? 'is-detail' : 'is-update')}>
      {cards.map(([label, value]) => <div key={label}><dt>{label}</dt>
        <dd><QuantityValue value={value} unit={definition.physicalUnit} /></dd></div>)}
      {purchase && variant === 'detail' && <div><dt>Đã bán</dt><dd aria-label={soldQuantity(state)}>
        {state?.soldByUnit?.length ? state?.soldByUnit.map(entry =>
          <span key={entry.unit ?? ''}><QuantityValue value={entry.quantity} unit={entry.unit ?? 'chưa rõ đơn vị'} /></span>) :
          <QuantityValue value={state?.soldByUnit ? 0 : null} />}
      </dd></div>}
    </dl>
    {!purchase && <small>Số lượng khả dụng phụ thuộc vào kỳ thuê.</small>}
  </>;
}

function Review({ item }: { item: AdditionalService }) {
  const review = item.configurationReview;
  if (!review) return null;
  const fields: [keyof ServiceDefinition, string, (value: string | null) => string][] = [
    ['kind', 'Phân loại', value => categories[value as keyof typeof categories]],
    ['billingUnit', 'Hình thức tính phí', value => billing[value as keyof typeof billing]],
    ['physicalUnit', 'Đơn vị tính', value => value ?? 'Chưa thiết lập'],
  ];
  return <section className="booking-alert is-warning facility-services-review">
    <strong>Cần cập nhật cấu hình</strong>
    <p>Thông tin danh mục chung đã được cập nhật. Vui lòng kiểm tra lại giá và số lượng trước khi tiếp tục cung cấp.</p>
    <Facts values={fields.filter(([field]) => review.before[field] !== review.after[field])
      .map(([field, label, format]) => [label, format(review.before[field]) + ' → ' + format(review.after[field])])} />
    <p>Giá hiện tại · {price(item)}<br />Số lượng theo cấu hình trước · {previousQuantity(item)}</p>
  </section>;
}

function OfferingDetail({ item, state, onClose, onEdit, onQuantity }: {
  item: AdditionalService; state?: ServiceInventory; onClose: () => void; onEdit: () => void; onQuantity: () => void;
}) {
  const key = statusOf(item, state);
  return <Modal title={item.name} subtitle={<ItemSubtitle item={item} showName={false} />} focusTitle titleBadge={<Status value={statuses[key][0]} text={statuses[key][1]} />} className="facility-services-dialog is-refined" onClose={onClose}
    footer={<><button className="button-secondary" onClick={onClose}>Đóng</button>
      <button className="button-secondary" disabled={!state || !!item.configurationReview} onClick={onQuantity}>{updateTitle(item)}</button>
      <button className="button-primary" onClick={onEdit}>Chỉnh sửa</button></>}>
    <div className="facility-services-body">
      <div className="facility-services-price"><span>{inventoryDefinition(item).kind === 'PURCHASE' ? 'Giá bán' : 'Giá thuê'}</span><strong>{price(item)}</strong></div>
      <SharedFacts item={item} />
      {item.description && <Facts values={[[ 'Mô tả', item.description ]]} />}
      <section className="facility-services-section">
        <h3>{inventoryDefinition(item).kind === 'PURCHASE' ? 'Tồn kho và bán hàng' : 'Thiết bị cho thuê'}</h3>
        {item.configurationReview && <small>Số lượng theo cấu hình trước.</small>}
        <QuantityFacts item={item} state={state} variant="detail" />
      </section>
      {item.configurationReview && <Review item={item} />}
    </div>
  </Modal>;
}

function SaveFooter({ form, busy, disabled = false, onClose, label }: {
  form: string; busy: boolean; disabled?: boolean; onClose: () => void; label: string;
}) {
  return <><button className="button-secondary" type="button" onClick={onClose} disabled={busy}>Hủy</button>
    <button className="button-primary" type="submit" form={form} disabled={busy || disabled}>{busy ? 'Đang lưu…' : label}</button></>;
}

function parsePrice(value: string) {
  const clean = value.trim();
  const amount = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(clean) ? Number(clean.replaceAll('.', '')) : NaN;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function ServiceForm({ item, configured, facilityId, identity, onClose, onSuccess }: {
  item?: AdditionalService; configured: AdditionalService[]; facilityId: string; identity: string; onClose: () => void; onSuccess: () => void;
}) {
  const catalog = useApiResource<AdditionalService[]>(item ? null : endpoint + '/catalog', identity);
  const [catalogId, setCatalogId] = useState('');
  const initiallyEnabled = item?.localIsActive ?? item?.isActive ?? true;
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [priceDraft, setPriceDraft] = useState(item?.unitPrice == null ? '' : number(item.unitPrice));
  const [priceTouched, setPriceTouched] = useState(false);
  const [reviewQuantity, setReviewQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const form = useId();
  const configuredIds = new Set(configured.map(row => row.id));
  const choices = catalog.data?.filter(row => row.isActive && !configuredIds.has(row.id)) ?? [];
  const target = item ?? choices.find(row => row.id === catalogId);
  const review = item?.configurationReview;
  const cannotEnable = item?.globalIsActive === false && !item.localIsActive;
  const amount = parsePrice(priceDraft);
  const unchanged = Boolean(item && !review && amount === item.unitPrice && enabled === initiallyEnabled);
  const cannotSaveEdit = Boolean(item && (amount === null || unchanged || (review && !validQuantity(reviewQuantity))));
  const activationHelp = target?.kind === 'PURCHASE'
    ? enabled ? 'Cho phép khách hàng mua sản phẩm.' : 'Tạm ngừng bán cho khách hàng.'
    : enabled ? 'Cho phép khách hàng thuê thiết bị.' : 'Tạm ngừng cho khách hàng thuê thiết bị.';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || cannotSaveEdit || !target || !facilityId || (item && item.facilityId !== facilityId)) return;
    const values = new FormData(event.currentTarget);
    const newQuantity = String(values.get('quantity') ?? '');
    if ((!item || review) && !validQuantity(newQuantity)) {
      setError('Nhập số lượng nguyên không âm.'); return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(recordPath(target) + (item ? '' : '/offerings'), item ? 'PATCH' : 'POST', {
        facilityId, unitPrice: item ? amount : Number(values.get('unitPrice')), isActive: enabled,
        ...(review ? { reviewRevision: review.revision } : {}),
        ...(!item || review ? { [target.kind === 'PURCHASE' ? 'stockOnHand' : 'rentalCapacity']: Number(newQuantity) } : {}),
      }, false, !item && target.updatedAt ? { 'X-Catalog-Updated-At': target.updatedAt } : undefined);
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được dịch vụ.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <Modal title={item ? 'Chỉnh sửa dịch vụ' : 'Thêm sản phẩm / dịch vụ'} subtitle={item && <ItemSubtitle item={item} />} focusTitle={!!item} onClose={onClose} busy={busy} className={item ? "facility-services-dialog is-refined" : "facility-services-dialog"}
    footer={<SaveFooter form={form} busy={busy} disabled={!target || cannotSaveEdit} onClose={onClose} label={review ? 'Lưu và xác nhận cấu hình' : item ? 'Lưu thay đổi' : 'Lưu dịch vụ'} />}>
    <form id={form} className="portal-form facility-services-body" onSubmit={submit}>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      {!item && <LoadState loading={catalog.loading} error={catalog.error} retry={catalog.refresh} />}
      <fieldset disabled={busy}>
        {!item && catalog.data && (choices.length ?
          <label className="field-label">Danh mục bổ trợ<select required value={catalogId} onChange={event => setCatalogId(event.target.value)}>
            <option value="">Chọn sản phẩm hoặc dịch vụ</option>{choices.map(row => <option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}
          </select></label> : <p>Danh mục chưa có mục mới đủ điều kiện để thêm tại cơ sở.</p>)}
        {target && <div className="facility-services-fields" key={target.id}>
          {item ? <section className="facility-services-catalog"><h3>Thông tin danh mục chung</h3><SharedFacts item={target} /></section> : <SharedFacts item={target} />}
          {review && item && <Review item={item} />}
          {item && <h3>Cấu hình tại cơ sở</h3>}
          <label className="field-label">{target.kind === 'PURCHASE' ? 'Giá bán' : 'Giá thuê'} ({basis(target)})
            {item ? <input name="unitPrice" inputMode="numeric" required value={priceDraft}
              aria-invalid={priceTouched && amount === null || undefined}
              onChange={event => { setPriceDraft(event.target.value); setPriceTouched(true); }}
              onBlur={() => { if (amount !== null) setPriceDraft(number(amount)); }} /> :
              <input name="unitPrice" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required />}
            {item && <small>Giá mới chỉ áp dụng cho các giao dịch mới.</small>}
          </label>
          {item && priceTouched && amount === null && <small role="alert" className="portal-error-text">Nhập giá VND nguyên lớn hơn 0.</small>}
          {(!item || review) && <label className="field-label">
            {target.kind === 'PURCHASE' ? 'Tồn kho' : 'Số lượng thiết bị'} {review ? 'theo cấu hình mới' : 'ban đầu'}
            {target.physicalUnit && ' (' + target.physicalUnit + ')'}
            <input name="quantity" type="number" min={0} max={capacityLimit} step={1} required
              onChange={review ? event => setReviewQuantity(event.target.value) : undefined} />
          </label>}
          <div className={item ? "facility-services-switch is-edit" : "facility-services-switch"}>
            <div><label htmlFor={form + '-active'}>Cung cấp tại cơ sở</label><small id={form + '-help'}>{item ? activationHelp : 'Cho phép khách hàng mua hoặc thuê khi đủ điều kiện.'}</small></div>
            <button id={form + '-active'} type="button" role="switch" aria-checked={enabled} aria-describedby={form + '-help'}
              className="workspace-switch" disabled={cannotEnable} onClick={() => setEnabled(value => !value)} />
          </div>
          {item?.globalIsActive === false && <small>Mục này đang tắt toàn hệ thống.</small>}
        </div>}
      </fieldset>
    </form>
  </Modal>;
}

function InventoryForm({ item, state: initialState, onClose, onSuccess }: {
  item: AdditionalService; state: ServiceInventory; onClose: () => void; onSuccess: () => void;
}) {
  const purchase = item.kind === 'PURCHASE';
  const [state] = useState(initialState);
  const current = (purchase ? state.stockOnHand : state.rentalCapacity) ?? null;
  const committed = purchase ? state.reservedQuantity : state.peakCommittedQuantity;
  const [draft, setDraft] = useState(current === null ? '' : String(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const form = useId();
  const valid = validQuantity(draft);
  const next = Number(draft);
  const below = valid && committed != null && next < committed;
  const changed = valid && current != null ? next - current : null;
  const unchanged = current === next && valid;
  const invalid = !valid || below;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || invalid || unchanged) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(recordPath(item) + '/inventory', 'PATCH', {
        facilityId: item.facilityId, expectedQuantity: current, [purchase ? 'stockOnHand' : 'rentalCapacity']: next,
      });
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được số lượng.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <Modal title={updateTitle(item)} subtitle={<ItemSubtitle item={item} />} focusTitle onClose={onClose} busy={busy} className="facility-services-dialog is-refined"
    footer={<SaveFooter form={form} busy={busy} disabled={invalid || unchanged} onClose={onClose} label="Lưu số lượng" />}>
    <form id={form} className="portal-form facility-services-body" onSubmit={submit}>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      <QuantityFacts item={item} state={state} variant="update" />
      <label className="field-label">{purchase ? 'Tồn kho mới' : 'Tổng số thiết bị mới'}
        {item.physicalUnit && ' (' + item.physicalUnit + ')'}
        <input name="quantity" type="number" required min={0} max={capacityLimit} step={1} value={draft} disabled={busy}
          onChange={event => setDraft(event.target.value)} aria-invalid={invalid || undefined} />
        <small>Nhập tổng số lượng thực tế, không phải số lượng nhập thêm.</small>
      </label>
      {below && <p className="booking-alert is-error" role="alert">{purchase ? 'Tồn kho thấp hơn số lượng đã giữ.' : 'Tổng số thiết bị thấp hơn số lượng đã đặt đồng thời.'}</p>}
      {!valid && <small role="alert" className="portal-error-text">Nhập số nguyên từ 0 đến {number(capacityLimit)}.</small>}
      <section className="facility-services-preview" aria-live="polite">
        <h3>Kết quả sau cập nhật</h3>
        <dl>
          <div><dt>{purchase ? 'Tồn kho' : 'Tổng số thiết bị'}</dt><dd>{quantity(current, item.physicalUnit)} → <strong>{invalid ? '—' : quantity(next, item.physicalUnit)}</strong></dd></div>
          <div><dt>Thay đổi</dt><dd className={changed && !invalid ? changed > 0 ? 'is-increase' : 'is-decrease' : undefined}>
            {changed === null || invalid ? '—' : (changed > 0 ? '+' : changed < 0 ? '−' : '') + quantity(Math.abs(changed), item.physicalUnit)}</dd></div>
          {purchase && <div><dt>Số lượng còn lại sau cập nhật</dt>
            <dd><strong>{!invalid && committed != null ? quantity(next - committed, item.physicalUnit) : '—'}</strong></dd></div>}
        </dl>
      </section>
    </form>
  </Modal>;
}
