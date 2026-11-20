export const EARLY_RETURN_SUBJECT = 'Đề nghị trả kho trước hạn';
export const isEarlyReturnRequest = (row: { subject?: unknown }) => row.subject === EARLY_RETURN_SUBJECT;

export const EARLY_RETURN_PAYMENT_MESSAGE = 'Khách trả tiền các kỳ đã sử dụng và kỳ hiện tại. Các kỳ chưa bắt đầu được miễn sau khi bàn giao kho.';

const systemApprovalMessages = [
  'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ hóa đơn liên quan đến kho này, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu và bàn giao lại kho.',
  'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ toàn bộ công nợ, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu trả kho và bàn giao lại kho.',
  'Đã chấp thuận trả trước hạn. Các kỳ chưa bắt đầu được điều chỉnh khi hoàn tất bàn giao.',
  'Bạn thanh toán các kỳ đã sử dụng và kỳ hiện tại. Các kỳ chưa bắt đầu sẽ được miễn sau khi hoàn tất bàn giao kho.',
  'NestBox sẽ đối chiếu điều khoản hợp đồng trước khi áp dụng quyết toán theo kỳ.',
];

export function earlyReturnManagerNote(resolutionNote: string) {
  const saved = resolutionNote.trim();
  const prefix = systemApprovalMessages.find(message => saved.startsWith(message));
  return prefix ? saved.slice(prefix.length).trim() : saved;
}

export function earlyReturnAppliesTo(row: { reservation: { id: string }; contract?: { id: string } | null }, reservationId: string, contractId: string) {
  return row.reservation.id === reservationId && (!row.contract || row.contract.id === contractId);
}

export function isCurrentEarlyReturnApproval(row: { subject?: unknown; status?: unknown; earlyReturnDecision?: unknown; earlyReturnForEndDate?: unknown }, endDate: string) {
  return isEarlyReturnRequest(row) && row.status === 'RESOLVED' && row.earlyReturnDecision === 'APPROVED' && row.earlyReturnForEndDate === endDate.slice(0, 10);
}
