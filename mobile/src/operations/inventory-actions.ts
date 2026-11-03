import type { FormAction, FormField } from './form';
import { text, type Row } from './model';

const number = (name: string, title: string, item?: Row, required = true, maximum = 100000): FormField => ({ name, title, numeric: true, required, minimum: 1, maximum, initial: text(item ?? {}, name) });
const field = (name: string, title: string, item?: Row, required = false, maxLength = 100): FormField => ({ name, title, required, maxLength, initial: text(item ?? {}, name) });
const description = 'Giá mới áp dụng cho báo giá mới. Chỉ đổi cấu trúc, vị trí khi kho chưa có hồ sơ.';

export function storageTypeAction(item: Row | undefined, facilities: Row[]): FormAction {
  return {
    title: item ? 'Sửa loại kho & giá' : 'Thêm loại kho', description,
    path: `/manager/storage-types${item ? `/${encodeURIComponent(text(item, 'id'))}` : ''}`, method: item ? 'PATCH' : 'POST',
    fields: [
      { ...field('facilityId', 'Cơ sở', item, true), fixed: Boolean(item), choices: facilities.map(row => ({ value: text(row, 'id'), label: text(row, 'name') })) },
      { ...field('code', 'Mã loại kho', item, true, 50), fixed: Boolean(item) }, field('name', 'Tên loại kho', item, true, 120),
      { ...field('sizeId', 'Nhóm kho', item, true), initial: text(item ?? {}, 'sizeId') || 'small', choices: [['locker', 'Tủ lưu trữ'], ['small', 'Kho nhỏ'], ['medium', 'Kho vừa'], ['large', 'Kho lớn']].map(([value, label]) => ({ value, label })) },
      { ...field('condition', 'Điều kiện', item, true), initial: text(item ?? {}, 'condition') || 'STANDARD', choices: [{ value: 'STANDARD', label: 'Tiêu chuẩn' }, { value: 'AIR_CONDITIONED', label: 'Điều hòa' }] },
      number('widthCm', 'Rộng (cm)', item), number('lengthCm', 'Dài (cm)', item), number('heightCm', 'Cao (cm)', item),
      number('monthlyRate', 'Giá tháng (VND)', item, true, 9999999999),
      { name: 'allowDailyRental', title: 'Cho thuê theo ngày', checkbox: true, initial: String(item?.allowDailyRental ?? false) },
      number('minRentalDays', 'Số ngày tối thiểu khi thuê ngày', item, false, 30),
      field('image', 'URL ảnh (tùy chọn)', item, false, 2000), field('imageAlt', 'Mô tả ảnh', item, false, 300),
    ],
    transform: input => ({ ...input, image: input.image ?? '', imageAlt: input.imageAlt ?? '', minRentalDays: input.minRentalDays ?? null, ...(item ? { expectedUpdatedAt: item.updatedAt } : {}) }),
  };
}

export function unitAction(item?: Row): FormAction {
  return {
    title: item ? 'Sửa thông tin kho' : 'Thêm kho', description,
    path: `/manager/units${item ? `/${encodeURIComponent(text(item, 'id'))}` : ''}`, method: item ? 'PATCH' : 'POST',
    fields: [
      { name: 'storageTypeId', title: 'Loại kho', required: true, initial: text(item ?? {}, 'storageTypeId', 'storageType.id'), optionsPath: '/manager/storage-types', optionLabel: row => `${text(row, 'code')} · ${text(row, 'name')}` },
      { ...field('unitNumber', 'Mã kho', item, true, 50), initial: text(item ?? {}, 'unitNumber', 'unitCode') },
      field('floor', 'Tầng', item), field('zone', 'Khu', item), number('row', 'Hàng', item, false), number('position', 'Vị trí', item, false),
    ],
    transform: input => ({ ...input, floor: input.floor ?? null, zone: input.zone ?? null, row: input.row ?? null, position: input.position ?? null, ...(item ? { expectedUpdatedAt: item.updatedAt } : {}) }),
  };
}
