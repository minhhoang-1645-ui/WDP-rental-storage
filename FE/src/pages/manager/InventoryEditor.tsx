import { EntitySelect } from '../../components/EntitySelect';
import { useId, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../../auth/auth-context';
import { Modal, LoadState } from '../../components/manager/PortalUi';
import { first, label, money, rows, type Row } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';

export function InventoryEditor({ kind, record, onClose, onSaved }: { kind: 'type' | 'unit'; record?: Row; onClose: () => void; onSaved: (saved: Row) => void }) {
  const { user } = useAuth();
  const options = useApiResource<Row>('/manager/storage-types', user?.id ?? '');
  const lock = useRef(false);
  const formId = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const type = kind === 'type';
  const locked = !type && Boolean(record && (record.editLocked === true || record.status !== 'AVAILABLE' || rows(record.allocations).length > 0 || record.activeMaintenance));
  const close = () => {
    const form = document.getElementById(formId);
    if (busy || !type && form?.dataset.wdpDirty === 'true' && !window.confirm('Bỏ thay đổi kho chưa lưu?')) return;
    onClose();
  };
  const [facilityId, setFacilityId] = useState(first(record ?? {}, 'facilityId'));
  const [storageTypeId, setStorageTypeId] = useState(first(record ?? {}, 'storageTypeId', 'storageType.id'));
  const [daily, setDaily] = useState(record?.allowDailyRental === true);
  const selectedType = rows(options.data?.items).find(row => row.id === storageTypeId);
  const locations = useApiResource<{ floors: string[]; zones: string[] }>(!type && !locked ? '/manager/unit-locations' : null, user?.id ?? '');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || locked || user?.role !== 'MANAGER' || !type && !storageTypeId) return;
    const fields = new FormData(event.currentTarget);
    const input: Row = Object.fromEntries(fields.entries());
    for (const key of type ? ['widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'minRentalDays'] : ['row', 'position']) input[key] = fields.get(key) ? Number(fields.get(key)) : null;
    if (type) input.allowDailyRental = fields.get('allowDailyRental') === 'on';
    if (record) input.expectedUpdatedAt = record.updatedAt;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await mutate<Row>(`/manager/${type ? 'storage-types' : 'units'}${record ? `/${encodeURIComponent(first(record, 'id'))}` : ''}`, record ? 'PATCH' : 'POST', input);
      onSaved(saved);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const field = (name: string, title: string, numeric = false, required = true, maximum = 100000) => <label className="field-label" key={name}>{title}<input name={name} type={numeric ? 'number' : 'text'} defaultValue={first(record ?? {}, name)} required={required} min={numeric ? 1 : undefined} max={numeric ? maximum : undefined} step={numeric ? 1 : undefined} maxLength={numeric ? undefined : 100} /></label>;
  return <Modal title={`${record ? 'Sửa' : 'Thêm'} ${type ? 'loại kho' : 'kho vật lý'}`} onClose={close} busy={busy}
    className={type ? undefined : 'inventory-unit-dialog'} footer={type ? undefined : <>
      <button type="button" className="button-secondary" disabled={busy} onClick={close}>{locked ? 'Đóng' : 'Hủy'}</button>
      {!locked && <button type="submit" form={formId} className="button-primary" disabled={busy || !options.data || !storageTypeId}>
        {busy ? 'Đang lưu…' : record ? 'Lưu thay đổi' : 'Thêm kho'}
      </button>}
    </>}>
    <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
    {options.data && <form id={formId} className="portal-form" onSubmit={submit} onChange={event => { if (!type) event.currentTarget.dataset.wdpDirty = 'true'; }}>
      {type && <p>Giá mới chỉ áp dụng cho báo giá mới.</p>}
      {locked && <p className="booking-alert">Kho đã có hồ sơ, phân công hoặc đang sử dụng. Mã, loại và vị trí kho đã khóa.</p>}
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy || locked || !options.data}>
        {type ? <>
          {record ? <label className="field-label">Cơ sở<input readOnly value={first(rows(options.data?.facilities).find(row => row.id === facilityId) ?? {}, 'name') || facilityId} /><input type="hidden" name="facilityId" value={facilityId} /></label> : <label className="field-label">Cơ sở<EntitySelect aria-label="Cơ sở" name="facilityId" value={facilityId} onValueChange={setFacilityId} required><option value="">Chọn cơ sở</option>{rows(options.data?.facilities).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>{first(row, 'name')}</option>)}</EntitySelect></label>}
          <label className="field-label">Mã loại kho<input name="code" defaultValue={first(record ?? {}, 'code')} required readOnly={Boolean(record)} maxLength={50} pattern={/^[A-Za-z0-9][A-Za-z0-9_-]*$/.source} /></label>
          {field('name', 'Tên loại kho')}
          <label className="field-label">Nhóm kho<select aria-label="Nhóm kho" name="sizeId" defaultValue={first(record ?? {}, 'sizeId') || 'small'}>{[['locker', 'Tủ lưu trữ'], ['small', 'Kho nhỏ'], ['medium', 'Kho vừa'], ['large', 'Kho lớn']].map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
          <label className="field-label">Điều kiện<select aria-label="Điều kiện" name="condition" defaultValue={first(record ?? {}, 'condition') || 'STANDARD'}><option value="STANDARD">Tiêu chuẩn</option><option value="AIR_CONDITIONED">Điều hòa</option></select></label>
          {field('widthCm', 'Rộng (cm)', true)}{field('lengthCm', 'Dài (cm)', true)}{field('heightCm', 'Cao (cm)', true)}
          {field('monthlyRate', 'Giá tháng (VND)', true, true, 9999999999)}
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
              {rows(options.data?.items).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>
                {first(row, 'name')} · {first(row, 'code')}
              </option>)}
            </EntitySelect>
          </div>
          <p>{record ? 'Mã kho ' + first(record, 'unitCode', 'unitNumber') : 'Mã kho được hệ thống tự tạo.'}</p>
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
        {type && <button className="button-primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu'}</button>}
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
