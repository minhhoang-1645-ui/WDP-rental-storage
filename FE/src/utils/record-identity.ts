import { at, code, customer, date, first, object, rows, type Row } from '../components/manager/portal-data';

/** Presentation only: read explicit objects returned by APIs; never match code prefixes. */
export function recordIdentity(row: Row, resource: string) {
  const typeName = first(row, 'product.name', 'storageType.name', 'reservation.storageType.name', 'reservation.product.name', 'rentalContract.storageType.name', 'unit.storageType.name', 'fromUnit.storageType.name');
  const candidates = [row.storageUnit, row.unit, row.currentStorageUnit, at(row, 'rentalContract.storageUnit'), row.fromUnit, ...rows(row.allocatedUnits), ...rows(row.units), ...rows(row.contracts).map(contract => contract.unit ?? contract.storageUnit)];
  const unitCodes = [...new Set(candidates.map(value => first(object(value), 'unitCode', 'unitNumber', 'storageUnit.unitCode', 'storageUnit.unitNumber')).filter(Boolean))];
  const location = unitCodes.join(', ');
  const quantity = first(row, 'quantity', 'reservation.quantity');
  const start = first(row, 'startDate', 'reservation.startDate', 'rentalContract.startDate', 'billingPeriodStart');
  const end = first(row, 'endDateExclusive', 'endDate', 'effectiveEndDate', 'reservation.endDate', 'rentalContract.endDate', 'billingPeriodEnd');
  const period = start || end ? `${date(start)} – ${date(end)}` : '';
  const kind: Record<string, string> = { contracts: 'Hợp đồng', invoices: 'Hóa đơn', appointments: 'Bàn giao', 'stock-movements': row.type === 'OUT' ? 'Xuất hàng' : 'Nhập hàng', renewals: 'Gia hạn', returns: 'Trả kho', transfers: 'Chuyển kho', 'deposit-settlements': 'Quyết toán cọc' };
  const title = ['reservations', 'inquiries', 'rentals'].includes(resource) ? typeName || 'Thuê kho' : kind[resource] ? `${kind[resource]} · ${location || typeName || 'Thuê kho'}` : first(row, 'subject', 'storageType.name') || code(row);
  return { title, person: first(customer(row), 'fullName'), typeName, location, quantity: quantity ? `${quantity} kho` : '', period, created: row.createdAt ? date(row.createdAt, true) : '' };
}

/** Missing timestamps remain unknown and sort after actual dates; equal dates keep API order. */
export function newestFirst<T extends { createdAt?: unknown }>(items: readonly T[]): T[] {
  const time = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  return [...items].sort((a, b) => time(b.createdAt) - time(a.createdAt));
}

export function isJustCreated(row: { id: string; createdAt?: unknown }, savedId: string | null, now = Date.now()) {
  if (savedId !== row.id || typeof row.createdAt !== 'string') return false;
  const age = now - Date.parse(row.createdAt);
  return age >= 0 && age <= 15 * 60 * 1000;
}
export const lastCreatedKey = (userId: string) => `nestbox-last-reservation:${userId}`;
