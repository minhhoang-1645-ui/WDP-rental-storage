import { expect, it, vi } from 'vitest';
import { assessHandoverWindow, readServiceSchedule } from './service-schedule.js';

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

it('uses Vietnam access hours for manual confirmation without querying shifts or capacity', async () => {
  const tx = {
    $queryRawUnsafe: vi.fn(),
    facility: { findUniqueOrThrow: vi.fn().mockResolvedValue({
      serviceSchedule: [], accessHours: '22:00–06:00 (qua nửa đêm), Chủ nhật',
    }) },
    staffShift: { count: vi.fn() }, handoverAppointment: { count: vi.fn() }, returnRequest: { count: vi.fn() },
  };
  const assess = (at: string) => assessHandoverWindow(tx as never, 'facility', new Date(at));
  await expect(assess('2026-11-22T17:00:00Z')).resolves.toBe('MANAGER_CONFIRMATION_REQUIRED');
  await expect(assess('2026-11-23T05:59:59+07:00')).resolves.toBe('MANAGER_CONFIRMATION_REQUIRED');
  await expect(assess('2026-11-23T06:00:00+07:00')).rejects.toThrow('nằm trong giờ khách truy cập');
  await expect(assess('2026-11-24T05:59:00+07:00')).rejects.toThrow('nằm trong giờ khách truy cập');
  expect(tx.staffShift.count).not.toHaveBeenCalled();
  expect(tx.handoverAppointment.count).not.toHaveBeenCalled();
  expect(tx.returnRequest.count).not.toHaveBeenCalled();
  tx.facility.findUniqueOrThrow.mockResolvedValue({ serviceSchedule: [], accessHours: 'Theo lịch hẹn' });
  await expect(assess('2026-11-23T05:00:00+07:00')).rejects.toThrow('cần thiết lập giờ khách truy cập');
});

it('keeps configured windows subject to both planned staff and shared capacity', async () => {
  const tx = {
    $queryRawUnsafe: vi.fn(),
    facility: { findUniqueOrThrow: vi.fn().mockResolvedValue({
      accessHours: '24/7', serviceSchedule: [{ weekday: 1, starts: '22:00', ends: '24:00', capacity: 2 }],
    }) },
    staffShift: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValue(1) },
    handoverAppointment: { count: vi.fn().mockResolvedValue(1) },
    returnRequest: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValue(0) },
  };
  const assess = (time: string) => assessHandoverWindow(tx as never, 'facility', new Date(time));
  await expect(assess('2026-11-23T23:59:00+07:00')).resolves.toBe('NO_PLANNED_STAFF');
  await expect(assess('2026-11-23T23:59:00+07:00')).resolves.toBe('CAPACITY_REACHED');
  await expect(assess('2026-11-23T23:59:00+07:00')).resolves.toBe('CONFIRMED');
  await expect(assess('2026-11-24T00:00:00+07:00')).resolves.toBe('NO_SERVICE_WINDOW');
});
