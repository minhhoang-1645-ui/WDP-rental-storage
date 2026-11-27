import { describe, expect, it } from 'vitest';
import { fillReportBuckets, reportFilters } from './reporting.service.js';

describe('financial report calendar buckets', () => {
  it('fills confirmed gaps without changing totals and includes both day boundaries', () => {
    const data = new Map([
      ['2026-11-18', { date: '2026-11-18', rent: 200, received: 30, bookings: 2 }],
      ['2026-11-22', { date: '2026-11-22', rent: 100, received: 10, bookings: 1 }],
    ]);
    const times = fillReportBuckets(data, reportFilters({ from: '2026-11-01', to: '2026-11-30', group: 'day' }));
    expect(times).toHaveLength(30);
    expect(times[0]).toEqual({ date: '2026-11-01', rent: 0, received: 0, bookings: 0 });
    expect(times.at(-1)?.date).toBe('2026-11-30');
    expect(times.reduce((total, row) => total + row.rent + row.received + row.bookings, 0)).toBe(343);
  });
  it('uses observed months for open boundaries and fills a known empty period only', () => {
    const data = new Map([
      ['2026-10', { date: '2026-10', rent: 0, received: 20, bookings: 0 }],
      ['2026-12', { date: '2026-12', rent: 0, received: 40, bookings: 0 }],
    ]);
    expect(fillReportBuckets(data, reportFilters({})).map(row => row.date)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(fillReportBuckets(new Map(), reportFilters({ from: '2026-01-01' }))).toEqual([]);
    expect(fillReportBuckets(new Map(), reportFilters({ from: '2026-01-15', to: '2026-02-15' })))
      .toEqual([{ date: '2026-01', rent: 0, received: 0, bookings: 0 }, { date: '2026-02', rent: 0, received: 0, bookings: 0 }]);
  });
});
