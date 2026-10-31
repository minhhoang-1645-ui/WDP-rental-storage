import { describe, expect, it, vi } from 'vitest';
import { CustomerDocumentsController, ManagerDocumentsController, StaffDocumentsController } from './documents.controller.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { snapshotHash } from '../contracts/signature.js';

function setup() {
  const stamp = new Date('2026-10-31T02:00:00Z');
  const signedSnapshot = { version: 'SIGNED-V1', storage: { unitCode: 'A101' }, issuer: { draft: true } };
  const transfer = { id: 't1', transferCode: 'TRF1', status: 'COMPLETED', reason: 'UNIT_ISSUE', createdAt: stamp, approvedAt: stamp, completedAt: stamp,
    fromStorageUnit: { id: 'u1', unitNumber: 'A101', floor: 'Tầng 1', zone: 'A' }, toStorageUnit: { id: 'u2', unitNumber: 'A102', floor: 'Tầng 1', zone: 'A' }, requestedBy: { fullName: 'Mai' }, approvedBy: { fullName: 'Mai' }, completedBy: { fullName: 'Mai' } };
  const record = { id: 'c1', contractCode: 'CON1', status: 'ACTIVE', startDate: stamp, endDate: stamp, createdAt: stamp, updatedAt: stamp, termsAcceptedAt: stamp, termsVersion: 'SIGNED-V1', signedSnapshot, signatureImage: 'saved-image',
    reservation: { id: 'r1', reservationCode: 'RES1', status: 'CONFIRMED', quantity: 1, storageType: { name: 'Kho nhỏ' }, customer: { id: 'owner' }, services: [] }, reservationUnit: { storageUnit: { id: 'u2', unitNumber: 'A102' } }, transferRequests: [transfer] };
  const prisma = { rentalContract: { findFirst: vi.fn().mockResolvedValue(record) } };
  const service = new ContractsService(prisma as never, { availability: () => ({}) } as never, {} as never);
  return { service, prisma, record, signedSnapshot, transfer };
}

