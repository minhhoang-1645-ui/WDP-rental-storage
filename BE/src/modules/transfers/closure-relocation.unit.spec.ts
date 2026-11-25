import { describe, expect, it, vi } from 'vitest';
import { ClosureRelocationService } from './closure-relocation.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const sourceStaff: PublicUser = { id: 'source-staff', role: 'FACILITY_STAFF', fullName: 'Source Staff', email: 'source@example.test', phone: '' };
const receivingStaff: PublicUser = { id: 'receiving-staff', role: 'FACILITY_STAFF', fullName: 'Receiving Staff', email: 'receiving@example.test', phone: '' };
const customer: PublicUser = { id: 'customer', role: 'STORAGE_CUSTOMER', fullName: 'Customer', email: 'customer@example.test', phone: '' };

function setup() {
  const sourceFacility = { id: 'source-facility', name: 'Source', operationalStatus: 'CLOSING', closureMode: 'REQUIRED_RELOCATION', closurePlanId: 'plan' };
  const destinationFacility = { id: 'destination-facility', name: 'Destination', operationalStatus: 'OPEN', bookingEnabled: true };
  const source = { id: 'source-unit', unitNumber: 'S1', status: 'OCCUPIED', storageType: { facilityId: sourceFacility.id, facility: sourceFacility, name: 'Small' } };
  const destination = { id: 'destination-unit', unitNumber: 'D1', status: 'RESERVED', storageType: { facilityId: destinationFacility.id, facility: destinationFacility, name: 'Small' } };
  const contract = { id: 'contract', contractCode: 'C1', reservationId: 'reservation', reservationUnitId: 'old-allocation', reservationUnit: { storageUnit: source, releasedAt: null },
    status: 'ACTIVE', endDate: new Date('2099-01-01'), reservation: { customerId: customer.id, customer: { fullName: 'Customer' } } };
  const row = { id: 'transfer', transferCode: 'TRF-1', status: 'APPROVED', closurePlanId: 'plan', assignedStaffUserId: sourceStaff.id, receivingStaffId: receivingStaff.id,
    fromStorageUnitId: source.id, toStorageUnitId: destination.id, fromStorageUnit: source, toStorageUnit: destination,
    rentalContract: contract, rentalContractId: contract.id, reservationId: contract.reservationId, fromReservationUnitId: 'old-allocation', toReservationUnitId: 'new-allocation',
    consentEvidence: { agreed: true }, safetyEvidence: { evidence: 'verified' }, sourceHandover: null as object | null, destinationHandover: null as object | null,
    relocationException: null, supportRequestId: 'support' };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]), $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'staff' }) },
    facilityAccess: { findMany: vi.fn(async ({ where }) => [{ facilityId: where.userId === sourceStaff.id ? sourceFacility.id : destinationFacility.id }]) },
    facility: { findUniqueOrThrow: vi.fn().mockResolvedValue(sourceFacility) },
    transferRequest: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn(async ({ data }) => Object.assign(row, data)) },
    storageUnit: { findUnique: vi.fn(async ({ where }) => where.id === source.id ? source : destination), update: vi.fn() },
    rentalContract: { update: vi.fn() }, reservationUnit: { update: vi.fn() }, invoice: { create: vi.fn() },
    maintenanceRequest: { count: vi.fn().mockResolvedValue(0) }, reservationService: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    supportRequest: { update: vi.fn() }, auditEvent: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(async fn => fn(tx)) };
  return { service: new ClosureRelocationService(db as never), row, tx };
}
const handover = (side: string) => ({ side, confirmed: true, note: 'Verified handover and access' });

describe('Closure relocation handover', () => {
  it('rejects an unassigned staff member and a customer confirming another customer’s plan', async () => {
    const { service, row, tx } = setup();
    await expect(service.handover(row.id, sourceStaff, handover('destination'))).rejects.toThrow('Chỉ nhân viên được giao');
    await expect(service.consent(row.id, { ...customer, id: 'other-customer' }, { agreed: true, destinationId: row.toStorageUnitId })).rejects.toThrow();
    expect(tx.rentalContract.update).not.toHaveBeenCalled();
  });

  it('requires source safety evidence and both confirmations before changing allocation', async () => {
    const { service, row, tx } = setup();
    await expect(service.handover(row.id, receivingStaff, handover('destination'))).rejects.toThrow('kho nguồn');
    row.safetyEvidence = null as never;
    await expect(service.handover(row.id, sourceStaff, handover('source'))).rejects.toThrow('an toàn');
    expect(tx.rentalContract.update).not.toHaveBeenCalled();
    row.safetyEvidence = { evidence: 'verified' };
    await service.handover(row.id, sourceStaff, handover('source'));
    expect(tx.rentalContract.update).not.toHaveBeenCalled();
    await service.handover(row.id, receivingStaff, handover('destination'));
    expect(tx.rentalContract.update).toHaveBeenCalledExactlyOnceWith({ where: { id: row.rentalContractId }, data: { reservationUnitId: 'new-allocation' } });
    expect(row.status).toBe('COMPLETED');
    expect(tx.invoice.create).not.toHaveBeenCalled();
    await service.handover(row.id, receivingStaff, handover('destination'));
    expect(tx.rentalContract.update).toHaveBeenCalledTimes(1);
  });
});
