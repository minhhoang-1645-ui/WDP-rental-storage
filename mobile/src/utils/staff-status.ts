/** Presentation only. Approved/confirmed never imply physical completion. */
export function staffStatusTone(status: string): 'warning' | 'information' | 'success' | 'danger' | 'neutral' {
  if (['REJECTED', 'FAILED', 'PAYMENT_FAILED', 'ERROR'].includes(status)) return 'danger';
  if (['COMPLETED', 'RESOLVED', 'SETTLED', 'PAID', 'VERIFIED', 'PASS'].includes(status)) return 'success';
  if (['IN_PROGRESS', 'INSPECTION_IN_PROGRESS', 'CONFIRMED', 'APPROVED', 'ASSIGNED', 'ACTIVE', 'CONTACTED', 'IN_REVIEW'].includes(status)) return 'information';
  if (['PENDING', 'OPEN', 'REQUESTED', 'PENDING_CONTACT', 'APPROVED_PENDING_PAYMENT', 'AWAITING_VERIFICATION', 'PENDING_SETTLEMENT', 'ISSUE_FOUND', 'ESCALATED', 'PENDING_REVIEW', 'READY_FOR_HANDOVER', 'PENDING_PAYMENT'].includes(status)) return 'warning';
  return 'neutral';
}
