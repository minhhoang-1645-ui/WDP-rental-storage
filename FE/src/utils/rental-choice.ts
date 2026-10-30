import { quotePeriod } from './quote-payment-summary';

type RentalSource = { id?: unknown; contractCode?: unknown; status?: unknown; storageType?: unknown; storageUnit?: unknown; unit?: unknown; startDate?: unknown; endDate?: unknown };
const object = (value: unknown): Record<string, unknown> => value && typeof value==='object' ? value as Record<string,unknown> : {};
const text = (value: unknown) => typeof value==='string' || typeof value==='number' ? String(value) : '';
export const normalizeRentalSearch = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
export function rentalChoice(source: RentalSource) {
  const type=object(source.storageType), unit=object(source.storageUnit ?? source.unit);
  const unitCode=text(unit.unitCode ?? unit.unitNumber) || 'Chưa có mã kho';
  const name=text(type.name) || 'Kho đang thuê';
  const floor=text(unit.floor).replace(/^ground(?: floor)?$/i,'Tầng trệt').replace(/^floor\s+(\d+)$/i,'Tầng $1');
  const location=[/^\d+$/.test(floor)?`Tầng ${floor}`:floor,text(unit.zone)?`Khu ${text(unit.zone)}`:''].filter(Boolean).join(' · ');
  const condition=['STANDARD','standard'].includes(text(type.condition))?'Tiêu chuẩn':['AIR_CONDITIONED','climate'].includes(text(type.condition))?'Điều hòa':'';
  const code=text(source.contractCode), period=quotePeriod(source.startDate,source.endDate);
  return {id:text(source.id),unitCode,name,code,location,condition,period,
    label:`Chọn kho ${unitCode} – ${name}`,
    search:normalizeRentalSearch([unitCode,name,code,location,condition,text(type.sizeName)].join(' '))};
}
