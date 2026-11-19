import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { SupportService } from '../support/support.service.js';
import { TransfersService } from './transfers.service.js';

const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
const now = new Date('2026-10-01'), endDate = new Date('2099-10-01');
const source = { id: 'source', unitNumber: 'A101', status: 'OCCUPIED', storageTypeId: 'type' };
const contract = { id: 'contract', status: 'ACTIVE', startDate: now, endDate, reservationId: 'rental', reservationUnitId: 'old', reservationUnit: { storageUnitId: 'source', releasedAt: null, storageUnit: source } };
const reservation = { id: 'rental', reservationCode: 'R-01', customerId: customer.id, status: 'CONFIRMED', startDate: now, endDate, contracts: [contract], invoices: [] };

describe('Direct customer transfer intake', () => {
  it('links one transfer to the original request and never assigns Staff before approval', async () => {
    let saved: any = null;
    let transfer: any = null;
    const tx = {
      $queryRaw: vi.fn(), reservation: { findFirst: vi.fn().mockResolvedValue(reservation), findUnique: vi.fn().mockResolvedValue(reservation) },
      returnInspection: { findFirst: vi.fn().mockResolvedValue(null) }, renewalRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      supportRequest: {
        findUnique: vi.fn(({ where }) => Promise.resolve(saved?.idempotencyKey === where.idempotencyKey ? saved : null)),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(({ data }) => Promise.resolve(saved = { ...data, id: 'support', reservation, createdAt: now, updatedAt: now, transferRequests: [] })),
        findUniqueOrThrow: vi.fn(() => Promise.resolve(saved)),
      },
      transferRequest: {
        findFirst: vi.fn(() => Promise.resolve(transfer)),
        create: vi.fn(({ data }) => {
          transfer = { ...data, id: 'transfer', status: 'REQUESTED', fromStorageUnit: source };
          saved.transferRequests.push(transfer);
          return Promise.resolve(transfer);
        }),
      },
    };
    const service = new SupportService({ ...tx, $transaction: (run: (client: unknown) => unknown) => run(tx) } as never);
    const body = { reservationId: reservation.id, rentalContractId: contract.id, storageUnitId: source.id, subject: 'Yêu cầu chuyển kho', description: 'Cần chuyển đến vị trí dễ lấy hàng.', category: 'UNIT_ISSUE' };
    const first = await service.createCustomer(customer, body, 'request-key-1');
    expect(first.transfers).toMatchObject([{ id: 'transfer', status: 'REQUESTED' }]);
    expect(await service.createCustomer(customer, body, 'request-key-1')).toEqual(first);
    await expect(service.createCustomer(customer, body, 'request-key-2')).rejects.toThrow('đã có yêu cầu');
    expect(tx.transferRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.create.mock.calls[0][0].data).toMatchObject({ requestedByUserId: customer.id, supportRequestId: 'support', rentalContractId: contract.id });
    expect(tx.transferRequest.create.mock.calls[0][0].data).not.toHaveProperty('assignedStaffUserId');
    expect(tx.supportRequest.create.mock.calls[0][0].data).not.toHaveProperty('assignedStaffUserId');
  });

  it('preserves the original customer and timestamp when Manager opens an old unlinked request', async () => {
    const request = { id: 'legacy', subject: 'Yêu cầu chuyển kho', reservationId: reservation.id, rentalContractId: contract.id, storageUnitId: source.id, status: 'ASSIGNED', customerUserId: customer.id, createdAt: now, category: 'OTHER', transferRequests: [] as { id: string }[] };
    const tx = {
      $queryRaw: vi.fn(),
      supportRequest: { findUnique: vi.fn().mockResolvedValue(request) },
      rentalContract: { findMany: vi.fn().mockResolvedValue([contract]) },
      returnInspection: { findFirst: vi.fn().mockResolvedValue(null) },
      renewalRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      transferRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'linked' }) },
    };
    const service = new TransfersService({ $transaction: (run: (client: unknown) => unknown) => run(tx) } as never);
    expect(await service.intakeLegacy(request.id, manager)).toEqual({ id: 'linked' });
    request.transferRequests.push({ id: 'linked' });
    expect(await service.intakeLegacy(request.id, manager)).toEqual({ id: 'linked' });
    expect(tx.transferRequest.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: expect.objectContaining({ supportRequestId: request.id, requestedByUserId: customer.id, createdAt: now }) }));
    expect(request.status).toBe('ASSIGNED');
  });
});

describe('Manager approval with assignment', () => {
  function fixture() {
    const row = { id: 'transfer', status: 'REQUESTED', fromStorageUnitId: source.id, fromStorageUnit: source, fromReservationUnitId: 'old', rentalContract: contract, reservationId: reservation.id, reservation, createdAt: now, updatedAt: now };
    const destination = { id: 'target', status: 'AVAILABLE', storageTypeId: 'type' };
    const tx = {
      $queryRaw: vi.fn(), user: { findFirst: vi.fn().mockResolvedValue(staff) },
      transferRequest: {
        findFirst: vi.fn().mockResolvedValue(row), findUniqueOrThrow: vi.fn().mockResolvedValue(row),
        update: vi.fn(({ data }) => Promise.resolve(Object.assign(row, data, { assignedStaff: staff }))),
      },
      storageUnit: { findUnique: vi.fn().mockResolvedValue(destination), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reservationUnit: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'target-allocation' }) },
    };
    return { tx, service: new TransfersService({ $transaction: (run: (client: unknown) => unknown) => run(tx) } as never) };
  }
  const input = { toStorageUnitId: 'target', staffUserId: staff.id };
  it('records the approver and assignee with the destination reservation in one operation and reuses its result on retry', async () => {
    const { service, tx } = fixture();
    const result = await service.approve('transfer', input, manager);
    expect(await service.approve('transfer', input, manager)).toEqual(result);
    expect(result).toMatchObject({ status: 'APPROVED', assignedStaff: { id: staff.id } });
    expect(tx.reservationUnit.create).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.update).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.update.mock.calls[0][0].data).toMatchObject({ approvedByUserId: manager.id, assignedStaffUserId: staff.id, toReservationUnitId: 'target-allocation' });
  });
  it('rejects disabled or missing Staff and closes direct Staff creation, approval, rejection and intake', async () => {
    const { service, tx } = fixture();
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.approve('transfer', input, manager)).rejects.toThrow('đang hoạt động');
    await expect(service.approve('transfer', { toStorageUnitId: 'target' }, manager)).rejects.toThrow('Cần chọn');
    await expect(service.approve('transfer', input, staff)).rejects.toThrow('Chỉ quản lý');
    await expect(service.reject('transfer', staff, { reason: 'Không phù hợp' })).rejects.toThrow('Chỉ quản lý');
    await expect(service.intakeLegacy('support', staff)).rejects.toThrow('Chỉ quản lý');
    await expect(service.create(input, 'legacy-key', staff)).rejects.toThrow('Chỉ khách hàng');
    expect(tx.reservationUnit.create).not.toHaveBeenCalled();
  });
});
