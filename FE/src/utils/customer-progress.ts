import { activityText, type ActivityData, type ActivityRow } from './activity';
import { paymentWindowClosed } from './payment-state';

export const rentalSteps = ['Đặt kho', 'Ký hợp đồng', 'Thanh toán', 'Nhận kho', 'Sử dụng kho', 'Trả kho & tiền cọc'];
export function customerProgress(reservation: ActivityRow, data: ActivityData) {
  const id = activityText(reservation, 'id'), reference = activityText(reservation, 'reference') || id;
  const identifiers = new Set([id, reference].filter(Boolean));
  const belongs = (row: ActivityRow) => [activityText(row, 'reservation.id'), activityText(row, 'reservation.reference'), activityText(row, 'reservationId')].some(value => identifiers.has(value));
  const contracts = (data.contracts ?? []).filter(belongs), invoices = (data.invoices ?? []).filter(belongs);
  const initial = invoices.find(row => row.type === 'INITIAL');
  const appointment = (data.appointments ?? []).find(row => belongs(row) && ['REQUESTED', 'CONFIRMED'].includes(String(row.status)));
  const completedHandover = (data.appointments ?? []).find(row => belongs(row) && row.status === 'COMPLETED');
  const returned = (data.returns ?? []).find(row => belongs(row) && row.status !== 'CANCELLED');
  const query = encodeURIComponent(reference), detail = `/customer/reservations/${encodeURIComponent(id)}`;
  const result = (stage: number, title: string, message: string, to: string, cta: string, closed = false) => ({ stage, title, message, to, cta, closed, reference, contracts });
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(String(reservation.status))) return result(-1, ({ CANCELLED: 'Đơn đã hủy', REJECTED: 'Đơn chưa được chấp thuận', EXPIRED: 'Đã hết thời gian giữ kho' } as Record<string, string>)[String(reservation.status)], 'Xem kết quả trong hồ sơ. Nếu đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu trước khi đặt lại.', detail, 'Xem kết quả', true);
  if (returned) return result(returned.status === 'COMPLETED' ? 6 : 5, returned.status === 'COMPLETED' ? 'Đã hoàn tất trả kho' : 'Đang xử lý trả kho và tiền cọc', 'Xem kết quả kiểm tra, khoản cần thanh toán và tiến độ quyết toán tiền cọc.', '/customer/returns', 'Theo dõi trả kho & cọc');
  if (contracts.some(row => row.status === 'ACTIVE')) return result(4, 'Kho của bạn đang sử dụng', 'Gửi hoặc lấy hàng, xem thời hạn, gia hạn và gửi hỗ trợ ngay từ kho đang thuê.', `/customer/rentals?reservation=${query}`, 'Mở kho đang thuê');
  if (completedHandover && contracts.length === Number(reservation.quantity) && contracts.every(row => row.status === 'READY_FOR_HANDOVER')) return result(4, 'Đã nhận kho, chờ ngày bắt đầu thuê', 'Bạn đã hoàn tất bàn giao. Kho sẽ được kích hoạt khi đến ngày bắt đầu thuê; lúc đó bạn có thể đưa hàng vào.', `/customer/appointments?reservation=${query}`, 'Xem lịch bàn giao');
  if (reservation.status === 'PENDING') return result(0, 'NestBox đang kiểm tra yêu cầu', 'Bạn đã gửi đơn. Nhân viên sẽ xử lý các điều kiện chưa thể xác nhận tự động; kết quả sẽ cập nhật tại đây.', detail, 'Theo dõi yêu cầu');
  if (contracts.length && contracts.every(row => row.status === 'COMPLETED')) return result(6, 'Kỳ thuê đã kết thúc', 'Xem hợp đồng, lịch sử đặt kho và hồ sơ tiền cọc để đối chiếu kết quả.', '/customer/booking-history', 'Xem lịch sử thuê');
  if (contracts.length === Number(reservation.quantity) && contracts.every(row => row.status === 'READY_FOR_HANDOVER')) {
    if (contracts.some(row => Date.parse(`${activityText(row, 'endDate').slice(0, 10)}T00:00:00+07:00`) <= Date.now())) return result(3, 'Cần kiểm tra lại kỳ thuê', 'Kỳ thuê đã đến hạn. Xem hợp đồng và gửi hỗ trợ để NestBox kiểm tra trước khi đặt lịch nhận kho.', `/customer/contracts?reservation=${query}`, 'Kiểm tra hợp đồng');
    return appointment ? result(3, appointment.status === 'CONFIRMED' ? 'Lịch nhận kho đã được xác nhận' : 'Lịch nhận kho đang chờ xác nhận', 'Kiểm tra thời gian hẹn và đến cơ sở nhận kho. Kho chuyển sang đang sử dụng sau khi nhân viên hoàn tất bàn giao.', `/customer/appointments?reservation=${query}`, 'Xem lịch nhận kho')
      : result(3, 'Bạn có thể đặt lịch nhận kho', 'Hợp đồng và thanh toán đã đủ điều kiện. Chọn lịch nhận kho phù hợp rồi đến cơ sở theo giờ được xác nhận.', `/customer/appointments?reservation=${query}`, 'Đặt lịch nhận kho');
  }
  if (initial?.status === 'VOID') return result(2, 'Hóa đơn đã hủy', 'Hóa đơn này không còn nhận thanh toán. Nếu bạn đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu.', `/customer/support?reservation=${query}`, 'Gửi hỗ trợ về hóa đơn');
  if (initial && paymentWindowClosed(initial)) return result(2, 'Cần kiểm tra thời hạn thanh toán', 'Thời gian giữ kho đã kết thúc. Mở hóa đơn kiểm tra; nếu đã chuyển tiền, gửi hỗ trợ để đối chiếu.', `/customer/payments?reservation=${query}`, 'Kiểm tra hóa đơn');
  if (!contracts.length || contracts.length < Number(reservation.quantity)) return result(1, 'Đang kiểm tra bộ hợp đồng', 'Đơn đã được xác nhận. Xem hồ sơ để kiểm tra các hợp đồng được lập cho số kho đã đặt.', `/customer/contracts?reservation=${query}`, 'Kiểm tra hợp đồng');
  const unsigned = contracts.filter(row => !activityText(row, 'terms.acceptedAt') && row.status === 'PENDING_PAYMENT');
  if (unsigned.length) return result(1, `Cần ký ${unsigned.length} hợp đồng`, 'Đọc và vẽ chữ ký trên từng hợp đồng. Hoàn tất ký trước khi thanh toán cho đơn này.', `/customer/contracts?reservation=${query}`, 'Đọc và ký hợp đồng');
  if (initial?.status === 'PAID') return result(3, 'Thanh toán đã được ghi nhận', 'Kiểm tra hợp đồng và điều kiện bàn giao để tiếp tục nhận kho; không cần thanh toán lại khoản đã xác nhận.', `/customer/contracts?reservation=${query}`, 'Kiểm tra bước nhận kho');
  const pending = initial && (data['payment-submissions'] ?? []).some(row => activityText(row, 'invoice.id') === activityText(initial, 'id') && row.status === 'PENDING_VERIFICATION');
  if (pending) return result(2, 'Đang đối chiếu khoản chuyển của bạn', 'NestBox đã nhận thông báo chuyển khoản. Chờ xác nhận tiền thực nhận; bạn chưa cần chuyển thêm cho cùng khoản.', `/customer/payments?reservation=${query}&view=submissions`, 'Theo dõi xác nhận thanh toán');
  return result(2, 'Xem hóa đơn và thanh toán', 'Kiểm tra số tiền còn lại, hạn trả và kênh đang khả dụng. Hóa đơn chỉ hoàn tất khi khoản thu được xác nhận.', `/customer/payments?reservation=${query}`, 'Mở hóa đơn thanh toán');
}
