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
    invoice: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findUniqueOrThrow: vi.fn().mockResolvedValue(invoice), update: vi.fn(), create: vi.fn() },
    paymentSubmission: { count: vi.fn().mockResolvedValue(0) }, onlinePaymentTransaction: { count: vi.fn().mockResolvedValue(0) },
    rentalContract: { update: vi.fn() },
  };
}

function previewSetup(rate = 2000000) {
  const startDate = new Date('2098-10-01'), endDate = new Date('2099-06-01');
  const source = { id: 'source-type', monthlyRate: 1500000, widthCm: 100, lengthCm: 100 };
  const target = { id: 'new-type', monthlyRate: rate, widthCm: 120, lengthCm: 100 };
  return {
    reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'order', quantity: 1,
      quoteSnapshot: { monthlyUnitPrice: 1500000 }, contracts: [{ id: 'contract', startDate, endDate, contractCode: 'C01' }] }) },
    storageType: { findUniqueOrThrow: vi.fn(({ where }) => where.id === target.id ? target : source) },
    renewalRequest: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    paymentSubmission: { count: vi.fn().mockResolvedValue(0) }, onlinePaymentTransaction: { count: vi.fn().mockResolvedValue(0) },
  };
}
const renewal = (start: string, end: string, code = 'A') => ({ id: code, status: 'COMPLETED', rentalContractId: 'contract',
  previousEndDate: new Date(start), requestedEndDate: new Date(end), renewalCode: code, appendixCode: code + '-PL01',
  appendixAcceptedAt: updatedAt, appendixSnapshot: {}, quoteSnapshot: { monthlyUnitPrice: 1500000 }, paymentPlan: 'PAY_MONTHLY', invoices: [{ id: code + '-I01' }] });
const draftTransfer = { ...transfer, fromStorageUnit: { id: 'source-unit', storageTypeId: 'source-type' } };
const destination = { id: 'new-unit', storageTypeId: 'new-type' };

describe('commercial preview with existing commitments', () => {
  const service = new TransferCommercialService({ issuer: () => ({}) } as never);
  it.each([[2000000, 500000, 0], [1000000, 0, 500000], [1500000, 0, 0]])('uses %i for eligible unpaid recurring periods', async (rate, increase, reduction) => {
    const tx = previewSetup(rate);
    tx.invoice.findMany.mockResolvedValue([{ ...invoice, balanceDue: invoice.totalAmount }]);
    const result = await service.prepare(tx as never, draftTransfer, destination);
    expect(result.financialReview).toMatchObject({ futureRentIncrease: increase, futureRentReduction: reduction, depositAdjustment: 0 });
    expect(result.effectiveFrom).toBe('2099-01-01');
  });
  it('keeps activated renewals including unissued monthly periods, paid invoices and the original deposit', async () => {
    const tx = previewSetup();
    tx.renewalRequest.findMany.mockResolvedValue([renewal('2098-12-01', '2099-02-01'), renewal('2099-02-01', '2099-06-01', 'B')]);
    tx.invoice.findMany.mockResolvedValue([
      { ...invoice, type: 'INITIAL', status: 'PAID', amountPaid: 3000000n, balanceDue: 0n, depositAmount: 1500000n },
      { ...invoice, type: 'RENEWAL', status: 'PAID', amountPaid: 1500000n, balanceDue: 0n },
      { ...invoice, type: 'RENEWAL', status: 'OPEN', amountPaid: 0n, balanceDue: 1500000n, dueAt: periodStart },
    ]);
    const result = await service.prepare(tx as never, draftTransfer, destination);
    expect(result).toMatchObject({ effectiveFrom: '2099-06-01', futureInvoices: [] });
    expect(result.financialReview).toMatchObject({ renewals: [{ code: 'A' }, { code: 'B' }], paidAmount: 4500000, outstandingAmount: 1500000, depositAmount: 1500000, dueAmount: 0 });
    expect(tx.renewalRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED'] } }) }));
  });
  it.each([['PENDING', 'chờ duyệt'], ['APPROVED_PENDING_PAYMENT', 'chưa được kích hoạt']])('reports %s renewals before drafting', async (status, error) => {
    const tx = previewSetup();
    tx.renewalRequest.findMany.mockResolvedValue([{ status }]);
    await expect(service.prepare(tx as never, draftTransfer, destination)).rejects.toThrow(error);
  });
  it('requires a valid appendix and paid activation for a completed renewal', async () => {
    const tx = previewSetup();
    tx.renewalRequest.findMany.mockResolvedValue([{ ...renewal('2098-12-01', '2099-06-01'), invoices: [] }]);
    await expect(service.prepare(tx as never, draftTransfer, destination)).rejects.toThrow('chưa được đối soát');
  });
});

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
  it('blocks signed transfers with unpaid due invoices before writing replacements', async () => {
    const tx = setup();
    tx.invoice.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(service.apply(tx as never, transfer)).rejects.toThrow('hóa đơn đến hạn');
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.rentalContract.update).not.toHaveBeenCalled();
  });
  it('blocks handover when a reached renewal period has not been invoiced', async () => {
    const tx = setup();
    await expect(service.apply(tx as never, { ...transfer, commercialSnapshot: { ...transfer.commercialSnapshot,
      financialReview: { leaseEnd: '2099-06-01', renewals: [{ id: 'renewal', start: '2020-01-01', end: '2020-03-01', paymentPlan: 'PAY_MONTHLY' }] },
    } })).rejects.toThrow('chưa được phát hành');
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});
