import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from './transfers.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

function setup() {
  const contract = { status: 'ACTIVE', endDate: new Date('2099-12-31'), reservationUnitId: 'allocation' };
  const transfer = { status: 'REQUESTED', fromStorageUnitId: 'source', fromReservationUnitId: 'allocation', fromStorageUnit: { storageTypeId: 'large', status: 'OCCUPIED' }, rentalContract: contract };
  const type = { id: 'large', code: 'LG', name: 'Kho lớn', widthCm: 300, lengthCm: 400, heightCm: 240 };
  const unit = (id: string, status = 'AVAILABLE', reservationUnits: object[] = []) => ({ id, unitNumber: id, floor: 'Tầng 1', zone: 'F', row: 1, position: 2, status, storageType: type, reservationUnits });
  const units = [unit('free'), unit('future', 'AVAILABLE', [{ plannedStartDate: new Date('2099-01-01'), plannedEndDate: new Date('2099-02-01') }]), unit('occupied', 'OCCUPIED'), unit('maintenance', 'MAINTENANCE'), unit('held', 'RESERVED')];
  const prisma = { transferRequest: { findFirst: vi.fn().mockResolvedValue(transfer) }, storageUnit: { count: vi.fn().mockResolvedValue(5), findMany: vi.fn().mockResolvedValue(units) } };
  return { prisma, transfer, contract, service: new TransfersService(prisma as unknown as PrismaService) };
}

describe('Transfer destination availability, without database writes', () => {
  it('restricts candidates to the exact same type, excludes the source and pages deterministically', async () => {
    const { service, prisma } = setup(); const result = await service.destinations('transfer', { page: '2', limit: '2' });
    expect(result).toMatchObject({ total: 5, page: 2, limit: 2 });
    expect(prisma.storageUnit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storageTypeId: 'large', id: { not: 'source' } }, skip: 2, take: 2, orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }] }));
  });
  it('checks the remaining rental interval with exclusive end, unreleased confirmed allocations only', async () => {
    const { service, prisma, contract } = setup(); await service.destinations('transfer', {});
    expect(prisma.storageUnit.findMany.mock.calls[0][0].include.reservationUnits.where).toEqual({ releasedAt: null, plannedStartDate: { lt: contract.endDate }, plannedEndDate: { gt: expect.any(Date) }, reservation: { status: 'CONFIRMED' } });
  });
  it('distinguishes free, overlapping, occupied, held and maintenance units without leaking other customer data', async () => {
    const { service } = setup(); const result = await service.destinations('transfer', {});
    expect(result.items.filter(item => item.eligible).map(item => item.id)).toEqual(['free']);
    expect(result.items.map(item => item.unavailableReason)).toEqual(['', expect.stringContaining('trùng'), expect.stringContaining('khách sử dụng'), expect.stringContaining('bảo trì'), expect.stringContaining('đơn khác')]);
    expect(result.items[1].conflicts).toEqual([{ startDate: '2099-01-01', endDate: '2099-02-01' }]);
    expect(result.items[0]).toMatchObject({ floor: 'Tầng 1', zone: 'F', row: 1, position: 2, dimensions: { widthCm: 300 } });
    expect(JSON.stringify(result)).not.toMatch(/customer|reservationReference|email|phone/);
  });
  it('blocks selection for expired or inactive contracts and already handled requests', async () => {
    const { service, contract, transfer } = setup();
    contract.endDate = new Date('2000-01-01'); expect((await service.destinations('transfer', {})).items.every(item => !item.eligible)).toBe(true);
    contract.endDate = new Date('2099-12-31'); contract.status = 'CLOSED'; expect((await service.destinations('transfer', {})).items.every(item => !item.eligible)).toBe(true);
    contract.status = 'ACTIVE'; transfer.status = 'APPROVED'; expect((await service.destinations('transfer', {})).items.every(item => !item.eligible)).toBe(true);
  });
  it('rejects invalid paging and unknown requests', async () => {
    const { service, prisma } = setup(); await expect(service.destinations('transfer', { limit: 101 })).rejects.toThrow();
    prisma.transferRequest.findFirst.mockResolvedValue(null); await expect(service.destinations('missing', {})).rejects.toThrow('Không tìm thấy');
  });
  it('blocks stale source allocations both in selection and at final approval, before holding any destination', async () => {
    const app = setup(); app.contract.reservationUnitId = 'already-moved';
    expect((await app.service.destinations('transfer', {})).items.every(item => !item.eligible)).toBe(true);
    const tx = { $queryRaw: vi.fn(), transferRequest: { findFirst: vi.fn().mockResolvedValue({ id: 'transfer' }), findUniqueOrThrow: vi.fn().mockResolvedValue(app.transfer) }, storageUnit: { findUnique: vi.fn() } };
    const service = new TransfersService({ $transaction: (operation: (value: unknown) => unknown) => operation(tx) } as never);
    await expect(service.approve('transfer', { toStorageUnitId: 'free' }, {} as never)).rejects.toThrow('kho nguồn đã thay đổi');
    expect(tx.storageUnit.findUnique).not.toHaveBeenCalled();
  });
});
