import { businessDate, isIsoCalendarDate } from '../../business-date.js';
import { contractReturnNoticeDays } from '../policies/pricing-policy.js';

export function assessReturnNotice(snapshot: unknown, contract: { startDate: Date; endDate: Date }, record: {
  requestedAt: Date;
  expectedReturnDate?: Date | null;
  inspectionScheduledAt?: Date | null;
  physicallyReturnedAt?: Date | null;
  overdueSettlement?: { physicalReturnDate?: unknown } | null;
}) {
  const endDate = contract.endDate.toISOString().slice(0, 10);
  const expectedDate = record.expectedReturnDate?.toISOString().slice(0, 10);
  const scheduledDate = record.inspectionScheduledAt ? businessDate(record.inspectionScheduledAt) : null;
  const recordedDate = record.overdueSettlement?.physicalReturnDate;
  const physicalDate = record.physicallyReturnedAt
    ? typeof recordedDate === 'string' && isIsoCalendarDate(recordedDate) ? recordedDate : businessDate(record.physicallyReturnedAt)
    : null;
  const returnDate = physicalDate ?? expectedDate ?? scheduledDate;
  // An appointment after the rental ends does not extend the notice deadline.
  const referenceDate = returnDate && returnDate < endDate ? returnDate : endDate;
  const requestedDate = businessDate(record.requestedAt);
  const actualDays = Math.max(0, (Date.parse(referenceDate) - Date.parse(requestedDate)) / 86_400_000);
  const requiredDays = contractReturnNoticeDays(snapshot, contract.startDate, contract.endDate);

  return {
    requiredDays,
    actualDays,
    referenceDate,
    expectedDate: expectedDate ?? scheduledDate ?? endDate,
    expectedDateSource: expectedDate ? 'CUSTOMER' : scheduledDate ? 'INSPECTION_SCHEDULE' : 'CONTRACT_END',
    physicalDate,
    timing: !returnDate ? 'UNKNOWN' : returnDate < endDate ? 'EARLY' : returnDate === endDate ? 'ON_TIME' : 'LATE',
    result: requiredDays === null ? 'UNKNOWN' : actualDays >= requiredDays ? 'MET' : 'SHORT',
  };
}
