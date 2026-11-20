export const EARLY_RETURN_SUBJECT = 'Đề nghị trả kho trước hạn';
export const PERIOD_CLOSEOUT = 'PERIOD_CLOSEOUT_V1';
export const EARLY_RETURN_APPROVAL_MESSAGE = 'Bạn thanh toán các kỳ đã sử dụng và kỳ hiện tại. Các kỳ chưa bắt đầu sẽ được miễn sau khi hoàn tất bàn giao kho.';

const previousApprovalMessages = [
  'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ hóa đơn liên quan đến kho này, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu và bàn giao lại kho.',
  'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ toàn bộ công nợ, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu trả kho và bàn giao lại kho.',
  'Đã chấp thuận trả trước hạn. Các kỳ chưa bắt đầu được điều chỉnh khi hoàn tất bàn giao.',
  'NestBox sẽ đối chiếu điều khoản hợp đồng trước khi áp dụng quyết toán theo kỳ.',
];

export function earlyReturnApprovalNote(note: string | null) {
  const saved = note?.trim() ?? '';
  const prefix = [EARLY_RETURN_APPROVAL_MESSAGE, ...previousApprovalMessages].find(text => saved.startsWith(text));
  const managerNote = (prefix ? saved.slice(prefix.length) : saved).trim();
  return [EARLY_RETURN_APPROVAL_MESSAGE, managerNote].filter(Boolean).join(' ');
}

export function earlyReturnScope(id: string, endDate: string) {
  return `early-return:${id}:${endDate}`;
}