describe('Transfer attachment in the signed contract file', () => {
  it('returns old and new units and completion evidence without changing the saved signed document/hash', async () => {
    const { service, prisma, signedSnapshot, record } = setup();
    const before = JSON.stringify(record);
    const result = await service.getCustomerContract('owner', 'c1');
    expect(prisma.rentalContract.findFirst.mock.calls[0][0].where.reservation).toEqual({ customerId: 'owner' });
    expect(result.storageUnit.unitCode).toBe('A102');
    expect(result.transfers[0]).toMatchObject({ id: 't1', fromUnit: { unitCode: 'A101' }, toUnit: { unitCode: 'A102' }, completedBy: { fullName: 'Mai' }, completedAt: '2026-10-31T02:00:00.000Z' });
    expect(result.terms.document).toEqual(signedSnapshot); expect(result.terms.snapshotHash).toBe(snapshotHash(signedSnapshot)); expect(JSON.stringify(record)).toBe(before);
  });
  it('exports only a completed transfer belonging to the authenticated customer contract', async () => {
    const { service } = setup(), record = await service.getCustomerContract('owner', 'c1');
    const contracts = { getCustomerContract: vi.fn().mockResolvedValue(record), getManagerContract: vi.fn().mockResolvedValue(record) };
    const pdf = { transferRecord: vi.fn().mockResolvedValue(Buffer.from('%PDF-attachment')) };
    const response = { set: vi.fn(), send: vi.fn() }, request = { user: { id: 'owner', role: 'CUSTOMER' } };
    const customer = new CustomerDocumentsController(contracts as never, {} as never, {} as never, pdf as never);
    await customer.transfer(request as never, 'c1', 't1', response as never);
    expect(contracts.getCustomerContract).toHaveBeenCalledWith('owner', 'c1'); expect(response.send).toHaveBeenCalledOnce();
    await expect(customer.transfer(request as never, 'c1', 'other-contract-transfer', response as never)).rejects.toThrow('thuộc hợp đồng');
    record.transfers[0].status = 'APPROVED'; await expect(customer.transfer(request as never, 'c1', 't1', response as never)).rejects.toThrow();
    expect(pdf.transferRecord).toHaveBeenCalledTimes(1);
    record.transfers[0].status = 'COMPLETED';
    await new ManagerDocumentsController(contracts as never, {} as never, {} as never, pdf as never).transfer('c1', 't1', response as never);
    await new StaffDocumentsController(contracts as never, {} as never, pdf as never).transfer('c1', 't1', response as never);
    contracts.getCustomerContract.mockRejectedValue(new Error('Không tìm thấy hợp đồng.'));
    await expect(customer.transfer({ user: { id: 'other' } } as never, 'c1', 't1', response as never)).rejects.toThrow();
    expect(pdf.transferRecord).toHaveBeenCalledTimes(3);
  });
  it('preserves each renewal period and appendix separately and does not treat an approval as activated', async () => {
    const { service, record } = setup();
    const stamp = new Date('2026-10-31T02:00:00Z');
    const renewal = (id: string, status: string, start: string, end: string) => ({ id, renewalCode: id, status, previousEndDate: new Date(start), requestedEndDate: new Date(end), termMonths: 3, paymentPlan: 'PREPAID', quoteSnapshot: { totalAmount: 1950000 },
      requestedAt: stamp, reviewedAt: stamp, approvedAt: stamp, rejectedAt: null, rejectionReason: null, requestedBy: { fullName: 'Khách' }, reviewedBy: { fullName: 'Mai' },
      appendixCode: `${id}-PL01`, appendixSnapshot: { envelopeVersion: 1, document: { contracts: [{ contractCode: 'CON1' }], previousEndDate: start, requestedEndDate: end }, verification: {} }, appendixAcceptedAt: status === 'COMPLETED' ? stamp : null, appendixAcceptanceName: status === 'COMPLETED' ? 'Khách' : null,
      invoices: [{ id: `${id}-invoice`, invoiceCode: `${id}-I01`, renewalCycle: 1, status: status === 'COMPLETED' ? 'PAID' : 'OPEN', totalAmount: 1950000n, amountPaid: status === 'COMPLETED' ? 1950000n : 0n, balanceDue: status === 'COMPLETED' ? 0n : 1950000n, paidAt: status === 'COMPLETED' ? stamp : null }] });
    const completed = renewal('R1', 'COMPLETED', '2026-10-31', '2027-01-31'), pending = renewal('R2', 'APPROVED_PENDING_PAYMENT', '2027-01-31', '2027-04-30'), unrelated = renewal('other-contract', 'COMPLETED', '2026-10-31', '2027-01-31');
    unrelated.appendixSnapshot.document.contracts = [{ contractCode: 'CON2' }];
    const before = JSON.stringify([completed.appendixSnapshot, pending.appendixSnapshot]);
    Object.assign(record.reservation, { renewals: [completed, pending, unrelated] });
    const result = await service.getCustomerContract('owner', 'c1');
    expect(result.renewals).toHaveLength(2);
    expect(result.renewals[0]).toMatchObject({ previousEndDate: '2026-10-31', requestedEndDate: '2027-01-31', activatedAt: stamp.toISOString(), appendix: { code: 'R1-PL01', acceptedAt: stamp.toISOString() }, invoices: [{ amountPaid: 1950000, balanceDue: 0 }] });
    expect(result.renewals[1]).toMatchObject({ status: 'APPROVED_PENDING_PAYMENT', activatedAt: null, appendix: { code: 'R2-PL01', acceptedAt: null }, invoices: [{ amountPaid: 0, balanceDue: 1950000 }] });
    expect(result.renewals[0].appendix.snapshotHash).not.toBe(result.renewals[1].appendix.snapshotHash);
    expect(JSON.stringify([completed.appendixSnapshot, pending.appendixSnapshot])).toBe(before);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
