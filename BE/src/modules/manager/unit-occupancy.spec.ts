import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagerService } from './manager.service.js';

function setup() {
  const allocation = (id: string, start: string, end: string, status: string) => ({ id, plannedStartDate: new Date(start), plannedEndDate: new Date(end), createdAt: new Date('2026-08-01'), releasedAt: null as Date | null, contract: { status, endDate: new Date(end) }, reservation: { status: 'CONFIRMED', reservationCode: id, customer: { id, fullName: id, email: id + '@example.test' } } });
  const old = allocation('physical-customer', '2026-09-01', '2026-11-01', 'ACTIVE');
  const next = allocation('waiting-customer', '2026-11-06', '2026-12-06', 'READY_FOR_HANDOVER');
  const unit = { id: 'unit', unitNumber: 'UNIT-01', status: 'OCCUPIED', floor: 'Tầng trệt', zone: 'A', row: 1, position: 1, maintenanceRequests: [], createdAt: new Date(), updatedAt: new Date(), storageType: { id: 'type', code: 'SM', name: 'Kho nhỏ', sizeId: 'small', sizeName: 'Kho nhỏ', widthCm: 150, lengthCm: 200, heightCm: 240 }, reservationUnits: [next, old], _count: { reservationUnits: 2 } };
  const findMany = vi.fn(async () => [unit]);
  const audit = { id: 'update', action: 'UPDATE', actorName: 'Manager', createdAt: new Date('2026-11-05') };
  const prisma = { storageUnit: { findFirst: vi.fn(async () => unit), findMany, count: vi.fn(async () => 1) }, auditEvent: { findMany: vi.fn(async () => [audit]) } };
  return { service: new ManagerService(prisma as never), old, next, unit, findMany, audit, allocation, auditQuery: prisma.auditEvent.findMany };
}
afterEach(() => vi.useRealTimers());
describe('Physical unit occupancy survives planned expiry', () => {
  it('keeps the actual overdue customer visible in list and detail, before a waiting booking', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T02:00:00Z'));
    const app = setup();
    const list = await app.service.listUnits({ page: 1, limit: 20 }), detail = await app.service.getUnit('unit');
    expect(list.items[0].allocationSummary.current?.customer.id).toBe('physical-customer');
    expect(detail.currentAllocation?.customer.id).toBe('physical-customer');
    expect(detail.allocationSummary.current?.customer.id).toBe('physical-customer');
    expect(app.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ reservationUnits: expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ contract: { is: { status: 'ACTIVE' } } }]) }) }) }) }));
    expect(app.unit.status).toBe('OCCUPIED');
  });
  it('stops showing the previous customer only after the allocation is actually released', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T02:00:00Z'));
    const app = setup(); app.old.releasedAt = new Date();
    const detail = await app.service.getUnit('unit');
    expect(detail.currentAllocation?.customer.id).toBe('waiting-customer');
    expect(detail.allocations).toHaveLength(2);
  });
  it('uses the renewed contract end, excludes completed holds, and keeps the next booking first', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T02:00:00Z'));
    const app = setup();
    app.old.contract.endDate = new Date('2027-02-01');
    app.next.plannedStartDate = new Date('2026-11-07');
    const later = app.allocation('later', '2027-02-02', '2027-05-02', 'READY_FOR_HANDOVER');
    const completed = app.allocation('finished', '2026-11-07', '2026-11-10', 'COMPLETED');
    app.unit.reservationUnits = [later, completed, app.next, app.old];
    const detail = await app.service.getUnit('unit');
    const { items: [list] } = await app.service.listUnits({ page: 1, limit: 10 });
    expect(detail.currentAllocation).toMatchObject({ id: app.old.id, endDate: '2027-02-01' });
    expect(detail.futureAllocations.map(row => row.id)).toEqual([app.next.id, later.id]);
    expect(list.allocationSummary).toEqual(detail.allocationSummary);
    expect(detail.allocations.map(row => row.id)).toContain(completed.id);
    expect(detail.history).toEqual([app.audit]);
    expect(app.auditQuery).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ resource: 'units', resourceId: 'unit', outcome: 'SUCCESS' }) }));
    expect(detail.editLocked).toBe(true);
  });
});
