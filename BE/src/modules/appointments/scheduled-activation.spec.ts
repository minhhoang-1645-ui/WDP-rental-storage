import { describe, it, expect, vi } from 'vitest';
import { AppointmentsService } from './appointments.service.js';

describe('handover activation window', () => {
  const service = new AppointmentsService({} as never, {} as never, {} as never);
  const reservation = { contracts: [{ startDate: new Date('2026-11-10'), endDate: new Date('2026-12-10') }] };
  it('accepts key collection three days early without requiring the rental start', () => {
    expect(() => Reflect.get(service, 'assertHandoverExecutionTime').call(service, reservation, new Date('2026-11-07T02:00:00Z'), new Date('2026-11-07T03:00:00Z'))).not.toThrow();
  });
  it('rejects collection before the window or appointment time', () => {
    const check = Reflect.get(service, 'assertHandoverExecutionTime').bind(service);
    expect(() => check(reservation, new Date('2026-11-06T02:00:00Z'), new Date('2026-11-06T03:00:00Z'))).toThrow();
    expect(() => check(reservation, new Date('2026-11-07T04:00:00Z'), new Date('2026-11-07T03:00:00Z'))).toThrow();
  });
  it('only scans completed handovers with contracts due for activation', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const worker = new AppointmentsService({ handoverAppointment: { findMany } } as never, {} as never, {} as never);
    await worker.activateDueHandovers();
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: 'COMPLETED', reservation: { status: 'CONFIRMED', contracts: { some: { status: 'READY_FOR_HANDOVER' } } } });
  });
  it('activates all contracts and units together and generates billing only on activation', async () => {
    const tx = { rentalContract: { count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, storageUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const inventory = { fulfillPurchases: vi.fn() }, billing = { ensureRecurringInvoices: vi.fn() };
    const worker = new AppointmentsService({} as never, billing as never, inventory as never);
    const current = { id: 'reservation', quantity: 1, contracts: [{ id: 'contract', reservationUnit: { storageUnit: { id: 'unit', status: 'AVAILABLE' } } }] };
    await Reflect.get(worker, 'activateContracts').call(worker, tx, current);
    expect(tx.rentalContract.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(tx.storageUnit.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'OCCUPIED' } }));
    expect(billing.ensureRecurringInvoices).toHaveBeenCalledOnce();
    current.contracts[0].reservationUnit.storageUnit.status = 'MAINTENANCE';
    await expect(Reflect.get(worker, 'activateContracts').call(worker, tx, current)).rejects.toThrow();
  });
  it('does not activate a future rental even when its handover is completed', async () => {
    const future = new Date(Date.now() + 86400000 * 2);
    const record = { status: 'COMPLETED', reservation: { id: 'r', status: 'CONFIRMED', customerId: 'u', quantity: 1, invoices: [{ type: 'INITIAL', status: 'PAID' }], units: [{ id: 'allocation' }], contracts: [{ status: 'READY_FOR_HANDOVER', startDate: future, endDate: new Date(future.getTime() + 86400000), termsAcceptedAt: new Date(), termsAcceptedByUserId: 'u', reservationUnitId: 'allocation' }] } };
    const tx = { $queryRaw: vi.fn(), handoverAppointment: { findUnique: vi.fn().mockResolvedValue(record) } };
    const prisma = { handoverAppointment: { findMany: vi.fn().mockResolvedValue([{ id: 'a' }]) }, $transaction: vi.fn((operation: (value: unknown) => unknown) => operation(tx)) };
    const worker = new AppointmentsService(prisma as never, {} as never, {} as never);
    const activate = vi.spyOn(worker as any, 'activateContracts');
    await worker.activateDueHandovers();
    expect(activate).not.toHaveBeenCalled();
  });
});
