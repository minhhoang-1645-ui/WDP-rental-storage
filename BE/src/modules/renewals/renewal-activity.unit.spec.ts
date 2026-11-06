import { describe, expect, it, vi } from 'vitest';
import { RenewalsService } from './renewals.service.js';

// Read mapping only: no PrismaService instance, database, mail or provider calls.
describe('Renewal activity timestamp', () => {
  it('exposes the latest persisted change after an older request was processed', async () => {
    const requestedAt = new Date('2026-10-27T13:00:00Z');
    const updatedAt = new Date('2026-11-06T05:00:00Z');
    const record = {
      id: 'renewal', renewalCode: 'REN-1', status: 'COMPLETED', requestedAt, updatedAt,
      reviewedAt: requestedAt, approvedAt: requestedAt, rejectedAt: null,
      previousEndDate: new Date('2027-01-01'), requestedEndDate: new Date('2027-04-01'),
      termMonths: 3, paymentPlan: 'PAY_MONTHLY', quoteSnapshot: {}, invoices: [], appendixCode: null,
      reservation: { id: 'reservation', reservationCode: 'RES-1', quantity: 1, endDate: new Date('2027-04-01'), storageType: { id: 'type', code: 'SM', name: 'Kho nhỏ' } },
    };
    const prisma = { renewalRequest: { findFirst: vi.fn().mockResolvedValue(record) } };
    const service = new RenewalsService(prisma as never, {} as never, {} as never, {} as never);
    const result = await service.getCustomerRenewal('customer', 'renewal');
    expect(result.updatedAt).toBe('2026-11-06T05:00:00.000Z');
    expect(result.requestedAt).toBe('2026-10-27T13:00:00.000Z');
    expect(result.status).toBe('COMPLETED');
    expect(prisma.renewalRequest.findFirst).toHaveBeenCalledOnce();
  });
});
