import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from './generated/prisma/client.js';
import { businessDate, businessToday } from './business-date.js';
import { PricingService } from './modules/pricing/pricing.service.js';
import { BookingService } from './modules/booking/booking.service.js';
import { ManagerService } from './modules/manager/manager.service.js';
import { deriveOverdueState } from './modules/rentals-active/overdue-state.js';

afterEach(() => vi.useRealTimers());
describe('Vietnam facility calendar boundaries, without a live database', () => {
  it.each([
    ['2026-11-05T16:59:59.999Z', '2026-11-05'],
    ['2026-11-05T17:00:00.000Z', '2026-11-06'],
    ['2026-12-31T17:00:00.000Z', '2027-01-01'],
    ['2028-02-28T17:00:00.000Z', '2028-02-29'],
  ])('uses the facility calendar at %s', (instant, day) => {
    expect(businessDate(new Date(instant))).toBe(day);
    expect(businessToday(new Date(instant)).toISOString()).toBe(day + 'T00:00:00.000Z');
  });
  it('pricing and booking both reject yesterday immediately after Vietnamese midnight', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T17:00:00Z'));
    const product = { id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(650000), allowDailyRental: true, minRentalDays: 1 };
    const prisma = { storageType: { findUnique: vi.fn(async () => product) } };
    const pricing = new PricingService(prisma as never), booking = new BookingService(prisma as never);
    const input = { storageTypeId: 'type', startDate: '2026-11-05', endDate: '2027-02-05', quantity: 1, paymentPlan: 'PAY_MONTHLY' };
    await expect(pricing.quote(input)).rejects.toThrow('quá khứ');
    await expect(booking.checkAvailability({ productId: 'type', ...input, periodMode: 'duration', durationMonths: 3 })).rejects.toThrow('Ngày bắt đầu');
    const today = { ...input, startDate: '2026-11-06', endDate: '2027-02-06' };
    await expect(pricing.quote(today)).resolves.toMatchObject({ startDate: today.startDate, endDate: today.endDate });
    const validate = booking as unknown as { validateDraft: (value: Record<string, unknown>) => Promise<unknown> };
    await expect(validate.validateDraft({ productId: 'type', ...today, periodMode: 'duration', durationMonths: 3 })).resolves.toMatchObject({ draft: { startDate: today.startDate } });
  });
  it('marks the exclusive end date as overdue at midnight in Vietnam, with no allocation release', () => {
    const end = new Date('2026-11-06T00:00:00Z');
    expect(deriveOverdueState(end, new Date('2026-11-05T16:59:59.999Z')).isOverdue).toBe(false);
    expect(deriveOverdueState(end, new Date('2026-11-05T17:00:00Z'))).toMatchObject({ effectiveEndDate: '2026-11-06', isOverdue: true, rentalState: 'OVERDUE' });
  });
  it('dashboard counts contracts ending today consistently with the rental screen', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T17:00:00Z'));
    const count = vi.fn(async () => 0), findMany = vi.fn(async () => []);
    const prisma = { rentalContract: { findMany }, reservation: { count }, handoverAppointment: { count }, renewalRequest: { count }, supportRequest: { count }, storageUnit: { count }, depositSettlement: { count } };
    await new ManagerService(prisma as never).dashboardSummary();
    expect(findMany.mock.calls).toHaveLength(2);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: 'ACTIVE', endDate: { lte: new Date('2026-11-06T00:00:00Z') } } }));
  });
});
