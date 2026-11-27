import { describe, expect, it } from 'vitest';
import { assessReturnNotice } from './return-notice.js';

const day = (value: string) => new Date(value + 'T00:00:00Z');
const contract = { startDate: day('2026-11-01'), endDate: day('2026-11-28') };
const policy = (value: number) => ({ pricingPolicy: { returnNotice: { version: 2, value } } });

describe('Staff return notice assessment', () => {
  it('reports an on-time return and insufficient notice independently', () => {
    const requestedAt = new Date('2026-11-27T17:00:00Z');
    expect(assessReturnNotice(policy(7), contract, { requestedAt, physicallyReturnedAt: day('2026-11-28') }))
      .toMatchObject({ requiredDays: 7, actualDays: 0, result: 'SHORT', timing: 'ON_TIME' });
  });

  it('compares an earlier scheduled return using the facility calendar day', () => {
    expect(assessReturnNotice(policy(7), contract, {
      requestedAt: day('2026-11-17'), inspectionScheduledAt: new Date('2026-11-23T17:00:00Z'),
    })).toMatchObject({
      expectedDate: '2026-11-24', expectedDateSource: 'INSPECTION_SCHEDULE', referenceDate: '2026-11-24',
      actualDays: 7, result: 'MET', timing: 'EARLY',
    });
  });

  it('uses the recorded physical date without giving extra notice for returning after the deadline', () => {
    expect(assessReturnNotice(policy(7), contract, {
      requestedAt: day('2026-11-23'), inspectionScheduledAt: day('2026-12-01'), physicallyReturnedAt: day('2026-12-04'),
      overdueSettlement: { physicalReturnDate: '2026-11-30' },
    })).toMatchObject({
      physicalDate: '2026-11-30', expectedDate: '2026-12-01', referenceDate: '2026-11-28',
      actualDays: 5, result: 'SHORT', timing: 'LATE',
    });
  });

  it('distinguishes missing policy, zero-day policy, and a short rental', () => {
    const record = { requestedAt: day('2026-11-28') };
    expect(assessReturnNotice({}, contract, record)).toMatchObject({
      requiredDays: null, result: 'UNKNOWN', timing: 'UNKNOWN', expectedDate: '2026-11-28', expectedDateSource: 'CONTRACT_END',
    });
    expect(assessReturnNotice(policy(0), contract, record)).toMatchObject({ requiredDays: 0, result: 'MET' });
    expect(assessReturnNotice(policy(7), { ...contract, startDate: day('2026-11-26') }, record))
      .toMatchObject({ requiredDays: 2, result: 'SHORT' });
  });
});
