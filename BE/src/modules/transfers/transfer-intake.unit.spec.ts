import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { SupportService } from '../support/support.service.js';
import { TransfersService } from './transfers.service.js';
import { parseTransferProposal } from './transfer-schedule.js';
import { snapshotHash } from '../contracts/signature.js';

const customer = { id: 'customer', role: 'STORAGE_CUSTOMER' } as PublicUser;
const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
const staff = { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser;
const now = new Date('2026-10-01'), endDate = new Date('2099-10-01');
const source = { id: 'source', unitNumber: 'A101', status: 'OCCUPIED', storageTypeId: 'type' };
const contract = { id: 'contract', status: 'ACTIVE', startDate: now, endDate, reservationId: 'rental', reservationUnitId: 'old', reservationUnit: { storageUnitId: 'source', releasedAt: null, storageUnit: source } };
const reservation = { id: 'rental', reservationCode: 'R-01', customerId: customer.id, status: 'CONFIRMED', startDate: now, endDate, contracts: [contract], invoices: [] };

describe('Direct customer transfer intake', () => {
  it.each([false, true])('links one transfer and round-trips the optional proposal (%s)', async withSchedule => {
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
    const body = { reservationId: reservation.id, rentalContractId: contract.id, storageUnitId: source.id, subject: 'Yêu cầu chuyển kho', description: 'Cần chuyển đến vị trí dễ lấy hàng.', category: 'UNIT_ISSUE',
      ...(withSchedule ? { transferRequestedDate: '2099-09-30', transferRequestedSlot: '08:00' } : {}),
    };
    if (withSchedule) {
      await expect(service.createCustomer(customer, { ...body, transferRequestedDate: '2099-10-01' }, 'out-of-rental')).rejects.toThrow('trong thời hạn');
      await expect(service.createCustomer(customer, { ...body, transferRequestedDate: '2099-02-29' }, 'invalid-date')).rejects.toThrow('không hợp lệ');
      await expect(service.createCustomer(customer, { ...body, transferRequestedDate: '2026-10-02' }, 'past-date')).rejects.toThrow('đã qua');
    }
    const first = await service.createCustomer(customer, body, 'request-key-1');
    expect(first.transferRequestedSchedule).toEqual(withSchedule ? { startAt: '2099-09-30T01:00:00.000Z', endAt: '2099-09-30T03:00:00.000Z' } : null);
    expect(first.transfers).toMatchObject([{ id: 'transfer', status: 'REQUESTED' }]);
    expect(await service.createCustomer(customer, body, 'request-key-1')).toEqual(first);
    if (withSchedule) {
      await expect(service.createCustomer(customer, { ...body, transferRequestedSlot: '13:00' }, 'request-key-1')).rejects.toThrow('Idempotency-Key');
      expect(tx.supportRequest.create.mock.calls[0][0].data).toMatchObject({ transferRequestedStartAt: new Date('2099-09-30T01:00:00Z'), transferRequestedEndAt: new Date('2099-09-30T03:00:00Z') });
    }
    await expect(service.createCustomer(customer, body, 'request-key-2')).rejects.toThrow('đã có yêu cầu');
    expect(tx.transferRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.create.mock.calls[0][0].data).toMatchObject({ requestedByUserId: customer.id, supportRequestId: 'support', rentalContractId: contract.id });
    expect(tx.transferRequest.create.mock.calls[0][0].data).not.toHaveProperty('assignedStaffUserId');
    expect(tx.supportRequest.create.mock.calls[0][0].data).not.toHaveProperty('assignedStaffUserId');
    tx.supportRequest.findFirst.mockResolvedValueOnce(saved);
    expect(await service.getCustomer(customer.id, 'support')).toEqual(first);
  });

  it('rejects unknown or incomplete slots and schedules on unrelated requests', () => {
    expect(() => parseTransferProposal({ transferRequestedDate: '2099-09-29' }, true)).toThrow('không hợp lệ');
    expect(() => parseTransferProposal({ transferRequestedDate: '2099-09-29', transferRequestedSlot: '12:30' }, true)).toThrow('không hợp lệ');
    expect(() => parseTransferProposal({ transferRequestedDate: '2099-09-29', transferRequestedSlot: '08:00' }, false)).toThrow('không hợp lệ');
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
    const row = { id: 'transfer', status: 'REQUESTED', fromStorageUnitId: source.id, fromStorageUnit: source, fromReservationUnitId: 'old', rentalContract: contract, reservationId: reservation.id, reservation, createdAt: now, updatedAt: now,
      supportRequest: { transferRequestedStartAt: new Date('2099-09-30T01:00:00Z'), transferRequestedEndAt: new Date('2099-09-30T03:00:00Z') },
    };
    const destination = { id: 'target', status: 'AVAILABLE', storageTypeId: 'type', storageType: { facilityId: 'facility' } };
    const tx = {
      $queryRaw: vi.fn(), user: { findFirst: vi.fn().mockResolvedValue(staff) },
      transferRequest: {
        findFirst: vi.fn().mockResolvedValue(row), findUniqueOrThrow: vi.fn().mockResolvedValue(row),
        update: vi.fn(({ data }) => Promise.resolve(Object.assign(row, data, { assignedStaff: staff }))),
      },
      storageUnit: { findUnique: vi.fn().mockResolvedValue(destination), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      storageType: { findUniqueOrThrow: vi.fn().mockResolvedValue({ facilityId: 'facility' }) },
      reservationUnit: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'target-allocation' }) },
    };
    return { tx, service: new TransfersService({ ...tx, $transaction: (run: (client: unknown) => unknown) => run(tx) } as never) };
  }
  const input = { toStorageUnitId: 'target', staffUserId: staff.id };
  it('records the approver and assignee with the destination reservation in one operation and reuses its result on retry', async () => {
    const { service, tx } = fixture();
    const result = await service.approve('transfer', input, manager);
    expect(await service.approve('transfer', input, manager)).toEqual(result);
    expect(result).toMatchObject({ status: 'APPROVED', assignedStaff: { id: staff.id } });
    expect(result.transferRequestedSchedule).toEqual({ startAt: '2099-09-30T01:00:00.000Z', endAt: '2099-09-30T03:00:00.000Z' });
    expect(await service.getForStaff('transfer', staff)).toMatchObject({ transferRequestedSchedule: result.transferRequestedSchedule });
    expect(tx.reservationUnit.create).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.update).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.update.mock.calls[0][0].data).toMatchObject({ approvedByUserId: manager.id, assignedStaffUserId: staff.id, toReservationUnitId: 'target-allocation' });
  });
  it('rejects disabled or missing Staff and closes direct Staff creation, approval, rejection and intake', async () => {
    const { service, tx } = fixture();
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.approve('transfer', input, manager)).rejects.toThrow('đang hoạt động');
    await expect(service.approve('transfer', { toStorageUnitId: 'target' }, manager)).rejects.toThrow('Hãy chọn nhân viên thực hiện');
    await expect(service.approve('transfer', input, staff)).rejects.toThrow('Chỉ quản lý');
    await expect(service.reject('transfer', staff, { reason: 'Không phù hợp' })).rejects.toThrow('Chỉ quản lý');
    await expect(service.intakeLegacy('support', staff)).rejects.toThrow('Chỉ quản lý');
    await expect(service.create(input, 'legacy-key', staff)).rejects.toThrow('Chỉ khách hàng');
    expect(tx.reservationUnit.create).not.toHaveBeenCalled();
  });
  it('rejects a stale reviewed price before reserving a different type and stores one appendix on retry', async () => {
    const { tx } = fixture();
    tx.storageUnit.findUnique.mockResolvedValue({ id: 'target', status: 'AVAILABLE', storageTypeId: 'other-type', storageType: { facilityId: 'facility' } });
    const terms = { newRate: 2000000, financialReview: { renewals: [{ code: 'RENEWAL' }] } };
    const prepare = vi.fn().mockResolvedValue({ ...terms, generatedAt: '2099-01-01T00:00:00Z' });
    const service = new TransfersService({ $transaction: (run: (client: unknown) => unknown) => run(tx) } as never, undefined, { prepare } as never);
    await expect(service.approve('transfer', { ...input, commercialReviewHash: 'stale' }, manager)).rejects.toThrow('đã thay đổi');
    expect(tx.reservationUnit.create).not.toHaveBeenCalled();
    const reviewed = { ...input, commercialReviewHash: snapshotHash(terms) };
    await service.approve('transfer', reviewed, manager);
    await service.approve('transfer', reviewed, manager);
    expect(tx.transferRequest.update).toHaveBeenCalledTimes(1);
    expect(tx.transferRequest.update.mock.calls[0][0].data).toMatchObject({ commercialSnapshot: terms });
  });
});
