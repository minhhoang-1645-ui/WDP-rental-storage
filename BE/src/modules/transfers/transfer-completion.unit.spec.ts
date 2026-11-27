import { transferHandover } from './transfers.service.js';
import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from './transfers.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

// No PrismaService instance, environment file or database connection is created.
function setup(status = 'APPROVED', supportStatus = 'IN_PROGRESS') {
  const actor = { id: 'staff-id', role: 'FACILITY_STAFF', fullName: 'Nhân viên', email: 'staff@example.test', phone: '' } satisfies PublicUser;
  const stamp = new Date('2026-10-27T13:00:00Z');
  const storageType = { id: 'type', code: 'SM', name: 'Kho nhỏ', facilityId: 'facility' };
  const support = { id: 'support', reservationId: 'reservation', rentalContractId: 'contract', status: supportStatus, assignedStaffUserId: actor.id, subject: 'Yêu cầu chuyển kho', resolutionType: null as string | null, resolutionNote: null as string | null };
  const transfer = { id: 'transfer', transferCode: 'TRF-1', status, assignedStaffUserId: actor.id, supportRequestId: 'support' as string | null, reservationId: 'reservation', rentalContractId: 'contract', fromStorageUnitId: 'source', toStorageUnitId: 'destination', fromReservationUnitId: 'allocation-old', toReservationUnitId: 'allocation-new',
    fromStorageUnit: { id: 'source', unitNumber: 'A101', status: status === 'COMPLETED' ? 'MAINTENANCE' : 'OCCUPIED', storageType }, toStorageUnit: { id: 'destination', unitNumber: 'A102', status: 'RESERVED', storageType },
    rentalContract: { id: 'contract', contractCode: 'CON-1', status: 'ACTIVE', startDate: stamp, endDate: stamp }, reservation: { id: 'reservation', reservationCode: 'RES-1', startDate: stamp, endDate: stamp },
    requestedBy: actor, approvedBy: actor, completedBy: actor, createdAt: stamp, updatedAt: stamp, approvedAt: stamp, completedAt: status === 'COMPLETED' ? stamp : null as Date | null };
  const maintenance: Record<string, unknown>[] = [];
  const view = () => ({ ...transfer, fromStorageUnit: { ...transfer.fromStorageUnit, maintenanceRequests: maintenance.filter(item => item.activeKey) }, supportRequest: { id: support.id, supportCode: 'SUP-1', status: support.status, assignedStaffUserId: support.assignedStaffUserId, resolutionType: support.resolutionType } });
  const tx = {
    auditEvent: { create: vi.fn() },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    user: { findFirst: vi.fn(async ({ where }) => ({ id: where.id })) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility' }]) },
    reservation: { findUnique: vi.fn().mockResolvedValue({ facilityId: 'facility' }) },
    storedItem: { count: vi.fn().mockResolvedValue(0) }, stockMovement: { count: vi.fn().mockResolvedValue(9) }, $queryRaw: vi.fn(async () => []), transferRequest: { findFirst: vi.fn(async () => ({ id: transfer.id })), findUniqueOrThrow: vi.fn(async () => view()), update: vi.fn(async (input: { data: Record<string, unknown> }) => { Object.assign(transfer, input.data); return view(); }) },
    rentalContract: { update: vi.fn(async () => ({})) }, reservationUnit: { update: vi.fn(async () => ({})) }, storageUnit: { findUnique: vi.fn(async () => ({ ...transfer.fromStorageUnit, storageType: { ...storageType, facilityId: 'facility' } })), update: vi.fn(async ({ where, data }: any) => { Object.assign(where.id === 'source' ? transfer.fromStorageUnit : transfer.toStorageUnit, data); return {}; }) },
    maintenanceRequest: { count: vi.fn().mockResolvedValue(0), findUnique: vi.fn(async ({ where }: any) => maintenance.find(item => Object.entries(where).every(([key, value]) => item[key] === value)) ?? null), create: vi.fn(async ({ data }: any) => { const item = { id: 'maintenance-created', ...data }; maintenance.push(item); return item; }) },
    incidentUnitBlock: { count: vi.fn().mockResolvedValue(0) },
    supportRequest: { findUnique: vi.fn(async () => support), updateMany: vi.fn(async (input: { data: Record<string, unknown> }) => { Object.assign(support, input.data); return { count: 1 }; }) } };
  const prisma = { $transaction: vi.fn(async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx)) };
  return { actor, support, transfer, maintenance, tx, prisma, service: new TransfersService(prisma as unknown as PrismaService) };
}

