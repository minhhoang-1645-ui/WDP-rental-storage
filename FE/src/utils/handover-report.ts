import { first, object, type Row } from '../components/manager/portal-data';

/** Read old reports without rewriting their evidence or exposing database IDs as names. */
export function handoverReportView(value: unknown) {
  const row = object(value), structured = object(row.handoverReport);
  if (Object.keys(structured).length) return structured;
  const text = first(row, 'handoverNote');
  if (!text.startsWith('BIÊN BẢN BÀN GIAO KHO')) return null;
  const lines = text.split(/\r?\n/);
  const read = (prefix: string) => lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
  const verified = lines.includes('Đã đối chiếu người nhận và kiểm tra các kho trong lịch.');
  const count = read('Số chìa khóa/thẻ:');
  const report: Row = {
    recipientName: read('Người nhận:'),
    customerName: first(row, 'reservation.customer.fullName') || read('Khách đứng tên:').replace(/\s+\([A-Za-z0-9_-]{15,}\)$/, ''),
    recipientType: read('Hình thức nhận:') === 'Người được ủy quyền' ? 'AUTHORIZED' : 'CUSTOMER',
    authorizationBasis: read('Căn cứ ủy quyền:'), condition: read('Hiện trạng:'),
    accessItemCount: /^\d+$/.test(count) ? Number(count) : null,
    identityVerified: verified, unitInspected: verified,
    accessDelivered: lines.includes('Đã bàn giao phương tiện/hướng dẫn truy cập.'),
    documentsDelivered: lines.includes('Đã giao giấy tờ bàn giao cho khách.'), note: read('Ghi chú:'),
  };
  return report;
}
