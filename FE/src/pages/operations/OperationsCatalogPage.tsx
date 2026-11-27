import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { Empty, LoadState, Modal, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DetailRow } from '../../components/workspace/DetailRow';
import { useListPagination } from '../../components/workspace/useListPagination';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import type { AdditionalService, ServiceDefinition } from '../../types/additional-service';
import { serviceUnits } from '../../utils/service-units';

const catalogPath = '/operations/catalog';
const endpoint = '/operations/additional-services';
const categoryLabels = { PURCHASE: 'Sản phẩm tiêu hao', RENTAL: 'Thiết bị cho thuê' };
const billingLabels = { ONE_TIME: 'Mua một lần', DAY: 'Thuê theo ngày', MONTH: 'Thuê theo tháng' };
const offeringLabels = {
  REVIEW_REQUIRED: 'Cần cập nhật cấu hình',
  AVAILABLE: 'Đang cung cấp',
  NOT_CONFIGURED: 'Chưa cấu hình',
  GLOBALLY_DISABLED: 'Tắt toàn hệ thống',
  LOCALLY_DISABLED: 'Ngừng cung cấp',
  FACILITY_UNAVAILABLE: 'Cơ sở không nhận đặt kho',
  PRICE_UNAVAILABLE: 'Chưa có giá',
  INVENTORY_UNCONFIGURED: 'Chưa cấu hình số lượng',
};

type CatalogItem = AdditionalService & {
  isActive: boolean;
  updatedAt: string;
  offeringFacilityCount: number;
  configuredFacilityCount: number;
};
type Catalog = { facilityCount: number; eligibleFacilityCount: number; items: CatalogItem[] };
type Offering = {
  facility: { id: string; name: string; code: string };
  status: keyof typeof offeringLabels | 'QUANTITY_UNAVAILABLE';
  unitPrice: string | null;
  quantity: number | null;
  availableQuantity: number | null;
  previousConfiguration?: ServiceDefinition & { quantity: number | null };
};
type CatalogDetail = CatalogItem & { canEditStructure?: boolean; structureBlockReason?: string | null; eligibleFacilityCount?: number; offerings: Offering[] };

function offeringPrice(price: string, item: Pick<AdditionalService, 'billingUnit' | 'physicalUnit'>) {
  const period = item.billingUnit === 'DAY' ? 'ngày' : item.billingUnit === 'MONTH' ? 'tháng' : null;
  const unit = [item.physicalUnit, period].filter(Boolean).join('/');
  return `${BigInt(price).toLocaleString('vi-VN')} đ${unit ? '/' + unit : ''}`;
}

function GlobalStatus({ active }: { active: boolean }) {
  return <Status value={active ? 'ACTIVE' : 'DISABLED'} text={active ? 'Đang hoạt động' : 'Đã tắt toàn hệ thống'} />;
}

