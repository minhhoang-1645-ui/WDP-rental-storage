export type WorkPhase = 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'STAFF_DONE';
export type WaitReason = 'CUSTOMER' | 'MANAGER' | 'SCHEDULE' | 'SAFETY' | 'RENTAL_REQUIREMENTS';
export type WorkKind = 'appointments' | 'transfers' | 'returns' | 'support-requests' | 'maintenance' | 'damage-claims';

type Work = {
  status: string;
  assignedStaffUserId?: string | null;
  scheduledAt?: Date | null;
  physicallyReturnedAt?: Date | null;
  staffFacts?: unknown;
  bookingReady?: boolean;
  safetyBlocked?: boolean;
  handoverStarted?: boolean;
  problemPending?: boolean;
  awaitingCustomer?: boolean;
};

export function workPhase(kind: WorkKind, work: Work, now = new Date()): { phase: WorkPhase; waitReason?: WaitReason } {
  if (['COMPLETED', 'RESOLVED', 'REJECTED', 'CANCELLED'].includes(work.status)
    || kind === 'returns' && (work.physicallyReturnedAt || work.status === 'PENDING_SETTLEMENT')
    || kind === 'damage-claims' && work.staffFacts) return { phase: 'STAFF_DONE' };
  if (kind === 'appointments' && work.safetyBlocked) return { phase: 'WAITING', waitReason: 'SAFETY' };
  if (kind === 'appointments' && work.bookingReady === false) return { phase: 'WAITING', waitReason: 'RENTAL_REQUIREMENTS' };
  if (kind === 'appointments' && work.status === 'REQUESTED'
    || kind === 'transfers' && (work.status === 'REQUESTED' || work.problemPending)
    || kind === 'support-requests' && work.status === 'ESCALATED'
    || kind === 'maintenance' && work.status === 'AWAITING_VERIFICATION') return { phase: 'WAITING', waitReason: 'MANAGER' };
  if (work.awaitingCustomer) return { phase: 'WAITING', waitReason: 'CUSTOMER' };
  if ((kind === 'appointments' || kind === 'returns' && work.status === 'REQUESTED') && !work.handoverStarted && work.scheduledAt && work.scheduledAt > now) {
    return { phase: 'WAITING', waitReason: 'SCHEDULE' };
  }
  if (!work.assignedStaffUserId) return { phase: 'UNASSIGNED' };
  if (work.handoverStarted || ['IN_PROGRESS', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(work.status)) {
    return { phase: 'IN_PROGRESS' };
  }
  return { phase: 'ASSIGNED' };
}
