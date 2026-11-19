export const EARLY_RETURN_SUBJECT = 'Đề nghị trả kho trước hạn';
export const isEarlyReturnRequest = (row: { subject?: unknown }) => row.subject === EARLY_RETURN_SUBJECT;

export function earlyReturnAppliesTo(row: { reservation: { id: string }; contract?: { id: string } | null }, reservationId: string, contractId: string) {
  return row.reservation.id === reservationId && (!row.contract || row.contract.id === contractId);
}

export function isCurrentEarlyReturnApproval(row: { subject?: unknown; status?: unknown; earlyReturnDecision?: unknown; earlyReturnForEndDate?: unknown }, endDate: string) {
  return isEarlyReturnRequest(row) && row.status === 'RESOLVED' && row.earlyReturnDecision === 'APPROVED' && row.earlyReturnForEndDate === endDate.slice(0, 10);
}
