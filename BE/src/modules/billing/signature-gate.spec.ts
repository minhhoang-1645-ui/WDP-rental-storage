import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service.js';

describe('payment signature prerequisites', () => {
  const service = new BillingService({} as never, {} as never);
  const invoice = { type: 'INITIAL', reservationId: 'reservation', renewalRequestId: null };
  it('requires every contract in an initial reservation to be accepted', async () => {
    const db = { rentalContract: { findMany: vi.fn().mockResolvedValue([{ termsAcceptedAt: new Date() }, { termsAcceptedAt: null }]) } };
    await expect(service.assertSignedBeforePayment(db as never, invoice)).rejects.toBeInstanceOf(ConflictException);
    db.rentalContract.findMany.mockResolvedValue([{ termsAcceptedAt: new Date() }]);
    await expect(service.assertSignedBeforePayment(db as never, invoice)).resolves.toBeUndefined();
  });
  it('requires acceptance before paying a new renewal but preserves completed historical renewals', async () => {
    const db = { renewalRequest: { findUnique: vi.fn().mockResolvedValue({ status: 'APPROVED_PENDING_PAYMENT', appendixAcceptedAt: null }) } };
    const renewal = { ...invoice, type: 'RENEWAL', renewalRequestId: 'renewal' };
    await expect(service.assertSignedBeforePayment(db as never, renewal)).rejects.toBeInstanceOf(ConflictException);
    db.renewalRequest.findUnique.mockResolvedValue({ status: 'APPROVED_PENDING_PAYMENT', appendixAcceptedAt: new Date() });
    await expect(service.assertSignedBeforePayment(db as never, renewal)).resolves.toBeUndefined();
    db.renewalRequest.findUnique.mockResolvedValue({ status: 'COMPLETED', appendixAcceptedAt: null });
    await expect(service.assertSignedBeforePayment(db as never, renewal)).resolves.toBeUndefined();
  });
});
