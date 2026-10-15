import type { OperationRecord } from '@/types/management';

export interface OperationAction {
  label: string;
  explanation: string;
  suffix: string;
  method: 'POST' | 'PATCH';
  body?: Record<string, string>;
  input?: { key: string; label: string; required: boolean };
  idempotent?: boolean;
}

export function actionsFor(resource: string, data: OperationRecord): OperationAction[] {
  if (resource === 'reservations' && data.status === 'PENDING') return [
    { label: 'Xác nhận đặt kho', explanation: 'Hệ thống sẽ kiểm tra và cấp kho cho toàn bộ thời gian thuê.', method: 'PATCH', suffix: 'status', body: { status: 'CONFIRMED' } },
    { label: 'Từ chối đặt kho', explanation: 'Yêu cầu này sẽ chuyển sang trạng thái đã từ chối.', method: 'PATCH', suffix: 'status', body: { status: 'REJECTED' } },
  ];
  if (resource === 'appointments' && data.status === 'REQUESTED') return [
    { label: 'Xác nhận lịch hẹn', explanation: 'Xác nhận lịch bàn giao đang hiển thị trong hồ sơ.', method: 'PATCH', suffix: 'confirm' },
  ];
  if (resource === 'renewals' && data.status === 'PENDING') return [
    { label: 'Duyệt gia hạn', explanation: 'Hệ thống kiểm tra lịch phân bổ và tạo hóa đơn gia hạn. Hợp đồng chỉ được kéo dài sau khi đủ điều kiện thanh toán.', method: 'POST', suffix: 'approve' },
    { label: 'Từ chối gia hạn', explanation: 'Ghi rõ lý do để khách hàng biết vì sao yêu cầu bị từ chối.', method: 'POST', suffix: 'reject', input: { key: 'reason', label: 'Lý do từ chối', required: true } },
  ];
  if (resource === 'maintenance' && data.status === 'AWAITING_VERIFICATION') return [
    { label: 'Nghiệm thu bảo trì', explanation: 'Xác nhận sửa chữa đạt yêu cầu và đưa kho trở lại trạng thái sẵn sàng.', method: 'POST', suffix: 'verify', idempotent: true, input: { key: 'note', label: 'Ghi chú nghiệm thu', required: false } },
    { label: 'Yêu cầu làm lại', explanation: 'Trả công việc cho nhân viên xử lý tiếp; kho vẫn trong bảo trì.', method: 'POST', suffix: 'reject-verification', idempotent: true, input: { key: 'note', label: 'Lý do yêu cầu làm lại', required: true } },
  ];
  if (resource === 'payment-submissions' && data.status === 'PENDING_VERIFICATION') return [
    { label: 'Xác minh đã nhận tiền', explanation: 'Chỉ xác nhận sau khi đối chiếu số tiền với giao dịch ngân hàng. Thao tác này sẽ ghi nhận thanh toán thật vào hóa đơn.', method: 'POST', suffix: 'verify', input: { key: 'reference', label: 'Mã giao dịch ngân hàng đã đối chiếu', required: true } },
    { label: 'Từ chối thông báo', explanation: 'Ghi lý do từ chối; số dư hóa đơn không thay đổi.', method: 'POST', suffix: 'reject', input: { key: 'reason', label: 'Lý do từ chối', required: true } },
  ];
  return [];
}
