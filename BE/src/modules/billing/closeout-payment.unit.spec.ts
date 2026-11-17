import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service.js';
import { OnlinePaymentService } from './online-payment.service.js';
import { closeoutPaymentAllowed, closeoutReservationSelect, invoicePaymentBlockedBySchedule, isScheduledRenewalInvoice } from './renewal-invoice-schedule.js';
import type { PublicUser } from '../auth/auth.types.js';

const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
const now = new Date('2099-01-01');
function reservation() {
  return { id: 'reservation', customerId: customer.id, status: 'CONFIRMED', quantity: 1, expiresAt: null,
    contracts: [{ id: 'contract', status: 'ACTIVE', endDate: new Date('2099-05-17') }],
    supportRequests: [{ id: 'proposal', subject: 'Đề nghị trả kho trước hạn', category: 'OTHER', status: 'RESOLVED', lastAction: 'EARLY_RETURN_APPROVED', lastActionIdempotencyKey: 'early-return:proposal:2099-05-17', resolvedBy: { role: 'MANAGER' } }],
  };
}
function scheduledInvoice() {
  return { id: 'invoice', invoiceCode: 'REN-I02', type: 'RENEWAL', renewalCycle: 2, dueAt: new Date('2099-04-17'), status: 'OPEN', amountPaid: 0n, totalAmount: 1500000n, balanceDue: 1500000n, reservationId: 'reservation', renewalRequestId: 'renewal', reservation: reservation() };
}

describe('Scheduled invoices for approved rental closeout', () => {
  it('preserves normal future scheduling and only opens early payment for an exact current-period approval', () => {
    const invoice = scheduledInvoice();
    expect(isScheduledRenewalInvoice(invoice, now)).toBe(true);
    expect(invoicePaymentBlockedBySchedule(invoice, now)).toBe(false);
    invoice.reservation.contracts[0].status = 'COMPLETED';
    expect(closeoutPaymentAllowed(invoice.reservation)).toBe(true);
  });
  it.each(['pending', 'rejected', 'wrong-manager', 'stale-period', 'different-periods', 'wrong-quantity', 'inactive-contract', 'missing-approval'])('does not open scheduled payments for %s', condition => {
    const invoice = scheduledInvoice(), rental = invoice.reservation, approval = rental.supportRequests[0];
    if (condition === 'pending') approval.status = 'OPEN';
    if (condition === 'rejected') approval.lastAction = 'EARLY_RETURN_REJECTED';
    if (condition === 'wrong-manager') approval.resolvedBy.role = 'STAFF';
    if (condition === 'stale-period') rental.contracts[0].endDate = new Date('2099-08-17');
    if (condition === 'different-periods') { rental.quantity = 2; rental.contracts.push({ id: 'second', status: 'ACTIVE', endDate: new Date('2099-06-17') }); }
    if (condition === 'wrong-quantity') rental.quantity = 2;
    if (condition === 'inactive-contract') rental.contracts[0].status = 'PENDING_PAYMENT';
    if (condition === 'missing-approval') rental.supportRequests = [];
    expect(closeoutPaymentAllowed(rental)).toBe(false);
    expect(invoicePaymentBlockedBySchedule({ ...invoice, closeoutPaymentAllowed: true } as typeof invoice, now)).toBe(true);
  });
  it('uses the same eligibility at internal collection, customer bank submission and VNPay creation', async () => {
    for (const entry of ['cash', 'bank-submission', 'online'] as const) {
      const invoice = scheduledInvoice(), afterGuard = new Error('AFTER_SCHEDULE_CHECK');
      const tx = {
        $queryRaw: vi.fn(),
        invoice: { findUnique: vi.fn().mockResolvedValue(invoice), findFirst: vi.fn().mockResolvedValue(invoice) },
        payment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        paymentSubmission: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockRejectedValue(afterGuard), create: vi.fn() },
      };
      const db = { invoice: { findFirst: vi.fn().mockResolvedValue({ id: invoice.id }) }, onlinePaymentTransaction: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn(operation => operation(tx)) };
      const billing = new BillingService(db as never, {} as never);
      const signing = vi.spyOn(billing, 'assertSignedBeforePayment').mockRejectedValue(afterGuard);
      const online = new OnlinePaymentService(db as never, billing, { assertConfigured: vi.fn() } as never);
      const pay = () => entry === 'cash' ? billing.recordPayment(invoice.id, { amount: 1500000, method: 'CASH' }, 'cash-closeout-key', manager)
        : entry === 'bank-submission' ? billing.createCustomerPaymentSubmission(customer.id, invoice.id, { amount: 1500000 }, 'bank-closeout-key')
        : online.create(invoice.id, {}, 'online-closeout-key', customer, '127.0.0.1');
      invoice.reservation.supportRequests[0].lastActionIdempotencyKey = 'early-return:proposal:2099-02-17';
      await expect(pay()).rejects.toMatchObject({ response: { code: 'RENEWAL_INVOICE_NOT_DUE' } });
      expect(signing).not.toHaveBeenCalled();
      invoice.reservation.supportRequests[0].lastActionIdempotencyKey = 'early-return:proposal:2099-05-17';
      await expect(pay()).rejects.toBe(afterGuard);
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(tx.paymentSubmission.create).not.toHaveBeenCalled();
    }
  });
  it('keeps invoice pagination ownership-scoped and includes future invoices only for approved current periods', async () => {
    const approved = reservation(), stale = { ...reservation(), id: 'stale', supportRequests: [] };
    const db = { reservation: { findMany: vi.fn().mockResolvedValue([approved, stale]) }, invoice: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) } };
    const service = new BillingService(db as never, {} as never);
    await service.listCustomerInvoices(customer.id, 2, 5);
    expect(db.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ invoices: { some: { reservation: { customerId: customer.id } } } }), select: closeoutReservationSelect }));
    const where = db.invoice.count.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ reservation: { customerId: customer.id } });
    expect(where.AND[1].OR[1]).toEqual({ reservationId: { in: ['reservation'] } });
    expect(db.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 5, take: 5 }));
  });
});
