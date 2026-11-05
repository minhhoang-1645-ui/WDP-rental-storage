import { businessDate } from '../../business-date.js';
export interface DerivedOverdueState {
  effectiveEndDate: string;
  isOverdue: boolean;
  overdueSince: string | null;
  rentalState: 'ACTIVE' | 'OVERDUE';
}

export function deriveOverdueState(effectiveEndDate: Date, now = new Date()): DerivedOverdueState {
  const end = effectiveEndDate.toISOString().slice(0, 10);
  const isOverdue = businessDate(now) >= end;
  return { effectiveEndDate: end, isOverdue, overdueSince: isOverdue ? end : null, rentalState: isOverdue ? 'OVERDUE' : 'ACTIVE' };
}
