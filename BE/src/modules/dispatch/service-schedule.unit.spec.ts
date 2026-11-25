import { expect, it } from 'vitest';
import { readServiceSchedule } from './service-schedule.js';

it('accepts an empty service policy without manufacturing capacity', () => {
  expect(readServiceSchedule([])).toEqual([]);
});

it('requires explicit positive capacity and rejects overlapping windows', () => {
  const window = { weekday: 3, starts: '08:00', ends: '12:00', capacity: 2 };
  expect(readServiceSchedule([window])).toEqual([window]);
  expect(() => readServiceSchedule([{ ...window, capacity: 0 }])).toThrow();
  expect(() => readServiceSchedule([window, { ...window, starts: '11:00', ends: '13:00' }])).toThrow();
  expect(readServiceSchedule([window, { ...window, starts: '12:00', ends: '13:00' }])).toHaveLength(2);
});
