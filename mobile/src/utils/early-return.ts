export const EARLY_RETURN_SUBJECT = 'Đề nghị trả kho trước hạn';
export const isEarlyReturnRequest = (row: { subject?: unknown }) => row.subject === EARLY_RETURN_SUBJECT;

export function isCurrentEarlyReturnApproval(row: { subject?: unknown; status?: unknown; earlyReturnDecision?: unknown; earlyReturnForEndDate?: unknown }, endDate: string) {
  return isEarlyReturnRequest(row) && row.status === 'RESOLVED' && row.earlyReturnDecision === 'APPROVED' && row.earlyReturnForEndDate === endDate.slice(0, 10);
}