export function OperationsCatalog() {
  const { user } = useAuth();
  const data = useApiResource<Catalog | (AdditionalService & { isActive: boolean })[]>(endpoint, user?.id, true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [billing, setBilling] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const legacyItems = Array.isArray(data.data) ? data.data : null;
  const catalog = data.data && !Array.isArray(data.data) && Array.isArray(data.data.items)
    ? data.data : null;
  const catalogItems = catalog?.items ?? legacyItems;
  const responseError = data.data && !catalogItems ? 'API trả dữ liệu danh mục không hợp lệ.' : '';
  const query = search.trim().toLocaleLowerCase('vi');
  const { items, pagination, reset } = useListPagination((catalogItems ?? []).filter(item =>
    (item.name + ' ' + item.code).toLocaleLowerCase('vi').includes(query) &&
    (!category || item.kind === category) && (!billing || item.billingUnit === billing) &&
    (!status || item.isActive === (status === 'active'))
  ));

  return <section className="operations-page operations-catalog">
    <PageHeader title="Danh mục sản phẩm và dịch vụ bổ trợ" description="Quản lý danh mục sản phẩm và dịch vụ hỗ trợ khách hàng trong quá trình thuê kho, được sử dụng chung tại các cơ sở NestBox.">
      <button className="button-primary" disabled={!catalog} onClick={() => { setNotice(''); setCreating(true); }}>Thêm danh mục</button>
    </PageHeader>
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <div className="operations-catalog-filters">
      <input type="search" aria-label="Tìm theo tên hoặc mã" placeholder="Tìm theo tên hoặc mã" value={search}
        onChange={event => { setSearch(event.target.value); reset(); }} />
      <select aria-label="Phân loại" value={category} onChange={event => { setCategory(event.target.value); reset(); }}>
        <option value="">Mọi phân loại</option>
        {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Hình thức tính phí" value={billing} onChange={event => { setBilling(event.target.value); reset(); }}>
        <option value="">Mọi hình thức tính phí</option>
        {Object.entries(billingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Trạng thái toàn hệ thống" value={status} onChange={event => { setStatus(event.target.value); reset(); }}>
        <option value="">Mọi trạng thái</option>
        <option value="active">Đang hoạt động</option>
        <option value="disabled">Đã tắt toàn hệ thống</option>
      </select>
    </div>
    <LoadState loading={data.loading} error={data.error || responseError} retry={data.refresh} />
    <RefreshStatus active={data.refreshing} />
    {legacyItems && <p className="booking-alert" role="status">API đang dùng định dạng cũ. Có thể xem danh sách. Cần cập nhật Backend local để xem chi tiết, số cơ sở cung cấp và chỉnh sửa danh mục.</p>}
    {catalogItems && items.length === 0 && (catalogItems.length
      ? <Empty title="Không tìm thấy sản phẩm hoặc dịch vụ" />
      : <Empty title="Danh mục chưa có mục nào" description="Thêm sản phẩm hoặc dịch vụ để các cơ sở có thể cấu hình cung cấp." />)}
    {catalogItems && items.length > 0 && <>
      <div className="manager-table-wrap">
        <table className="manager-table operations-catalog-table">
          <thead><tr><th scope="col">Sản phẩm / Dịch vụ</th><th scope="col">Phân loại</th><th scope="col">Hình thức tính phí</th><th scope="col">Đơn vị</th><th scope="col">Trạng thái</th><th scope="col" className="operations-catalog-count" title="Số cơ sở đang cung cấp / Tổng số cơ sở đủ điều kiện">Cơ sở cung cấp</th></tr></thead>
          <tbody>{items.map(item => <DetailRow key={item.id}
            detail={catalog ? { to: catalogPath + '/' + encodeURIComponent(item.id), label: `Xem ${item.name}` } : undefined}>
            <td><strong>{item.name}</strong><small>{item.code}</small></td>
            <td>{categoryLabels[item.kind]}</td>
            <td>{billingLabels[item.billingUnit]}</td>
            <td>{item.physicalUnit ?? 'Chưa thiết lập'}</td>
            <td><GlobalStatus active={item.isActive} /></td>
            <td className="operations-catalog-count">
              {!catalog || !('offeringFacilityCount' in item) || typeof item.offeringFacilityCount !== 'number' ? 'Chưa có dữ liệu'
                : catalog.eligibleFacilityCount === 0 ? '—'
                : <span className={item.offeringFacilityCount === 0 ? 'operations-catalog-count-zero' : undefined}>
                    {item.offeringFacilityCount}/{catalog.eligibleFacilityCount}
                  </span>}
            </td>
          </DetailRow>)}</tbody>
        </table>
      </div>
      {pagination}
      {catalog?.eligibleFacilityCount === 0 && <small>Chưa có cơ sở đang mở và nhận đặt kho.</small>}
    </>}
    {creating && <CatalogForm onClose={() => setCreating(false)} onSave={() => {
      setCreating(false);
      setNotice('Đã thêm mục vào danh mục.');
      data.refresh();
    }} />}
  </section>;
}

export function OperationsCatalogDetail() {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const { state } = useLocation();
  const returnTo = typeof state?.returnTo === 'string' && (state.returnTo === catalogPath || state.returnTo.startsWith(catalogPath + '?'))
    ? state.returnTo : catalogPath;
  const data = useApiResource<CatalogDetail>(serviceId ? endpoint + '/' + encodeURIComponent(serviceId) : null, user?.id, true);
  const [editing, setEditing] = useState<CatalogDetail | null>(null);
  const [notice, setNotice] = useState('');
  const item = Array.isArray(data.data?.offerings) ? data.data : null;
  const responseError = data.data && !item ? 'API trả dữ liệu chi tiết danh mục không hợp lệ.' : '';
  const purchase = item?.kind === 'PURCHASE';

  return <section className="operations-page operations-catalog operations-catalog-detail">
    <nav aria-label="Đường dẫn danh mục"><Link className="booking-back operations-catalog-back" to={returnTo}><ArrowLeft size={16} aria-hidden="true" />Danh mục bổ trợ</Link></nav>
    <LoadState loading={data.loading} error={data.error || responseError} retry={data.refresh} />
    <RefreshStatus active={data.refreshing} />
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {item && <>
      <PageHeader title={item.name} meta={item.code} status={<GlobalStatus active={item.isActive} />}>
        <button className="button-primary" onClick={() => { setNotice(''); setEditing(item); }}>Chỉnh sửa</button>
      </PageHeader>
      <section className="manager-section">
        <h2>Thông tin chung</h2>
        <dl className="operations-catalog-facts">
          <div><dt>Phân loại</dt><dd>{categoryLabels[item.kind]}</dd></div>
          <div><dt>Hình thức tính phí</dt><dd>{billingLabels[item.billingUnit]}</dd></div>
          <div><dt>Đơn vị tính</dt><dd>{item.physicalUnit ?? 'Chưa thiết lập'}</dd></div>
          <div className="operations-catalog-description"><dt>Mô tả</dt><dd className={item.description?.trim() ? undefined : 'operations-catalog-muted'}>{item.description?.trim() || 'Chưa có mô tả'}</dd></div>
        </dl>
      </section>
      <section className="manager-section">
        <header className="operations-catalog-section-header">
          <h2>Cơ sở cung cấp</h2>
          <small>{item.eligibleFacilityCount === undefined ? 'Chưa có dữ liệu tổng số cơ sở đủ điều kiện'
            : item.eligibleFacilityCount === 0 ? 'Chưa có cơ sở đang mở và nhận đặt kho'
            : `${item.offeringFacilityCount}/${item.eligibleFacilityCount} cơ sở đang cung cấp`}</small>
        </header>
        {item.offerings.length === 0 ? <Empty title="Chưa có cơ sở" description="Cấu hình cung cấp sẽ hiển thị khi hệ thống có cơ sở." /> :
          <div className="manager-table-wrap">
            <table className="manager-table operations-catalog-table">
              <thead><tr><th scope="col">Cơ sở</th><th scope="col">{purchase ? 'Giá bán' : 'Giá thuê'}</th><th scope="col">{purchase ? 'Tồn kho' : 'Số lượng khả dụng'}</th><th scope="col">Trạng thái</th></tr></thead>
              <tbody>{item.offerings.map(offer => <tr key={offer.facility.id}>
                <td><strong>{offer.facility.name}</strong><small>{offer.facility.code}</small></td>
                <td>{offer.unitPrice === null ? '—' : offeringPrice(offer.unitPrice, offer.previousConfiguration ?? item)}
                  {offer.previousConfiguration && <small>Giá theo cấu hình trước</small>}</td>
                <td>{offer.previousConfiguration
                    ? <>{offer.previousConfiguration.quantity ?? '—'} {offer.previousConfiguration.physicalUnit}<small>Số lượng theo cấu hình trước</small></>
                    : purchase ? offer.quantity ?? '—' : offer.availableQuantity ?? '—'}
                  {!purchase && offer.availableQuantity !== null && offer.quantity !== null &&
                    <small>Hôm nay · Tổng sức chứa {offer.quantity}</small>}</td>
                <td><Status value={offer.status === 'AVAILABLE' ? 'ACTIVE' : (offer.status === 'QUANTITY_UNAVAILABLE' || offer.status === 'REVIEW_REQUIRED') ? 'PENDING' : 'NEUTRAL'}
                  text={offer.status === 'QUANTITY_UNAVAILABLE' ? purchase ? 'Hết hàng' : 'Hết thiết bị khả dụng' : offeringLabels[offer.status]} /></td>
              </tr>)}</tbody>
            </table>
          </div>}
        {item.offerings.length > 0 && <small className="operations-catalog-table-note">Giá và số lượng cung cấp được thiết lập bởi quản lý từng cơ sở.</small>}
      </section>
    </>}
    {editing && <CatalogForm item={editing} onClose={() => setEditing(null)} onSave={() => {
      setEditing(null);
      setNotice('Đã lưu thay đổi.');
      data.refresh();
    }} />}
  </section>;
}

function CatalogForm({ item, onClose, onSave }: { item?: CatalogDetail; onClose: () => void; onSave: () => void }) {
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const activationId = useId();
  const structureHelpId = useId();
  const canEditStructure = !item || item.canEditStructure === true;
  const [kind, setKind] = useState<AdditionalService['kind']>(item?.kind ?? 'PURCHASE');
  const [billingUnit, setBillingUnit] = useState(item?.billingUnit ?? 'ONE_TIME');
  const [physicalUnit, setPhysicalUnit] = useState(item?.physicalUnit ?? '');
  const [custom, setCustom] = useState(Boolean(item?.physicalUnit && !serviceUnits(item.kind).includes(item.physicalUnit)));
  const unitOptions = serviceUnits(kind);
  const affectsFacilities = !!item?.configuredFacilityCount && canEditStructure &&
    (kind !== item.kind || billingUnit !== item.billingUnit || physicalUnit !== (item.physicalUnit ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const code = String(form.get('code') ?? '').trim().toUpperCase();
    if (!item && !/^[A-Z0-9_-]{2,50}$/.test(code)) {
      setError('Mã phải có 2–50 ký tự gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới.');
      return;
    }
    if (name.length < 2) {
      setError('Nhập tên sản phẩm hoặc dịch vụ có ít nhất 2 ký tự.');
      return;
    }
    if (custom && !physicalUnit.trim()) {
      setError('Nhập tên đơn vị tính khi chọn Khác.');
      return;
    }
    const unit = physicalUnit.trim().replace(/\s+/g, ' ') || null;
    lock.current = true;
    setBusy(true);
    try {
      await apiRequest(item ? endpoint + '/' + encodeURIComponent(item.id) : endpoint, {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name,
          description: String(form.get('description') ?? '').trim(),
          isActive,
          ...(item ? { expectedUpdatedAt: item.updatedAt } : { code }),
          ...(canEditStructure ? {
            kind,
            billingUnit,
            ...(unit !== (item?.physicalUnit ?? null) ? { physicalUnit: unit } : {}),
          } : {}),
        }),
      });
      onSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu mục này.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Modal title={item ? `Chỉnh sửa ${item.name}` : 'Thêm danh mục'} onClose={onClose} busy={busy} className="operations-catalog-dialog">
    <form className="portal-form" noValidate onSubmit={save}>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy} className="operations-catalog-fields">
        <label>Mã sản phẩm/dịch vụ<input name="code" required readOnly={Boolean(item)} defaultValue={item?.code} maxLength={50} /></label>
        <label>Tên sản phẩm/dịch vụ<input name="name" required defaultValue={item?.name} maxLength={120} /></label>
        <label>Phân loại<select disabled={!canEditStructure} aria-describedby={!canEditStructure ? structureHelpId : undefined} value={kind} onChange={event => {
          const next = event.target.value as typeof kind;
          setKind(next);
          setBillingUnit(next === 'PURCHASE' ? 'ONE_TIME' : 'MONTH');
          setCustom(Boolean(physicalUnit && !serviceUnits(next).includes(physicalUnit)));
        }}>
          {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Hình thức tính phí
          <input readOnly value={billingLabels[billingUnit] + (billingUnit === 'DAY' ? ' (dữ liệu cũ)' : '')} />
        </label>
        <label>Đơn vị vật lý
          <select name="physicalUnit" disabled={!canEditStructure} aria-describedby={!canEditStructure ? structureHelpId : undefined}
            value={custom ? '__custom__' : physicalUnit} onChange={event => {
              setCustom(event.target.value === '__custom__');
              setPhysicalUnit(event.target.value === '__custom__' ? '' : event.target.value);
            }}><option value="">Chưa thiết lập</option>
            {unitOptions.map(unit => <option key={unit}>{unit}</option>)}
            <option value="__custom__">Khác</option>
          </select></label>
        {custom && <label>Tên đơn vị tính<input maxLength={40} placeholder="Ví dụ: chai, lọ, mét" disabled={!canEditStructure}
          value={physicalUnit} onChange={event => setPhysicalUnit(event.target.value)} required /></label>}
        {billingUnit === 'DAY' && <div className="operations-catalog-description">
          <small>Thiết bị thuê ngày cũ đã ngừng nhận giao dịch mới.</small>
          {canEditStructure && <button className="button-secondary" type="button" onClick={() => setBillingUnit('MONTH')}>Chuyển sang thuê tháng</button>}
        </div>}
        {!canEditStructure && <small className="operations-catalog-description" id={structureHelpId}>
          {item?.structureBlockReason ?? 'Chưa xác định được các giao dịch đang xử lý. Vui lòng tải lại.'}
        </small>}
        {affectsFacilities && <small className="operations-catalog-description">
          Thay đổi này yêu cầu các cơ sở đang sử dụng kiểm tra lại giá và số lượng cung cấp.
        </small>}
        <label className="operations-catalog-description">Mô tả<textarea name="description" defaultValue={item?.description ?? ''} maxLength={1000} rows={3} /></label>
        <div className="operations-catalog-description operations-catalog-activation">
          <div>
            <label htmlFor={activationId}>Cung cấp trên toàn hệ thống</label>
            <small id={activationId + '-help'}>
              {isActive ? 'Cho phép các cơ sở cung cấp sản phẩm hoặc dịch vụ này.' : 'Ngừng cung cấp cho giao dịch mới.'}
            </small>
          </div>
          <button id={activationId} type="button" role="switch" aria-checked={isActive}
            aria-describedby={activationId + '-help'} className="workspace-switch"
            onClick={() => setIsActive(active => !active)} />
        </div>
      </fieldset>
      <div className="portal-actions">
        <button className="button-secondary" type="button" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : item ? 'Lưu thay đổi' : 'Lưu danh mục'}</button>
      </div>
    </form>
  </Modal>;
}
