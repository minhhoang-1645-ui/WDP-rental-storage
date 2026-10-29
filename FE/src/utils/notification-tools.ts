import type { ActivityEntry } from './activity';

export const ACTIVITY_POLL_MS = 15_000;
export const ACTIVITY_READ_LIMIT = 4096;
export const DATA_PULSE_KEY = 'nestbox-data-updated-v1';
export const notificationKinds: Record<string, string> = {
  reservations: 'Đặt kho', contracts: 'Hợp đồng', invoices: 'Hóa đơn', 'payment-submissions': 'Xác nhận chuyển khoản',
  appointments: 'Bàn giao', renewals: 'Gia hạn', 'stock-movements': 'Nhập – xuất hàng', returns: 'Trả kho',
  'deposit-settlements': 'Tiền cọc', 'support-requests': 'Hỗ trợ và yêu cầu', maintenance: 'Bảo trì',
  inquiries: 'Tư vấn', transfers: 'Chuyển kho', users: 'Tài khoản', 'online-payment-reconciliations': 'Đối soát VNPay',
  'early-return-requests': 'Trả trước hạn',
};
export function notificationGroup(item: ActivityEntry) {
  if (item.kind === 'support-requests' && item.title.startsWith('Chuyển kho')) return 'transfers';
  if (item.kind === 'support-requests' && item.title.startsWith('Trả trước hạn')) return 'early-return-requests';
  return item.kind;
}
export const normalizeSearch = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
export function filterNotifications(entries: ActivityEntry[], read: string[], view: string, kind: string, search: string) {
  const seen = new Set(read), query = normalizeSearch(search);
  return entries.filter(item => (view === 'all' || (view === 'action' ? item.action : !seen.has(item.token)))
    && (kind === 'all' || notificationGroup(item) === kind)
    && (!query || normalizeSearch(`${item.code} ${item.title} ${item.message} ${notificationKinds[item.kind] ?? ''}`).includes(query)));
}
/** A badge counts actionable dossiers, not how many times a status was refreshed. */
export function actionCountForPath(entries: ActivityEntry[], path: string | readonly string[]) {
  const paths = typeof path === 'string' ? [path] : path;
  return new Set(entries.filter(item => item.action && paths.some(prefix => item.web.split('?')[0] === prefix || item.web.split('?')[0].startsWith(prefix + '/'))).map(item => item.id)).size;
}
export function newActivityCount(previous: ActivityEntry[], next: ActivityEntry[]) {
  const before = new Set(previous.map(item => item.token));
  return next.filter(item => !before.has(item.token)).length;
}
