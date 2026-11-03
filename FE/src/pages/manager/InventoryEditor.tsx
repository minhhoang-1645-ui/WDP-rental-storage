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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || user?.role !== 'MANAGER') return;
    const fields = new FormData(event.currentTarget);
    const input: Row = Object.fromEntries(fields.entries());
    for (const key of type ? ['widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'minRentalDays'] : ['row', 'position']) input[key] = fields.get(key) ? Number(fields.get(key)) : null;
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
      <p>Giá mới chỉ áp dụng cho báo giá mới. Không đổi cấu trúc hoặc vị trí kho đã có hồ sơ. Trạng thái kho được cập nhật qua nghiệp vụ.</p>
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
          <label className="field-label">Loại kho<select aria-label="Loại kho" name="storageTypeId" defaultValue={first(record ?? {}, 'storageTypeId', 'storageType.id')} required><option value="">Chọn loại kho</option>{rows(options.data?.items).map(row => <option key={first(row, 'id')} value={first(row, 'id')}>{first(row, 'code')} · {first(row, 'name')}</option>)}</select></label>
          <label className="field-label">Mã kho<input name="unitNumber" defaultValue={first(record ?? {}, 'unitNumber', 'unitCode')} required maxLength={50} pattern={/^[A-Za-z0-9][A-Za-z0-9_\-]*$/.source} /></label>
          {field('floor', 'Tầng', false, false)}{field('zone', 'Khu', false, false)}{field('row', 'Hàng', true, false)}{field('position', 'Vị trí', true, false)}
        </>}
        <button className="button-primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu'}</button>
      </fieldset>
    </form>}
  </Modal>;
}
