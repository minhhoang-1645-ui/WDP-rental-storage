import { EntitySelect } from '../../components/EntitySelect';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/auth-context';
import { Modal, LoadState } from '../../components/manager/PortalUi';
import { first, rows, type Row } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';

export function InventoryEditor({ kind, record, onClose, onSaved }: { kind: 'type' | 'unit'; record?: Row; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const options = useApiResource<Row>('/manager/storage-types', user?.id ?? '');
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const type = kind === 'type';
  const [storageTypeId, setStorageTypeId] = useState(() => first(record ?? {}, 'storageTypeId', 'storageType.id'));
  const existingUnits = useApiResource<{ items: Row[] }>(!type ? '/manager/units?limit=100' : null, user?.id ?? '');
  const locationField = (name: string, title: string, numeric = false) => {
    const values = [...new Set((existingUnits.data?.items ?? []).map(unit => first(unit, name)).filter(Boolean))];
    return <InventoryLocationPicker key={name} name={name} title={title} numeric={numeric}
      initialValue={first(record ?? {}, name)} values={values} disabled={busy} />;
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || user?.role !== 'MANAGER') return;
    const fields = new FormData(event.currentTarget);
    const input: Row = Object.fromEntries(fields.entries());
    for (const key of type ? ['widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'minRentalDays'] : ['row', 'position']) input[key] = fields.get(key) ? Number(fields.get(key)) : null;
    if (!type && !record && !String(input.unitNumber ?? '').trim()) {
      const selectedType = rows(options.data?.items).find(row => first(row, 'id') === input.storageTypeId);
      if (!selectedType) {
        setError('Vui lòng chọn loại kho.');
        return;
      }
      const prefix = first(selectedType, 'code').slice(0, 33);
      const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
      input.unitNumber = `${prefix}-${suffix}`;
    }
    if (type) input.allowDailyRental = fields.get('allowDailyRental') === 'on';
    if (record) input.expectedUpdatedAt = record.updatedAt;
    lock.current = true; setBusy(true); setError('');
    try {
      await mutate(`/manager/${type ? 'storage-types' : 'units'}${record ? `/${encodeURIComponent(first(record, 'id'))}` : ''}`, record ? 'PATCH' : 'POST', input);
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const field = (name: string, title: string, numeric = false, required = true, maximum = 100000) => <label className="field-label" key={name}>{title}<input name={name} type={numeric ? 'number' : 'text'} defaultValue={first(record ?? {}, name)} required={required} min={numeric ? 1 : undefined} max={numeric ? maximum : undefined} step={numeric ? 1 : undefined} maxLength={numeric ? undefined : 100} /></label>;
  return <Modal title={`${record ? 'Sửa' : 'Thêm'} ${type ? 'loại kho' : 'kho vật lý'}`} onClose={onClose} busy={busy}>
    <LoadState loading={options.loading} error={options.error} retry={options.refresh} />
    {options.data && <form className="portal-form" onSubmit={submit}>
      <p>{type ? 'Giá mới chỉ áp dụng cho báo giá mới.' : record ? 'Kho đã có hồ sơ hoặc đang sử dụng không thể đổi mã, loại hoặc vị trí.' : 'Chọn loại kho đã có trong danh mục để dùng chung kích thước, điều kiện và bảng giá. Các ô vị trí có thể để trống.'}</p>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy || !options.data}>
        {type ? <>
          <label className="field-label">Cơ sở<select aria-label="Cơ sở" name="facilityId" defaultValue={first(record ?? {}, 'facilityId')} required aria-readonly={Boolean(record)} onChange={event => { if (record) event.target.value = first(record, 'facilityId'); }}><option value="">Chọn cơ sở</option>{rows(options.data?.facilities).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>{first(row, 'name')}</option>)}</select></label>
          <label className="field-label">Mã loại kho<input name="code" defaultValue={first(record ?? {}, 'code')} required readOnly={Boolean(record)} maxLength={50} pattern={/^[A-Za-z0-9][A-Za-z0-9_\-]*$/.source} /></label>
          {field('name', 'Tên loại kho')}
          <label className="field-label">Nhóm kho<select aria-label="Nhóm kho" name="sizeId" defaultValue={first(record ?? {}, 'sizeId') || 'small'}>{[['locker', 'Tủ lưu trữ'], ['small', 'Kho nhỏ'], ['medium', 'Kho vừa'], ['large', 'Kho lớn']].map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
          <label className="field-label">Điều kiện<select aria-label="Điều kiện" name="condition" defaultValue={first(record ?? {}, 'condition') || 'STANDARD'}><option value="STANDARD">Tiêu chuẩn</option><option value="AIR_CONDITIONED">Điều hòa</option></select></label>
          {field('widthCm', 'Rộng (cm)', true)}{field('lengthCm', 'Dài (cm)', true)}{field('heightCm', 'Cao (cm)', true)}
          {field('monthlyRate', 'Giá tháng (VND)', true, true, 9999999999)}
          <label><input name="allowDailyRental" type="checkbox" defaultChecked={record?.allowDailyRental === true} /> Cho thuê theo ngày</label>
          {field('minRentalDays', 'Số ngày tối thiểu khi thuê ngày', true, false, 30)}
          <label className="field-label">URL ảnh (tùy chọn)<input name="image" defaultValue={first(record ?? {}, 'image')} maxLength={2000} /></label>
          {field('imageAlt', 'Mô tả ảnh', false, false)}
        </> : <>
          <div className="field-label">
            <span>Loại kho áp dụng</span>
            <EntitySelect aria-label="Loại kho áp dụng" name="storageTypeId" value={storageTypeId}
              onValueChange={setStorageTypeId} disabled={busy} required>
              <option value="">Chọn loại kho</option>
              {rows(options.data?.items).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>
                {first(row, 'name')} · {first(row, 'code')}
              </option>)}
            </EntitySelect>
          </div>
          <label className="field-label">{record ? 'Mã kho' : 'Mã kho (tùy chọn)'}<input name="unitNumber" defaultValue={first(record ?? {}, 'unitNumber', 'unitCode')} required={Boolean(record)} placeholder={record ? undefined : 'Để trống để hệ thống tự tạo mã'} maxLength={50} pattern={/^[A-Za-z0-9][A-Za-z0-9_\-]*$/.source} /></label>
          {locationField('floor', 'Tầng')}{locationField('zone', 'Khu')}{locationField('row', 'Hàng', true)}{locationField('position', 'Vị trí trong hàng', true)}
        </>}
        <button className="button-primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu'}</button>
      </fieldset>
    </form>}
  </Modal>;
}


const newLocation = '__new_location__';

function InventoryLocationPicker({ name, title, numeric, initialValue, values, disabled }: {
  name: string; title: string; numeric: boolean; initialValue: string; values: string[]; disabled: boolean;
}) {
  const [selected, setSelected] = useState(initialValue);
  const custom = selected === newLocation;
  const choices = [...new Set([...values, initialValue].filter(Boolean))];
  return <div className="field-label">
    <span>{title} (tùy chọn)</span>
    <EntitySelect aria-label={title} name={custom ? undefined : name} value={selected}
      onValueChange={setSelected} disabled={disabled}>
      <option value="">Chưa chọn {title.toLocaleLowerCase('vi')}</option>
      {choices.map(value => <option key={value} value={value}>{value}</option>)}
      <option value={newLocation}>+ Nhập giá trị mới</option>
    </EntitySelect>
    {custom && <input aria-label={`Nhập ${title.toLocaleLowerCase('vi')} mới`} name={name}
      type={numeric ? 'number' : 'text'} min={numeric ? 1 : undefined}
      max={numeric ? 100000 : undefined} maxLength={numeric ? undefined : 100}
      placeholder="Nhập giá trị mới" required />}
  </div>;
}
