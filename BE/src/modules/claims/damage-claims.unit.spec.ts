import { describe, expect, it, vi } from 'vitest';
import { DamageClaimsService } from './damage-claims.service.js';
import { businessDate } from '../../business-date.js';
import type { PublicUser } from '../auth/auth.types.js';

const actor = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
const input = { rentalContractId: 'contract', description: 'Hàng trong kho bị hư hỏng cần kiểm tra', discoveredOn: businessDate(), storedItemIds: [], evidenceLinks: [] };
function setup(status = 'ACTIVE', owner = actor.id, releasedAt: Date | null = null) {
  const contract = { id: 'contract', status, owner, reservationUnit: { releasedAt, storageUnitId: 'unit', storageUnit: { unitNumber: 'A01' } } };
  const now = new Date();
  const create = vi.fn(async ({ data }) => ({ ...data, id: 'claim', discoveredOn: new Date(input.discoveredOn), createdAt: now, updatedAt: now, estimatedValue: null }));
  const tx = {
    $queryRaw: vi.fn(),
    rentalContract: { findFirst: vi.fn(async ({ where }) => contract.status === where.status && contract.owner === where.reservation.customerId && contract.reservationUnit.releasedAt === where.reservationUnit.releasedAt ? contract : null) },
    storedItem: { findMany: vi.fn().mockResolvedValue([]) }, damageClaim: { create },
  };
  const prisma = { $transaction: vi.fn(operation => operation(tx)), damageClaim: { findUnique: vi.fn().mockResolvedValue(null) } };
  return { service: new DamageClaimsService(prisma as never), contract, create, tx, prisma };
}
describe('New goods incident eligibility', () => {
  it.each(['COMPLETED', 'CANCELLED', 'READY_FOR_HANDOVER', 'PENDING_PAYMENT'])('rejects %s contracts even when the client supplies an old contract ID', async status => {
    const app = setup(status);
    await expect(app.service.create(actor, input, 'claim-test-key')).rejects.toThrow('Chỉ được báo sự cố cho kho đang thuê');
    expect(app.create).not.toHaveBeenCalled();
    expect(app.tx.storedItem.findMany).not.toHaveBeenCalled();
  });
  it('requires current ownership and an unreleased allocation', async () => {
    for (const app of [setup('ACTIVE', 'other-customer'), setup('ACTIVE', actor.id, new Date())]) {
      await expect(app.service.create(actor, input, 'claim-test-key')).rejects.toThrow('kho đang thuê');
      expect(app.create).not.toHaveBeenCalled();
    }
  });
  it('checks eligibility after locking the contract, including a return committed while the form was open', async () => {
    const app = setup();
    app.tx.$queryRaw.mockImplementationOnce(async () => { app.contract.status = 'COMPLETED'; });
    await expect(app.service.create(actor, input, 'claim-test-key')).rejects.toThrow('Kho đã trả');
    expect(app.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(app.create).not.toHaveBeenCalled();
  });
  it('accepts a report for the customer’s active rental', async () => {
    const app = setup();
    expect(await app.service.create(actor, input, 'claim-test-key')).toMatchObject({ id: 'claim', rentalContractId: 'contract', unitCodeSnapshot: 'A01' });
    expect(app.create).toHaveBeenCalledOnce();
  });
  it('keeps previously submitted incidents visible after return without accepting new reports', async () => {
    const now = new Date();
    const historical = { id: 'old-claim', rentalContractId: 'returned-contract', discoveredOn: now, createdAt: now, updatedAt: now, estimatedValue: null };
    const findMany = vi.fn().mockResolvedValue([historical]);
    const service = new DamageClaimsService({ damageClaim: { count: vi.fn().mockResolvedValue(1), findMany } } as never);
    expect(await service.list(actor, {})).toMatchObject({ total: 1, items: [{ id: 'old-claim', rentalContractId: 'returned-contract' }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: actor.id } }));
  });
});
