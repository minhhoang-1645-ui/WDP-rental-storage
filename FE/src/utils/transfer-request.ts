import { first, type Row } from '../components/manager/portal-data';

export function isCustomerTransferSubject(subject: unknown) {
  return typeof subject === 'string' && /chuyen (doi )?kho/.test(subject.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'));
}

export function isTransferRequest(row: { subject?: unknown; resolutionType?: unknown }) {
  return row.resolutionType === 'TRANSFER_RECOMMENDED' || isCustomerTransferSubject(row.subject);
}
export const transferDestinationPath = (id: string) => `/manager/transfers/${encodeURIComponent(id)}/destinations`;

export function transferLocation(unit: Row) {
  return [first(unit, 'floor'), first(unit, 'zone') && 'Khu ' + first(unit, 'zone'), unit.row != null && `Dãy ${unit.row}`, unit.position != null && `Vị trí ${unit.position}`].filter(Boolean).join(' · ');
}
