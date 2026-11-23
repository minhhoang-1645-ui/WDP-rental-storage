import { text, object, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';

export const bookingStatusText: Record<string, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', REJECTED: 'Không được chấp thuận' };

export function bookingAmount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? formatMoney(value) : '';
}

export function bookingTerm(order: Row) {
  const quote = object(order.quote);
  const start = text(order, 'startDate');
  const end = text(order, 'endDateExclusive', 'endDate');
  const months = order.durationMonths ?? (quote.billingMode === 'MONTHLY' ? quote.termMonths : undefined);
  const days = quote.billableDays ?? (start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) : 0);
  const length = typeof months === 'number' && months > 0 ? `${months} tháng` : typeof days === 'number' && days > 0 ? `${days} ngày` : '';
  return { start: start ? formatDate(start) : '', end: end ? formatDate(end) : '', length, quantity: typeof order.quantity === 'number' && order.quantity > 0 ? `${order.quantity} ô kho` : '' };
}

export function bookingHoldDeadline(order: Row, invoice?: Row) {
  const expiresAt = text(order, 'expiresAt');
  return order.status === 'CONFIRMED' && invoice?.status === 'OPEN' && invoice.amountPaid === 0 && Number(invoice.balanceDue) > 0 && Number.isFinite(Date.parse(expiresAt)) ? expiresAt : '';
}
