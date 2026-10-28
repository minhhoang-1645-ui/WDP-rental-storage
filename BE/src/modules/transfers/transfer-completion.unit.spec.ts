import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from './transfers.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

// No PrismaService instance, environment file or database connection is created.
function setup(status = 'APPROVED', supportStatus = 'IN_PROGRESS') {
  const actor = { id: 'staff-id', role: 'STAFF', fullName: 'Nhân viên', email: 'staff@example.test', phone: '' } satisfies PublicUser;
  const stamp = new Date('2026-10-27T13:00:00Z');
  const storageType = { id: 'type', code: 'SM', name: 'Kho nhỏ' };
  const support = { id: 'support', reservationId: 'reservation', rentalContractId: 'contract', status: supportStatus, subject: 'Yêu cầu chuyển kho', resolutionType: null as string | null, resolutionNote: null as string | null };
  const transfer = { id: 'transfer', transferCode: 'TRF-1', status, supportRequestId: 'support' as string | null, reservationId: 'reservation', rentalContractId: 'contract', fromStorageUnitId: 'source', toStorageUnitId: 'destination', fromReservationUnitId: 'allocation-old', toReservationUnitId: 'allocation-new',
    fromStorageUnit: { id: 'source', unitNumber: 'A101', status: status === 'COMPLETED' ? 'MAINTENANCE' : 'OCCUPIED', storageType }, toStorageUnit: { id: 'destination', unitNumber: 'A102', status: 'RESERVED', storageType },
    rentalContract: { id: 'contract', contractCode: 'CON-1', status: 'ACTIVE', startDate: stamp, endDate: stamp }, reservation: { id: 'reservation', reservationCode: 'RES-1', startDate: stamp, endDate: stamp },
    requestedBy: actor, approvedBy: actor, completedBy: actor, createdAt: stamp, approvedAt: stamp, completedAt: status === 'COMPLETED' ? stamp : null as Date | null };
  const maintenance: Record<string, unknown>[] = [];
  const view = () => ({ ...transfer, fromStorageUnit: { ...transfer.fromStorageUnit, maintenanceRequests: maintenance.filter(item => item.activeKey) }, supportRequest: { id: support.id, supportCode: 'SUP-1', status: support.status, resolutionType: support.resolutionType } });
  const tx = { $queryRaw: vi.fn(async () => []), transferRequest: { findFirst: vi.fn(async () => ({ id: transfer.id })), findUniqueOrThrow: vi.fn(async () => view()), update: vi.fn(async (input: { data: Record<string, unknown> }) => { Object.assign(transfer, input.data); return view(); }) },
    rentalContract: { update: vi.fn(async () => ({})) }, reservationUnit: { update: vi.fn(async () => ({})) }, storageUnit: { findUnique: vi.fn(async () => transfer.fromStorageUnit), update: vi.fn(async ({ where, data }: any) => { Object.assign(where.id === 'source' ? transfer.fromStorageUnit : transfer.toStorageUnit, data); return {}; }) },
    maintenanceRequest: { findUnique: vi.fn(async ({ where }: any) => maintenance.find(item => Object.entries(where).every(([key, value]) => item[key] === value)) ?? null), create: vi.fn(async ({ data }: any) => { const item = { id: 'maintenance-created', ...data }; maintenance.push(item); return item; }) },
    supportRequest: { findUnique: vi.fn(async () => support), updateMany: vi.fn(async (input: { data: Record<string, unknown> }) => { Object.assign(support, input.data); return { count: 1 }; }) } };
  const prisma = { $transaction: vi.fn(async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx)) };
  return { actor, support, transfer, maintenance, tx, prisma, service: new TransfersService(prisma as unknown as PrismaService) };
}

