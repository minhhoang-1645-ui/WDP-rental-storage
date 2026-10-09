export interface DerivedOverdueState {
  effectiveEndDate: string;
  isOverdue: boolean;
  overdueSince: string | null;
  rentalState: 'ACTIVE' | 'OVERDUE';
}

export function deriveOverdueState(effectiveEndDate: Date, now = new Date()): DerivedOverdueState {
  const end = effectiveEndDate.toISOString().slice(0, 10);
  const isOverdue = now.getTime() >= effectiveEndDate.getTime();
  return { effectiveEndDate: end, isOverdue, overdueSince: isOverdue ? end : null, rentalState: isOverdue ? 'OVERDUE' : 'ACTIVE' };
}
