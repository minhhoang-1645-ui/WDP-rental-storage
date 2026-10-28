import { Text } from 'react-native';
import { formatDate } from '@/utils/format';
import { firstIssue } from './renewal-validation';
import { label, object, rows, text, type Row } from './model';
import { Facts, Panel, money, styles } from './ui';

export function RenewalReview({ row, audience = 'internal' }: { row: Row; audience?: 'internal' | 'customer' }) {
  const quote = object(row.quoteSnapshot), reservation = object(row.reservation), issue = firstIssue(row);
  return <Panel title={audience === 'customer' ? 'Chi tiết gia hạn của bạn' : 'Thông tin đối chiếu gia hạn'}><Facts values={[
    ['Mã gia hạn', row.renewalCode], ['Khách hàng', text(row, 'customer.fullName')], ['Yêu cầu đặt kho', reservation.reference], ['Loại kho', text(row, 'reservation.storageType.name')], ['Số kho', reservation.quantity],
    ['Hạn trước gia hạn (không bao gồm)', formatDate(text(row, 'previousEndDate'))], ['Gia hạn đến (không bao gồm)', formatDate(text(row, 'requestedEndDate'))], ['Số tháng', row.termMonths], ['Kế hoạch thanh toán', label(row.paymentPlan)],
    ['Đơn giá tháng / kho', money(quote.monthlyUnitPrice)], ['Tiền thuê trước giảm', money(quote.baseRentalAmount)], ['Tỷ lệ giảm', typeof quote.discountPercent === 'number' ? `${quote.discountPercent}%` : '—'], ['Giảm giá', money(quote.discountAmount)], ['Cọc thu thêm', money(quote.depositAmount)], ['Tổng gia hạn', money(quote.totalAmount)],
    ['Đã lập hóa đơn', money(object(row.billingSummary).totalInvoiced)], ['Đã thanh toán', money(object(row.billingSummary).totalPaid)], ['Dư nợ hóa đơn gia hạn', money(object(row.billingSummary).totalOutstanding)],
    ['Người yêu cầu', text(row, 'requestedBy.fullName', 'customer.fullName')], ['Ngày yêu cầu', formatDate(text(row, 'requestedAt'), true)],
    ['Người xét duyệt', text(row, 'reviewedBy.fullName') || (row.reviewedAt || row.approvedAt || row.rejectedAt ? row.approvedAt && !row.rejectedAt && Object.hasOwn(row, 'reviewedBy') && row.reviewedBy === null ? 'Hệ thống tự động' : 'Hồ sơ chưa cung cấp tên người xét duyệt' : 'Chưa xét duyệt')], ['Ngày xét duyệt', formatDate(text(row, 'reviewedAt', 'approvedAt', 'rejectedAt'), true)],
    ...rows(row.contracts).map(contract => [`Hợp đồng ${text(contract, 'contractCode')}`, `${text(contract, 'unitCode')} · Đến ${formatDate(text(contract, 'endDate'))} · ${label(contract.status)}`] as [string, unknown]),
  ]} /><Text style={styles.copy}>{row.paymentPlan === 'PREPAID' ? 'Trả trước: thanh toán đủ hóa đơn gia hạn để cập nhật thời hạn.' : 'Hàng tháng: thanh toán đủ hóa đơn gia hạn kỳ đầu để cập nhật thời hạn; các kỳ sau vẫn có thể còn dư nợ.'} Không thu cọc lần nữa.</Text>{audience === 'internal' && Boolean(issue) && row.status === 'PENDING' && <Text accessibilityRole="alert" style={styles.error}>{issue}</Text>}{row.status === 'COMPLETED' && <Text style={styles.copy}>{audience === 'customer' ? 'Gia hạn của bạn đã hoàn tất. Xem thời hạn mới trong Kho đang thuê.' : 'Thông tin dùng để đối chiếu khi lập phụ lục. Chưa có số phụ lục, phiên bản hoặc chữ ký trong hồ sơ này.'}</Text>}</Panel>;
}