describe('Transfer completion and linked customer request, with memory-only dependencies', () => {
  it('completes physical movement and resolves the linked request in the same transaction', async () => {
    const app = setup(); const result = await app.service.complete('transfer', app.actor);
    expect(result.status).toBe('COMPLETED'); expect(result.supportRequest.status).toBe('RESOLVED');
    expect(app.support.resolutionNote).toContain('A101 sang A102'); expect(app.support.resolutionNote).toContain('CON-1');
    expect(app.tx.supportRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reservationId: 'reservation' }), data: expect.objectContaining({ resolvedByUserId: app.actor.id, resolutionType: 'ON_SITE_RESOLVED' }) }));
    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1); expect(app.tx.storageUnit.update).toHaveBeenCalledTimes(2);
    expect(app.maintenance).toHaveLength(1); expect(app.maintenance[0].storageUnitId).toBe('source'); expect(result.sourceMaintenance?.id).toBe('maintenance-created');
  });
  it('repairs a previously completed transfer without moving stock or replacing allocations again', async () => {
    const app = setup('COMPLETED'); await app.service.complete('transfer', app.actor); await app.service.complete('transfer', app.actor);
    expect(app.support.status).toBe('RESOLVED'); expect(app.tx.supportRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(app.tx.storageUnit.update).not.toHaveBeenCalled(); expect(app.tx.rentalContract.update).not.toHaveBeenCalled(); expect(app.tx.reservationUnit.update).not.toHaveBeenCalled();
  });
  it('updates an earlier transfer recommendation with the actual completed result', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'TRANSFER_RECOMMENDED';
    await app.service.complete('transfer', app.actor); expect(app.support.resolutionType).toBe('ON_SITE_RESOLVED'); expect(app.support.resolutionNote).toContain('A102');
  });
  it('does not overwrite a separately resolved support result', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'ON_SITE_RESOLVED'; app.support.resolutionNote = 'Đã xác nhận với khách';
    await app.service.complete('transfer', app.actor); expect(app.support.resolutionNote).toBe('Đã xác nhận với khách'); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('does not close unrelated support or support for another contract', async () => {
    const app = setup('COMPLETED'); app.support.subject = 'Kiểm tra hóa đơn'; await app.service.complete('transfer', app.actor); expect(app.support.status).toBe('IN_PROGRESS');
    app.support.subject = 'Yêu cầu chuyển kho'; app.support.rentalContractId = 'another-contract'; await expect(app.service.complete('transfer', app.actor)).rejects.toThrow('không khớp'); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('rejects the transaction if customer-result persistence fails', async () => {
    const app = setup(); app.tx.supportRequest.updateMany.mockRejectedValueOnce(new Error('write failed'));
    await expect(app.service.complete('transfer', app.actor)).rejects.toThrow('write failed'); expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it('does not finish an unapproved transfer', async () => {
    const app = setup('REQUESTED'); await expect(app.service.complete('transfer', app.actor)).rejects.toThrow('APPROVED'); expect(app.tx.storageUnit.update).not.toHaveBeenCalled(); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('supports transfers without a linked customer request', async () => {
    const app = setup(); app.transfer.supportRequestId = null; expect((await app.service.complete('transfer', app.actor)).status).toBe('COMPLETED'); expect(app.tx.supportRequest.findUnique).not.toHaveBeenCalled();
  });
  it('repairs missing source maintenance on legacy completion and does not create duplicate cases', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'ON_SITE_RESOLVED';
    await app.service.complete('transfer', app.actor); await app.service.complete('transfer', app.actor);
    expect(app.maintenance).toHaveLength(1); expect(app.tx.maintenanceRequest.create).toHaveBeenCalledTimes(1); expect(app.tx.storageUnit.update).not.toHaveBeenCalled();
  });
  it('preserves an existing active maintenance case and its assignee', async () => {
    const app = setup('COMPLETED'); app.maintenance.push({ id: 'existing', activeKey: 'MAINTENANCE:source', assignedStaffUserId: 'another-staff' });
    await app.service.complete('transfer', app.actor); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled(); expect(app.maintenance[0].assignedStaffUserId).toBe('another-staff');
  });
  it('does not reblock a repaired or reoccupied source or recreate a completed maintenance case', async () => {
    for (const status of ['AVAILABLE', 'OCCUPIED', 'RESERVED']) { const app = setup('COMPLETED'); app.transfer.fromStorageUnit.status = status; await app.service.complete('transfer', app.actor); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled(); }
    const app = setup('COMPLETED'); app.maintenance.push({ id: 'old', activeKey: null, createIdempotencyKey: 'TRANSFER:transfer', status: 'COMPLETED' }); await app.service.complete('transfer', app.actor); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled();
  });
  it('rejects the whole completion transaction if maintenance cannot be persisted', async () => {
    const app = setup(); app.tx.maintenanceRequest.create.mockRejectedValueOnce(new Error('maintenance persistence failed'));
    await expect(app.service.complete('transfer', app.actor)).rejects.toThrow('maintenance persistence failed'); expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
