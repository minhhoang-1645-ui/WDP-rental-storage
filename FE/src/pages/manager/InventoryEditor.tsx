import { EntitySelect } from '../../components/EntitySelect';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../../auth/auth-context';
import { Modal, LoadState } from '../../components/manager/PortalUi';
import { first, label, money, object, rows, type Row } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { apiRequest } from '../../services/api';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { useOutletContext } from 'react-router-dom';
import { priceRangeFor, priceRangeLabel, priceRangeNotice, type PriceRange } from './inventory-pricing';
import './inventory-editor.css';

const dimensions = [['widthCm', 'Rộng (cm)'], ['lengthCm', 'Dài (cm)'], ['heightCm', 'Cao (cm)']] as const;
const measurement = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });

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
  const locationError = !type && error.startsWith('Vị trí này đã có kho') ? error : '';
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
  const [typeCode, setTypeCode] = useState(first(record ?? {}, 'code'));
  const [storageTypeId, setStorageTypeId] = useState(first(record ?? {}, 'storageTypeId', 'storageType.id') || initialStorageTypeId || '');
  const [sizeId, setSizeId] = useState(first(record ?? {}, 'sizeId') || 'small');
  const [price, setPrice] = useState(first(record ?? {}, 'monthlyRate'));
  const [enabled, setEnabled] = useState<boolean | undefined>(record ? record.bookingEnabled !== false : undefined);
  const [daily, setDaily] = useState(record?.allowDailyRental === true);
  const [size, setSize] = useState(() => Object.fromEntries(dimensions.map(([key]) => [key, first(record ?? {}, key)])));
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(null);
  const photo = picked?.file;
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  useEffect(() => {
    if (picked) return () => URL.revokeObjectURL(picked.preview);
  }, [picked]);
  const facilities = rows(options.data?.facilities);
  const facilityId = first(record ?? {}, 'facilityId') || scopeFacility || (facilities.length === 1 ? first(facilities[0], 'id') : '');
  const width = Number(size.widthCm), length = Number(size.lengthCm), height = Number(size.heightCm);
  const area = width > 0 && length > 0 ? width * length / 10_000 : 0;
  const volume = height > 0 ? area * height / 100 : 0;
  const displayedPhoto = picked?.preview ?? (removePhoto ? '' : first(record ?? {}, 'image'));
  function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setPhotoError('Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.');
      return;
    }
    setPhotoError('');
    setPicked({ file, preview: URL.createObjectURL(file) });
  }
  const storageTypes = rows(options.data?.items);
  const selectedType = storageTypes.find(row => row.id === storageTypeId);
  const needsType = Boolean(!type && !record && onCreateType && options.data && !options.error && !storageTypes.length);
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
    if (lock.current || locked || user?.role !== 'FACILITY_MANAGER' || (type ? priceError || !facilityId : !selectedType)) return;
    const fields = new FormData(event.currentTarget);
    const input: Row = Object.fromEntries(fields.entries());
    for (const key of type ? ['widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'minRentalDays'] : ['row', 'position']) input[key] = fields.get(key) ? Number(fields.get(key)) : null;
    if (type) {
      input.facilityId = facilityId;
      if (removePhoto && !photo) input.image = '';
      input.allowDailyRental = fields.get('allowDailyRental') === 'on';
      input.bookingEnabled = bookingEnabled;
      if (record && Number(price) === Number(record.monthlyRate)) delete input.monthlyRate;
    }
    if (record) input.expectedUpdatedAt = record.updatedAt;
    lock.current = true; setBusy(true); setError('');
    try {
      const path = `/manager/${type ? 'storage-types' : 'units'}${record ? `/${encodeURIComponent(first(record, 'id'))}` : ''}`;
      const method = record ? 'PATCH' : 'POST';
      let saved: Row;
      if (type && photo) {
        const data = new FormData();
        data.set('payload', JSON.stringify(input));
        data.set('photo', photo);
        saved = await apiRequest<Row>(path, { method, body: data });
      } else {
        saved = await mutate<Row>(path, method, input);
      }
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu.');
      if (!type && !record) unitCode.refresh();
    }
    finally { lock.current = false; setBusy(false); }
  };
  const field = (name: string, title: string, numeric = false, required = true, maximum = 100000) => <label className="field-label" key={name}>{title}<input name={name} type={numeric ? 'number' : 'text'} defaultValue={first(record ?? {}, name)} required={required} min={numeric ? 1 : undefined} max={numeric ? maximum : undefined} step={numeric ? 1 : undefined} maxLength={numeric ? undefined : 100} /></label>;
  return <Modal title={type ? record ? 'Chỉnh sửa loại kho' : 'Thêm loại kho' : record ? 'Sửa kho vật lý' : 'Thêm kho vật lý'} onClose={close} busy={busy} focusTitle={!type}
    className={type ? 'inventory-type-dialog' : 'inventory-unit-dialog'} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={close}>{locked ? 'Đóng' : 'Hủy'}</button>
      {needsType ? <button type="button" className="button-primary" onClick={onCreateType}>Thêm loại kho</button> : !locked && <button type="submit" form={formId} className="button-primary" disabled={busy || !options.data || (type ? priceError || !facilityId : !selectedType)}>
        {busy ? photo ? 'Đang tải ảnh và lưu…' : 'Đang lưu…' : record ? 'Lưu thay đổi' : type ? 'Thêm loại kho' : 'Thêm kho'}
      </button>}
    </>}>
    <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
    {needsType && <p role="status">Cơ sở này chưa có loại kho. Hãy tạo loại kho với kích thước và đơn giá trước khi thêm kho vật lý.</p>}
    {options.data && !needsType && <form id={formId} className="portal-form" onSubmit={submit} onChange={event => {
      if (!type) event.currentTarget.dataset.wdpDirty = 'true';
      if (locationError) setError('');
    }}>
      {locked && <p className="booking-alert">Kho đã có hồ sơ, phân công hoặc đang sử dụng. Mã, loại và vị trí kho đã khóa.</p>}
      {error && !locationError && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy || locked || !options.data}>
        {type ? <>
          <fieldset className="inventory-type-section"><legend>Thông tin chung</legend>
          <p>Cơ sở <strong>{first(facilities.find(row => row.id === facilityId) ?? {}, 'name') || 'Chưa xác định'}</strong></p>
          <div className="inventory-type-grid">
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
          </div></fieldset>
          <fieldset className="inventory-type-section"><legend>Kích thước kho</legend>
          <div className="inventory-type-grid inventory-dimensions">
            {dimensions.map(([key, title]) => <label className="field-label" key={key}>{title}
              <input name={key} type="number" min={1} max={100000} step={1} required value={size[key]}
                onChange={event => setSize(current => ({ ...current, [key]: event.target.value }))} />
            </label>)}
          </div>
          <p>Diện tích <strong>{area > 0 ? measurement.format(area) + ' m²' : '—'}</strong> · Thể tích <strong>{volume > 0 ? measurement.format(volume) + ' m³' : '—'}</strong></p>
          </fieldset>
          <fieldset className="inventory-type-section"><legend>Giá thuê và kinh doanh</legend>
          <label className="field-label">Giá tháng (VND)<input name="monthlyRate" type="number" min={1} max={9999999999} step={1}
            required={!record || record.monthlyRate !== null} value={price} aria-invalid={outside} aria-describedby={formId + '-price'}
            onChange={event => setPrice(event.target.value)} /></label>
          <div id={formId + '-price'}>
            {Number(price) > 0 && <strong>{money(Number(price))}</strong>}
            <small>{priceRange ? 'Khung giá do BOM quy định: ' + priceRangeLabel(priceRange) : 'Nhóm kho này chưa được BOM thiết lập khung giá.'}</small>
            {outside && <p className="booking-alert is-error" role="alert">Giá tháng đang nằm ngoài khung cho phép.</p>}
            {scheduled && <small className="inventory-price-next">{priceRangeNotice(scheduled)}</small>}
          </div>
          <label className="inventory-type-check"><input type="checkbox" checked={bookingEnabled} disabled={!priceRange && !bookingEnabled}
            onChange={event => setEnabled(event.target.checked)} /> Bật kinh doanh loại kho</label>
          <label className="inventory-type-check"><input name="allowDailyRental" type="checkbox" checked={daily} onChange={event => setDaily(event.target.checked)} /> Cho thuê theo ngày</label>
          {daily && field('minRentalDays', 'Số ngày tối thiểu khi thuê ngày', true, true, 30)}
          </fieldset>
          <fieldset className="inventory-type-section"><legend>Hình ảnh loại kho</legend>
          {displayedPhoto && <img className="inventory-photo-preview" src={displayedPhoto} alt="Ảnh xem trước loại kho" />}
          <label className="field-label">{displayedPhoto ? 'Thay ảnh' : 'Chọn ảnh'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
              selectPhoto(event.target.files?.[0]);
              event.target.value = '';
            }} />
            <small>JPG, JPEG, PNG hoặc WebP · Tối đa 5 MB.</small>
          </label>
          {(photo || displayedPhoto) && <button type="button" className="button-secondary inventory-photo-remove" onClick={() => {
            if (photo) setPicked(null);
            else setRemovePhoto(true);
            setPhotoError('');
          }}>{photo ? 'Bỏ ảnh đã chọn' : 'Gỡ ảnh hiện tại'}</button>}
          {removePhoto && !photo && <button type="button" className="button-secondary inventory-photo-remove" onClick={() => setRemovePhoto(false)}>Giữ ảnh cũ</button>}
          {photoError && <p className="booking-alert is-error" role="alert">{photoError}</p>}
          {busy && photo && <progress aria-label="Đang tải ảnh và lưu loại kho" />}
          {field('imageAlt', 'Mô tả ảnh', false, false)}
          </fieldset>
        </> : <>
          <section className="inventory-unit-section" aria-label="Thông tin kho">
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
          <div className="inventory-unit-summary">
            <dl>
              <div><dt>{record ? 'Mã kho' : 'Mã kho dự kiến'}</dt><dd><strong aria-live="polite">
                {record ? first(record, 'unitCode', 'unitNumber') || '—' : unitCode.data?.unitNumber ?? (unitCode.loading ? 'Đang tải…' : '—')}
              </strong></dd></div>
              {selectedType && <>
                <div><dt>Điều kiện bảo quản</dt><dd>{selectedType.condition ? label(selectedType.condition) : '—'}</dd></div>
                <div><dt>Kích thước</dt><dd>{selectedType.widthCm && selectedType.lengthCm && selectedType.heightCm
                  ? `${selectedType.widthCm} × ${selectedType.lengthCm} × ${selectedType.heightCm} cm` : '—'}</dd></div>
                <div><dt>Giá thuê tháng</dt><dd>{money(selectedType.monthlyRate)}</dd></div>
              </>}
            </dl>
            {!record && <small>Mã kho được tạo tự động khi lưu.</small>}
          </div>
          {!record && unitCode.error && <LoadState loading={false} error={unitCode.error} retry={unitCode.refresh} />}
          </section>
          <section className="inventory-unit-section" aria-label="Vị trí kho">
          <h3>Vị trí kho</h3>
          {locations.error && <LoadState loading={false} error={locations.error} retry={locations.refresh} />}
          <div className="inventory-unit-fields">
            <InventoryLocationPicker name="floor" title="Tầng" initialValue={first(record ?? {}, 'floor')} values={locations.data?.floors ?? []} />
            <InventoryLocationPicker name="zone" title="Khu" initialValue={first(record ?? {}, 'zone')} values={locations.data?.zones ?? []} />
            <UnitPositionInput name="row" title="Hàng" initialValue={first(record ?? {}, 'row')} />
            <UnitPositionInput name="position" title="Vị trí trong hàng" initialValue={first(record ?? {}, 'position')} />
          </div>
          {locationError && <div className="booking-alert is-error" role="alert">{locationError}</div>}
          </section>
        </>}
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
  const lowerTitle = title.toLocaleLowerCase('vi');
  return <div className="field-label">
    <label className="field-label">{title}
      <select aria-label={title} name={custom ? undefined : name} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Chưa chọn</option>
        {choices.map(value => <option key={value} value={value}>{value}</option>)}
        <option value={newLocation}>+ Thêm {lowerTitle} mới</option>
      </select>
    </label>
    {custom && <UnitPositionInput name={name} title={'Tên ' + lowerTitle + ' mới'} placeholder={name === 'floor' ? 'Ví dụ Tầng 1' : 'Ví dụ A'} />}
  </div>;
}

function UnitPositionInput({ name, title, initialValue, placeholder }: {
  name: string; title: string; initialValue?: string; placeholder?: string;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const numeric = name === 'row' || name === 'position';
  return <label className="field-label">{title}
    <input name={name} type={numeric ? 'number' : 'text'} defaultValue={initialValue} placeholder={numeric ? 'Ví dụ 1' : placeholder}
      min={numeric ? 1 : undefined} max={numeric ? 100000 : undefined} step={numeric ? 1 : undefined}
      maxLength={numeric ? undefined : 100} pattern={numeric ? undefined : '.*\\S.*'}
      aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined}
      onInvalid={event => setError(event.currentTarget.validationMessage)} onChange={() => setError('')} />
    {error && <small className="inventory-unit-field-error" id={id} role="alert">{error}</small>}
  </label>;
}
