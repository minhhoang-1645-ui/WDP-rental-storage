import { describe, expect, it, vi } from 'vitest';
import { TransferCommercialService } from './transfer-commercial.service.js';

const periodStart = new Date('2099-01-01');
const periodEnd = new Date('2099-02-01');
const updatedAt = new Date('2098-12-20');
const transfer = {
  rentalContractId: 'contract', reservationId: 'order', toReservationUnitId: 'new-allocation', toStorageUnitId: 'new-unit', transferCode: 'T01',
  customerAcceptedAt: updatedAt, commercialSignedSnapshot: {}, commercialSnapshot: {
    contractCode: 'C01', newRate: 2000000, effectiveFrom: '2099-01-01', to: { code: 'B14', typeId: 'new-type', typeName: 'Kho vừa' },
    futureInvoices: [{ id: 'original', cycle: 2, updatedAt: updatedAt.toISOString() }],
  },
};
const invoice = {
  id: 'original', invoiceCode: 'I02', reservationId: 'order', type: 'RECURRING', billingCycle: 2,
  status: 'OPEN', amountPaid: 0n, updatedAt, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd,
  rentalAmount: 1500000n, depositAmount: 0n, serviceAmount: 0n, chargeAmount: 0n, totalAmount: 1500000n, currency: 'VND',
};
function setup() {
  return {
    $queryRaw: vi.fn(),
    reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ quantity: 2 }), update: vi.fn() },
    invoice: { count: vi.fn().mockResolvedValue(0), findUniqueOrThrow: vi.fn().mockResolvedValue(invoice), update: vi.fn(), create: vi.fn() },
    paymentSubmission: { count: vi.fn().mockResolvedValue(0) }, onlinePaymentTransaction: { count: vi.fn().mockResolvedValue(0) },
    rentalContract: { update: vi.fn() },
  };
}

describe('transfer invoice protection', () => {
  const service = new TransferCommercialService({} as never);
  it('requires the signed appendix before applying commercial changes', async () => {
    const tx = setup();
    await expect(service.apply(tx as never, { ...transfer, customerAcceptedAt: null, commercialSignedSnapshot: null })).rejects.toThrow('Khách cần ký');
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.rentalContract.update).not.toHaveBeenCalled();
  });
  it('blocks a commercial change on a multi-unit reservation', async () => {
    const tx = setup();
    await expect(service.prepare(tx as never, transfer, {})).rejects.toThrow('chỉ áp dụng cho đơn có một kho');
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
  it.each(['paid', 'partially paid', 'pending bank', 'pending VNPay'])('keeps the %s invoice untouched', async state => {
    const tx = setup();
    if (state === 'paid') tx.invoice.findUniqueOrThrow.mockResolvedValue({ ...invoice, status: 'PAID', amountPaid: invoice.totalAmount });
    if (state === 'partially paid') tx.invoice.findUniqueOrThrow.mockResolvedValue({ ...invoice, status: 'PARTIALLY_PAID', amountPaid: 1n });
    if (state === 'pending bank') tx.paymentSubmission.count.mockResolvedValue(1);
    if (state === 'pending VNPay') tx.onlinePaymentTransaction.count.mockResolvedValue(1);
    await expect(service.apply(tx as never, transfer)).rejects.toThrow();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
  it('links a replacement with the new allocation and keeps original amounts', async () => {
    const tx = setup();
    await service.apply(tx as never, transfer);
    expect(tx.invoice.update).toHaveBeenCalledWith({ where: { id: 'original' }, data: { status: 'VOID', billingCycle: null, balanceDue: 0n } });
    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      replacesInvoiceId: 'original', totalAmount: 2000000n, pricingSnapshot: expect.objectContaining({
        breakdown: expect.objectContaining({ units: [expect.objectContaining({ contractId: 'contract', reservationUnitId: 'new-allocation', unitCode: 'B14', rentalAmount: 2000000 })] }),
      }),
    }) });
  });
  it('requires another review when a new cycle has been issued since the addendum', async () => {
    const tx = setup();
    tx.invoice.count.mockResolvedValue(1);
    await expect(service.apply(tx as never, transfer)).rejects.toThrow('chưa được duyệt trong phụ lục');
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});
