import { EntitySelect } from '../../components/EntitySelect';
import { useId, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../../auth/auth-context';
import { Modal, LoadState } from '../../components/manager/PortalUi';
import { first, label, money, object, rows, type Row } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { useOutletContext } from 'react-router-dom';
import { priceRangeFor, priceRangeLabel, priceRangeNotice, type PriceRange } from './inventory-pricing';

export function NewInventoryUnit({ onClose, onSaved }: { onClose: () => void; onSaved: (saved: Row) => void }) {
  const [creatingType, setCreatingType] = useState(false);
  const [storageTypeId, setStorageTypeId] = useState('');

  return creatingType
    ? <InventoryEditor key="type" kind="type" onClose={() => setCreatingType(false)} onSaved={saved => {
      setStorageTypeId(first(saved, 'id'));
      setCreatingType(false);
    }} />
    : <InventoryEditor key="unit" kind="unit" initialStorageTypeId={storageTypeId}
      onCreateType={() => setCreatingType(true)} onClose={onClose} onSaved={onSaved} />;
}

export function InventoryEditor({ kind, record, initialStorageTypeId, onCreateType, onClose, onSaved }: {
  kind: 'type' | 'unit'; record?: Row; initialStorageTypeId?: string; onCreateType?: () => void;
  onClose: () => void; onSaved: (saved: Row) => void;
}) {
  const { user } = useAuth();
  const scopeFacility = useOutletContext<string>();
  const requestConfirmation = useConfirmation();
  const options = useApiResource<Row>('/manager/storage-types', user?.id ?? '');
  const lock = useRef(false);
  const formId = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const type = kind === 'type';
  const locked = !type && Boolean(record && (record.editLocked === true || record.status !== 'AVAILABLE' || rows(record.allocations).length > 0 || record.activeMaintenance));
  const close = async () => {
    const form = document.getElementById(formId);
    if (lock.current) return;
    if (!type && form?.dataset.wdpDirty === 'true') {
      const accepted = await requestConfirmation({title:'Bỏ thay đổi chưa lưu?',description:'Những thông tin kho bạn vừa nhập chưa được lưu.',confirmLabel:'Bỏ thay đổi',cancelLabel:'Tiếp tục chỉnh sửa',destructive:true});
      if (!accepted) return;
    }
    onClose();
  };
  const [facilityId, setFacilityId] = useState(first(record ?? {}, 'facilityId') || scopeFacility || '');
  const [typeCode, setTypeCode] = useState(first(record ?? {}, 'code'));
  const [storageTypeId, setStorageTypeId] = useState(first(record ?? {}, 'storageTypeId', 'storageType.id') || initialStorageTypeId || '');
  const [sizeId, setSizeId] = useState(first(record ?? {}, 'sizeId') || 'small');
  const [price, setPrice] = useState(first(record ?? {}, 'monthlyRate'));
  const [enabled, setEnabled] = useState<boolean | undefined>(record ? record.bookingEnabled !== false : undefined);
  const [daily, setDaily] = useState(record?.allowDailyRental === true);
  const storageTypes = rows(options.data?.items);
  const selectedType = storageTypes.find(row => row.id === storageTypeId);
  const needsType = Boolean(!type && onCreateType && options.data && !options.error && !storageTypes.length);
  const { current: priceRange, scheduled } = priceRangeFor(rows(options.data?.pricingRanges) as PriceRange[], facilityId, sizeId);
  const bookingEnabled = enabled ?? Boolean(priceRange);
  const changedPrice = !record || sizeId !== record.sizeId || Number(price) !== Number(record.monthlyRate);
  const validating = changedPrice || bookingEnabled && record?.bookingEnabled === false;
  const outside = Boolean(validating && priceRange && price && (Number(price) < priceRange.min || Number(price) > priceRange.max));
  const priceError = outside || Boolean(validating && bookingEnabled && !priceRange);
  const unitCode = useApiResource<{ unitNumber: string }>(
    !type && !record && storageTypeId ? `/manager/storage-types/${encodeURIComponent(storageTypeId)}/next-unit-code` : null,
    user?.id ?? '',
  );
  const locations = useApiResource<{ floors: string[]; zones: string[] }>(!type && !locked ? '/manager/unit-locations' : null, user?.id ?? '');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || locked || user?.role !== 'FACILITY_MANAGER' || (type ? priceError : !selectedType)) return;
    const fields = new FormData(event.currentTarget);
    const input: Row = Object.fromEntries(fields.entries());
    for (const key of type ? ['widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'minRentalDays'] : ['row', 'position']) input[key] = fields.get(key) ? Number(fields.get(key)) : null;
    if (type) {
      input.allowDailyRental = fields.get('allowDailyRental') === 'on';
      input.bookingEnabled = bookingEnabled;
      if (record && Number(price) === Number(record.monthlyRate)) delete input.monthlyRate;
    }
    if (record) input.expectedUpdatedAt = record.updatedAt;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await mutate<Row>(`/manager/${type ? 'storage-types' : 'units'}${record ? `/${encodeURIComponent(first(record, 'id'))}` : ''}`, record ? 'PATCH' : 'POST', input);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu.');
      if (!type && !record) unitCode.refresh();
    }
    finally { lock.current = false; setBusy(false); }
  };
  const field = (name: string, title: string, numeric = false, required = true, maximum = 100000) => <label className="field-label" key={name}>{title}<input name={name} type={numeric ? 'number' : 'text'} defaultValue={first(record ?? {}, name)} required={required} min={numeric ? 1 : undefined} max={numeric ? maximum : undefined} step={numeric ? 1 : undefined} maxLength={numeric ? undefined : 100} /></label>;
  return <Modal title={`${record ? 'Sửa' : 'Thêm'} ${type ? 'loại kho' : 'kho vật lý'}`} onClose={close} busy={busy}
    className={type ? undefined : 'inventory-unit-dialog'} footer={type ? undefined : <>
      <button type="button" className="button-secondary" disabled={busy} onClick={close}>{locked ? 'Đóng' : 'Hủy'}</button>
      {needsType ? <button type="button" className="button-primary" onClick={onCreateType}>Thêm loại kho</button> : !locked && <button type="submit" form={formId} className="button-primary" disabled={busy || !options.data || !selectedType}>
        {busy ? 'Đang lưu…' : record ? 'Lưu thay đổi' : 'Thêm kho'}
      </button>}
    </>}>
    <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
    {needsType && <p role="status">Cơ sở này chưa có loại kho. Hãy tạo loại kho với kích thước và đơn giá trước khi thêm kho vật lý.</p>}
    {options.data && !needsType && <form id={formId} className="portal-form" onSubmit={submit} onChange={event => { if (!type) event.currentTarget.dataset.wdpDirty = 'true'; }}>
      {type && <p>Giá mới chỉ áp dụng cho báo giá mới.</p>}
      {locked && <p className="booking-alert">Kho đã có hồ sơ, phân công hoặc đang sử dụng. Mã, loại và vị trí kho đã khóa.</p>}
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy || locked || !options.data}>
        {type ? <>
          {record || scopeFacility ? <label className="field-label">Cơ sở<input readOnly value={first(rows(options.data?.facilities).find(row => row.id === facilityId) ?? {}, 'name') || facilityId} /><input type="hidden" name="facilityId" value={facilityId} /></label> : <label className="field-label">Cơ sở<EntitySelect aria-label="Cơ sở" name="facilityId" value={facilityId} onValueChange={setFacilityId} required><option value="">Chọn cơ sở</option>{rows(options.data?.facilities).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>{first(row, 'name')}</option>)}</EntitySelect></label>}
          <label className="field-label">Mã loại kho
            <input name="code" value={typeCode} required readOnly={Boolean(record)} maxLength={50}
              pattern={/^[A-Z0-9][A-Z0-9_\-]*$/.source} placeholder="Ví dụ LG-F02"
              aria-describedby={formId + '-type-code'}
              onChange={event => setTypeCode(event.target.value.trim().toUpperCase())} />
            <small id={formId + '-type-code'}>Mã này dùng làm tiền tố của mã kho vật lý. Chỉ dùng chữ, số, gạch ngang hoặc gạch dưới.</small>
          </label>
          {field('name', 'Tên loại kho')}
          <label className="field-label">Nhóm kho<select aria-label="Nhóm kho" name="sizeId" value={sizeId} onChange={event => setSizeId(event.target.value)}>{Object.entries(object(options.data?.groups)).map(([value, title]) => <option key={value} value={value}>{String(title)}</option>)}</select></label>
          <label className="field-label">Điều kiện<select aria-label="Điều kiện" name="condition" defaultValue={first(record ?? {}, 'condition') || 'STANDARD'}><option value="STANDARD">Tiêu chuẩn</option><option value="AIR_CONDITIONED">Điều hòa</option></select></label>
          {field('widthCm', 'Rộng (cm)', true)}{field('lengthCm', 'Dài (cm)', true)}{field('heightCm', 'Cao (cm)', true)}
          <label className="field-label">Giá tháng (VND)<input name="monthlyRate" type="number" min={1} max={9999999999} step={1}
            required={!record || record.monthlyRate !== null} value={price} aria-invalid={outside} aria-describedby={formId + '-price'}
            onChange={event => setPrice(event.target.value)} /></label>
          <div id={formId + '-price'}>
            <small>{priceRange ? 'Khung giá do BOM quy định: ' + priceRangeLabel(priceRange) : 'Nhóm kho này chưa được BOM thiết lập khung giá.'}</small>
            {outside && <p className="booking-alert is-error" role="alert">Giá tháng đang nằm ngoài khung cho phép.</p>}
            {scheduled && <small className="inventory-price-next">{priceRangeNotice(scheduled)}</small>}
          </div>
          <label><input type="checkbox" checked={bookingEnabled} disabled={!priceRange && !bookingEnabled}
            onChange={event => setEnabled(event.target.checked)} /> Bật kinh doanh loại kho</label>
          <label><input name="allowDailyRental" type="checkbox" checked={daily} onChange={event => setDaily(event.target.checked)} /> Cho thuê theo ngày</label>
          {daily && field('minRentalDays', 'Số ngày tối thiểu khi thuê ngày', true, true, 30)}
          <label className="field-label">URL ảnh (tùy chọn)<input name="image" defaultValue={first(record ?? {}, 'image')} maxLength={2000} /></label>
          {field('imageAlt', 'Mô tả ảnh', false, false)}
        </> : <>
          <h3>Thông tin kho</h3>
          <div className="field-label">
            <span>Loại kho áp dụng</span>
            <EntitySelect aria-label="Loại kho áp dụng" name="storageTypeId" value={storageTypeId}
              onValueChange={setStorageTypeId} disabled={busy || locked} required>
              <option value="">Chọn loại kho</option>
              {storageTypes.map(row => <option key={first(row, 'id')} value={first(row, 'id')}>
                {first(row, 'name')} · {first(row, 'code')}
              </option>)}
            </EntitySelect>
          </div>
          {record ? <p>Mã kho {first(record, 'unitCode', 'unitNumber')}</p> : <>
            <label className="field-label">Mã kho tự động
              <input readOnly value={unitCode.data?.unitNumber ?? ''}
                placeholder={unitCode.loading ? 'Đang tải mã dự kiến…' : storageTypeId ? 'Chưa có mã dự kiến' : 'Chọn loại kho để xem mã'}
                aria-describedby={formId + '-unit-code'} />
              <small id={formId + '-unit-code'} className="inventory-type-preview">Mã dự kiến. Hệ thống cấp mã chính thức khi lưu thành công.</small>
            </label>
            {unitCode.error && <LoadState loading={false} error={unitCode.error} retry={unitCode.refresh} />}
          </>}
          {selectedType && <p className="inventory-type-preview">{[
            selectedType.condition ? label(selectedType.condition) : '',
            selectedType.widthCm && selectedType.lengthCm && selectedType.heightCm ? `${selectedType.widthCm} × ${selectedType.lengthCm} × ${selectedType.heightCm} cm` : '',
            typeof selectedType.monthlyRate === 'number' ? `${money(selectedType.monthlyRate)} / tháng` : '',
          ].filter(Boolean).join(' · ')}</p>}
          <h3>Vị trí kho</h3>
          {locations.error && <LoadState loading={false} error={locations.error} retry={locations.refresh} />}
          <div className="inventory-unit-fields">
            <InventoryLocationPicker name="floor" title="Tầng" initialValue={first(record ?? {}, 'floor')} values={locations.data?.floors ?? []} />
            <InventoryLocationPicker name="zone" title="Khu" initialValue={first(record ?? {}, 'zone')} values={locations.data?.zones ?? []} />
            {field('row', 'Hàng', true, false)}{field('position', 'Vị trí trong hàng', true, false)}
          </div>
        </>}
        {type && <button className="button-primary" type="submit" disabled={busy || priceError}>{busy ? 'Đang lưu…' : 'Lưu'}</button>}
      </fieldset>
    </form>}
  </Modal>;
}


const newLocation = '__new_location__';

function InventoryLocationPicker({ name, title, initialValue, values }: {
  name: string; title: string; initialValue: string; values: string[];
}) {
  const [selected, setSelected] = useState(initialValue);
  const custom = selected === newLocation;
  const choices = [...new Set([...values, initialValue].filter(Boolean))];
  return <div className="field-label">
    <label className="field-label">{title}
      <select aria-label={title} name={custom ? undefined : name} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Chưa chọn</option>
        {choices.map(value => <option key={value} value={value}>{value}</option>)}
        <option value={newLocation}>Nhập mới…</option>
      </select>
    </label>
    {custom && <input aria-label={'Nhập ' + title.toLocaleLowerCase('vi') + ' mới'} name={name} maxLength={100} required />}
  </div>;
}
