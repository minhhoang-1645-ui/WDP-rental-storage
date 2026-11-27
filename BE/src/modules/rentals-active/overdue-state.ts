import { businessToday, daysAfterRentalEnd } from '../../business-date.js';
export interface DerivedOverdueState {
  effectiveEndDate: string;
  isOverdue: boolean;
  overdueDays: number;
  overdueSince: string | null;
  rentalState: 'ACTIVE' | 'OVERDUE';
}

export function deriveOverdueState(effectiveEndDate: Date, now = new Date()): DerivedOverdueState {
  const end = effectiveEndDate.toISOString().slice(0, 10);
  const overdueDays = daysAfterRentalEnd(effectiveEndDate, businessToday(now));
  const isOverdue = overdueDays > 0;
  const overdueSince = isOverdue ? new Date(+effectiveEndDate + 86_400_000).toISOString().slice(0, 10) : null;
  return { effectiveEndDate: end, isOverdue, overdueDays, overdueSince, rentalState: isOverdue ? 'OVERDUE' : 'ACTIVE' };
}