describe('Transfer completion and linked customer request, with memory-only dependencies', () => {
  it('rejects Staff approval before accessing transfer data and hides unapproved transfer details', async () => {
    const app = setup('REQUESTED');
    await expect(app.service.approve('transfer', { toStorageUnitId: 'destination' }, app.actor)).rejects.toThrow('Chỉ quản lý');
    expect(app.prisma.$transaction).not.toHaveBeenCalled();
    const findFirst = vi.fn(async () => null);
    const reads = new TransfersService({ transferRequest: { findFirst } } as never);
    await expect(reads.getForStaff('transfer', app.actor)).rejects.toThrow('Không tìm thấy');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assignedStaffUserId: app.actor.id, status: { in: ['APPROVED', 'COMPLETED', 'REJECTED'] } }),
    }));
  });

  it('returns current source and destination location data to the assigned Staff detail view', async () => {
    const app = setup('COMPLETED');
    const findFirst = vi.fn(async () => ({
      ...app.transfer,
      fromStorageUnit: { ...app.transfer.fromStorageUnit, floor: 'Tầng 1', zone: 'A' },
      toStorageUnit: { ...app.transfer.toStorageUnit, floor: 'Tầng 2', zone: 'B' },
    }));
    const service = new TransfersService({ transferRequest: { findFirst } } as never);
    await expect(service.getForStaff('transfer', app.actor)).resolves.toMatchObject({
      fromUnit: { unitCode: 'A101', floor: 'Tầng 1', zone: 'A', status: 'MAINTENANCE' },
      toUnit: { unitCode: 'A102', floor: 'Tầng 2', zone: 'B', status: 'RESERVED' },
    });
  });

  it('does not expose personal inventory counts to the assigned Staff', async () => {
    const app = setup();
    const findFirst = vi.fn().mockResolvedValue({ ...app.transfer, rentalContract: {
      ...app.transfer.rentalContract, _count: { storedItems: 2 },
    } });
    const service = new TransfersService({ transferRequest: { findFirst } } as never);
    const result = await service.getForStaff('transfer', app.actor);
    expect(result).not.toHaveProperty('storedItemCount');
  });

  it('searches the assigned transfer list by customer name and returns only the name', async () => {
    const app = setup();
    const stamp = new Date('2026-10-27T13:00:00Z');
    const findMany = vi.fn(async () => [{
      ...app.transfer, reservation: { ...app.transfer.reservation, customer: { fullName: 'Khách được phân công' } },
      createdAt: stamp, updatedAt: stamp,
    }]);
    const count = vi.fn(async () => 6);
    const service = new TransfersService({ transferRequest: { count, findMany } } as never);
    const result = await service.listForStaff({ search: 'Khách', status: 'APPROVED', page: '2', limit: '5' }, app.actor);
    const where = expect.objectContaining({
      assignedStaffUserId: app.actor.id, status: 'APPROVED',
      OR: expect.arrayContaining([{ reservation: { customer: { fullName: { contains: 'Khách', mode: 'insensitive' } } } }]),
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 5, take: 5 }));
    expect(result.items[0].customer).toEqual({ fullName: 'Khách được phân công' });
  });

  it('returns the actual latest modification time separately from the old creation time', async () => {
    const app = setup('COMPLETED');
    app.transfer.updatedAt = new Date('2026-11-06T05:00:00Z');
    const result = await app.service.complete('transfer', app.actor, handover);
    expect(result.updatedAt).toBe('2026-11-06T05:00:00.000Z');
    expect(result.createdAt).toBe('2026-10-27T13:00:00.000Z');
  });
  it('completes physical movement and resolves the linked request in the same transaction', async () => {
    const app = setup(); const result = await app.service.complete('transfer', app.actor, handover);
    expect(result.status).toBe('COMPLETED'); expect(result.supportRequest!.status).toBe('RESOLVED');
    expect(app.support.resolutionNote).toContain('A101 sang A102'); expect(app.support.resolutionNote).toContain('CON-1');
    expect(app.tx.supportRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reservationId: 'reservation' }), data: expect.objectContaining({ resolvedByUserId: app.actor.id, resolutionType: 'ON_SITE_RESOLVED' }) }));
    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1); expect(app.tx.storageUnit.update).toHaveBeenCalledTimes(2);
    expect(app.tx.stockMovement.count).not.toHaveBeenCalled();
    expect(app.maintenance).toHaveLength(1); expect(app.maintenance[0].storageUnitId).toBe('source'); expect(result.sourceMaintenance).toBeNull();
  });
  it('repairs a previously completed transfer without moving stock or replacing allocations again', async () => {
    const app = setup('COMPLETED'); await app.service.complete('transfer', app.actor, handover); await app.service.complete('transfer', app.actor, handover);
    expect(app.support.status).toBe('RESOLVED'); expect(app.tx.supportRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(app.tx.storageUnit.update).not.toHaveBeenCalled(); expect(app.tx.rentalContract.update).not.toHaveBeenCalled(); expect(app.tx.reservationUnit.update).not.toHaveBeenCalled();
  });
  it('updates an earlier transfer recommendation with the actual completed result', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'TRANSFER_RECOMMENDED';
    await app.service.complete('transfer', app.actor, handover); expect(app.support.resolutionType).toBe('ON_SITE_RESOLVED'); expect(app.support.resolutionNote).toContain('A102');
  });
  it('does not overwrite a separately resolved support result', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'ON_SITE_RESOLVED'; app.support.resolutionNote = 'Đã xác nhận với khách';
    await app.service.complete('transfer', app.actor, handover); expect(app.support.resolutionNote).toBe('Đã xác nhận với khách'); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('does not close unrelated support or support for another contract', async () => {
    const app = setup('COMPLETED'); app.support.subject = 'Kiểm tra hóa đơn'; await app.service.complete('transfer', app.actor, handover); expect(app.support.status).toBe('IN_PROGRESS');
    app.support.subject = 'Yêu cầu chuyển kho'; app.support.rentalContractId = 'another-contract'; await expect(app.service.complete('transfer', app.actor, handover)).rejects.toThrow('không khớp'); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('rejects the transaction if customer-result persistence fails', async () => {
    const app = setup(); app.tx.supportRequest.updateMany.mockRejectedValueOnce(new Error('write failed'));
    await expect(app.service.complete('transfer', app.actor, handover)).rejects.toThrow('write failed'); expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it('does not finish an unapproved transfer', async () => {
    const app = setup('REQUESTED'); await expect(app.service.complete('transfer', app.actor, handover)).rejects.toThrow('APPROVED'); expect(app.tx.storageUnit.update).not.toHaveBeenCalled(); expect(app.tx.supportRequest.updateMany).not.toHaveBeenCalled();
  });
  it('requires assigned Staff to verify the source is empty without consulting legacy inventory', async () => {
    const app = setup();
    await expect(app.service.complete('transfer', { ...app.actor, id: 'other-staff' }, handover)).rejects.toThrow('Chỉ nhân viên được giao');
    app.tx.storedItem.count.mockResolvedValue(1);
    await expect(app.service.complete('transfer', app.actor, { ...handover, goodsMoved: false })).rejects.toThrow('kho cũ đã trống');
    expect(app.tx.storageUnit.update).not.toHaveBeenCalled();
    expect(app.tx.rentalContract.update).not.toHaveBeenCalled();
    expect((await app.service.complete('transfer', app.actor, handover)).status).toBe('COMPLETED');
    expect(app.tx.storedItem.count).not.toHaveBeenCalled();
    expect(app.tx.stockMovement.count).not.toHaveBeenCalled();
  });
  it('supports transfers without a linked customer request', async () => {
    const app = setup(); app.transfer.supportRequestId = null; expect((await app.service.complete('transfer', app.actor, handover)).status).toBe('COMPLETED'); expect(app.tx.supportRequest.findUnique).not.toHaveBeenCalled();
  });
  it('repairs missing source maintenance on legacy completion and does not create duplicate cases', async () => {
    const app = setup('COMPLETED', 'RESOLVED'); app.support.resolutionType = 'ON_SITE_RESOLVED';
    await app.service.complete('transfer', app.actor, handover); await app.service.complete('transfer', app.actor, handover);
    expect(app.maintenance).toHaveLength(1); expect(app.tx.maintenanceRequest.create).toHaveBeenCalledTimes(1); expect(app.tx.storageUnit.update).not.toHaveBeenCalled();
  });
  it('preserves an existing active maintenance case and its assignee', async () => {
    const app = setup('COMPLETED'); app.maintenance.push({ id: 'existing', activeKey: 'MAINTENANCE:source', assignedStaffUserId: 'another-staff' });
    await app.service.complete('transfer', app.actor, handover); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled(); expect(app.maintenance[0].assignedStaffUserId).toBe('another-staff');
  });
  it('does not reblock a repaired or reoccupied source or recreate a completed maintenance case', async () => {
    for (const status of ['AVAILABLE', 'OCCUPIED', 'RESERVED']) { const app = setup('COMPLETED'); app.transfer.fromStorageUnit.status = status; await app.service.complete('transfer', app.actor, handover); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled(); }
    const app = setup('COMPLETED'); app.maintenance.push({ id: 'old', activeKey: null, createIdempotencyKey: 'TRANSFER:transfer', status: 'COMPLETED' }); await app.service.complete('transfer', app.actor, handover); expect(app.tx.maintenanceRequest.create).not.toHaveBeenCalled();
  });
  it('rejects the whole completion transaction if maintenance cannot be persisted', async () => {
    const app = setup(); app.tx.maintenanceRequest.create.mockRejectedValueOnce(new Error('maintenance persistence failed'));
    await expect(app.service.complete('transfer', app.actor, handover)).rejects.toThrow('maintenance persistence failed'); expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

const handover = { destinationReady: true, oldKeysReturned: true, newKeysDelivered: true, goodsMoved: true, recipientName: 'Khách kiểm thử', returnedKeyCount: 1, deliveredKeyCount: 2, note: '' };
describe('Transfer keys are required before a new physical completion', () => {
  it('rejects missing confirmations before changing occupancy', async () => {
    const app = setup();
    await expect(app.service.complete('transfer', app.actor, { destinationReady: true })).rejects.toThrow('bàn giao quyền truy cập kho mới');
    expect(app.tx.rentalContract.update).not.toHaveBeenCalled();
    expect(app.tx.storageUnit.update).not.toHaveBeenCalled();
  });
  it('stores the key exchange with the completed transfer', async () => {
    const app = setup(); const result = await app.service.complete('transfer', app.actor, handover);
    expect(result.handoverReport).toMatchObject({ returnedKeyCount: 1, deliveredKeyCount: 2, recipientName: 'Khách kiểm thử', oldKeysReturned: true, newKeysDelivered: true });
    expect(result.handoverReport.recordedByUserId).toBe(app.actor.id);
  });
  it('requires evidence for access codes when no physical keys are exchanged', () => {
    expect(() => transferHandover({ ...handover, returnedKeyCount: 0 })).toThrow('quyền truy cập');
    expect(transferHandover({ ...handover, returnedKeyCount: 0, deliveredKeyCount: 0, note: 'Đã vô hiệu mã cũ và cấp mã mới cho khách.' })).toMatchObject({ returnedKeyCount: 0, deliveredKeyCount: 0 });
  });
  it('rejects invalid key counts and an unconfirmed delivery', () => {
    for (const count of [-1, 1.5, 51, '1']) expect(() => transferHandover({ ...handover, returnedKeyCount: count })).toThrow();
    expect(() => transferHandover({ ...handover, newKeysDelivered: false })).toThrow();
  });
});
