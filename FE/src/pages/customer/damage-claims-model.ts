import { date } from '../../components/manager/portal-data';

export type ClaimRole = 'CUSTOMER' | 'STAFF' | 'MANAGER';
export type CashCompensation = {
  status: 'NONE' | 'PENDING_REVIEW' | 'AWAITING_HANDOVER' | 'HANDED_OVER';
  approvedCompensationAmount: number | null;
  paidCompensationAmount: number | null;
  method: 'CASH' | null;
  handedOverAt: string | null;
  approvalReason?: string;
  approvedAt?: string;
  approvedBy?: string;
  deliveredBy?: string;
  receivedBy?: string;
  handoverNote?: string;
  recordedBy?: string;
  recordedAt?: string;
};
export type Claim = {
  id: string;
  claimCode: string;
  status: 'REPORTED' | 'INVESTIGATING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  discoveredOn: string;
  unitCodeSnapshot: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  estimatedValue: number | null;
  affectedItems: { id: string; name: string; unit: string }[];
  evidenceLinks: string[];
  evidencePhotos?: string[] | null;
  staffFacts: string | null;
  factsRecordedAt?: string;
  decisionReason: string | null;
  resolutionNote: string | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  customer?: { fullName: string; phone?: string };
  rentalContract?: { contractCode: string };
  assignedStaff?: { id: string; fullName: string; accountStatus?: string } | null;
  compensation?: CashCompensation;
  history?: { role: string; at: string; action?: string; to?: string; actorName?: string }[];
};

export function claimTitle(description: string) {
  const title = description.trim().replace(/\s+/g, ' ');
  return title.length > 90 ? title.slice(0, 87).trimEnd() + '…' : title;
}

export function claimStatus(claim: Claim, role: ClaimRole) {
  if (claim.status === 'RESOLVED') return 'Hoàn tất';
  if (role === 'MANAGER') {
    if (['REPORTED', 'INVESTIGATING'].includes(claim.status) && !claim.assignedStaff) return 'Chờ phân công';
    if (claim.status === 'INVESTIGATING') return claim.staffFacts ? 'Chờ quyết định' : 'Chờ kiểm tra';
  }
  if (claim.compensation?.status === 'AWAITING_HANDOVER') return 'Chờ giao tiền';
  if (claim.compensation?.status === 'HANDED_OVER') return 'Đã giao tiền';
  return {
    REPORTED: role === 'CUSTOMER' ? 'Đã tiếp nhận' : 'Chờ kiểm tra',
    INVESTIGATING: 'Đang xử lý',
    APPROVED: 'Đã chấp thuận',
    REJECTED: 'Đã từ chối',
  }[claim.status];
}

export function claimDate(value: string | undefined | null, includeTime = false) {
  if (!value) return '—';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : date(value, includeTime);
}

export const claimRoleLabels: Record<string, string> = { CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', MANAGER: 'Quản lý' };
export const claimEventLabels: Record<string, string> = {
  ASSIGNED: 'Phân công nhân viên', INSPECTED: 'Lưu kết quả kiểm tra', DECIDED: 'Lưu quyết định',
  'amend-decision': 'Sửa lý do quyết định', 'amend-resolution': 'Sửa kết quả đã thông báo',
  NOTIFIED: 'Thông báo kết quả', RESOLVED: 'Hoàn tất hồ sơ', CASH_HANDED_OVER: 'Ghi nhận giao tiền mặt',
  INVESTIGATING: 'Lưu kết quả kiểm tra', APPROVED: 'Chấp thuận hướng xử lý', REJECTED: 'Từ chối đề nghị',
};
