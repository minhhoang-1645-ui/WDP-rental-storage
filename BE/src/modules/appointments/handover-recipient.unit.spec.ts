import { describe, expect, it, vi } from 'vitest';
import { businessToday } from '../../business-date.js';
import { AppointmentsService } from './appointments.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const staff = { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser;
const report = { condition: 'Kho sạch, cửa và khóa bình thường', accessItemCount: 1, identityVerified: true, unitInspected: true, accessDelivered: true, documentsDelivered: true };

function setup(status = 'CONFIRMED') {
  const now = new Date();
  const today = businessToday(now).getTime();
  const startDate = new Date(today + 86400000);
  const endDate = new Date(today + 31 * 86400000);
  const row = {
    id: 'appointment', reservationId: 'reservation', appointmentCode: 'A01', status,
    assignedStaffUserId: status === 'COMPLETED' ? null : staff.id,
    assignedStaff: status === 'COMPLETED' ? null : { ...staff, accountStatus: 'ACTIVE' },
    completedByUserId: status === 'COMPLETED' ? staff.id : null,
    scheduledAt: new Date(now.getTime() - 60000), createdAt: now, updatedAt: now,
    handoverNote: status === 'COMPLETED' ? 'Ghi chú bàn giao cũ' : null,
    reservation: {
      id: 'reservation', reservationCode: 'R01', customerId: 'customer', status: 'CONFIRMED', quantity: 1,
      customer: { id: 'customer', fullName: 'Khách thuê' },
      invoices: [{ type: 'INITIAL', status: 'PAID' }], units: [{ id: 'allocation', storageUnitId: 'unit' }],
      contracts: [{
        id: 'contract', contractCode: 'C01', status: 'READY_FOR_HANDOVER', startDate, endDate,
        termsAcceptedAt: now, termsAcceptedByUserId: 'customer', reservationUnitId: 'allocation',
        reservationUnit: { storageUnit: { id: 'unit', unitNumber: 'A01', status: 'RESERVED', floor: 'G', zone: 'A' } },
      }],
    },
  };
  const update = vi.fn(async ({ data }) => Object.assign(row, data));
  const tx = {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    reservation: { findUnique: vi.fn().mockResolvedValue({ facilityId: 'facility' }) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: staff.id }) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility' }]) },
    handoverAppointment: { findUnique: vi.fn().mockResolvedValue(row), update },
    maintenanceRequest: { count: vi.fn().mockResolvedValue(0) },
    rentalContract: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    handoverAppointment: { findFirst: vi.fn().mockResolvedValue({ id: row.id }) },
    $transaction: vi.fn(operation => operation(tx)),
  };
  return { service: new AppointmentsService(prisma as never, {} as never, {} as never), row, update };
}

function addSecondUnit(row: ReturnType<typeof setup>['row']) {
  row.reservation.quantity = 2;
  row.reservation.units.push({ id: 'allocation-2', storageUnitId: 'unit-2' });
  const first = row.reservation.contracts[0];
  row.reservation.contracts.push({
    ...first, id: 'contract-2', contractCode: 'C02', reservationUnitId: 'allocation-2',
    reservationUnit: { storageUnit: { ...first.reservationUnit.storageUnit, id: 'unit-2', unitNumber: 'A02' } },
  });
}

describe('RV3 handover completion service', () => {
  it('records actual early collection before the planned appointment without activating the rental', async () => {
    const state = setup();
    state.row.scheduledAt = new Date(Date.now() + 86400000);
    const activate = vi.spyOn(state.service as any, 'activateContracts');
    const result = await state.service.completeHandover('appointment', { handoverReport: report }, staff);
    expect(result.status).toBe('COMPLETED');
    expect(result.usageStatus).toBe('WAITING_FOR_RENTAL_START');
    expect(result.scheduledAt).toBe(state.row.scheduledAt.toISOString());
    expect(activate).not.toHaveBeenCalled();
    expect(state.update).toHaveBeenCalledOnce();
  });
  it('records the contract customer, Staff identity and actual completion time', async () => {
    const { service, update } = setup();
    const result = await service.completeHandover('appointment', { handoverReport: report }, staff);
    expect(result.handoverNote).toContain('Người nhận: Khách thuê');
    expect(result.handoverReport).toMatchObject({ recipientName: 'Khách thuê', accessItemCount: 1, identityVerified: true, documentsDelivered: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedByUserId: staff.id, completedAt: expect.any(Date) }) }));
    expect(result.usageStatus).toBe('WAITING_FOR_RENTAL_START');
  });
  it('records authorized receipt and rejects missing authorization without saving', async () => {
    const state = setup();
    await expect(state.service.completeHandover('appointment', { handoverReport: { ...report, recipientType: 'AUTHORIZED', recipientName: 'Đại diện' } }, staff)).rejects.toThrow('ủy quyền');
    expect(state.update).not.toHaveBeenCalled();
    const result = await state.service.completeHandover('appointment', { handoverReport: { ...report, recipientType: 'AUTHORIZED', recipientName: 'Đại diện', authorizationBasis: 'Văn bản ủy quyền do khách cung cấp đã đối chiếu' } }, staff);
    expect(result.handoverNote).toContain('Người nhận: Đại diện');
    expect(result.handoverNote).toContain('Căn cứ ủy quyền:');
  });
  it('keeps completed legacy notes readable on retry and blocks new note-only completion', async () => {
    const legacy = setup('COMPLETED');
    expect((await legacy.service.completeHandover('appointment', {}, staff)).handoverNote).toBe('Ghi chú bàn giao cũ');
    expect(legacy.update).not.toHaveBeenCalled();
    const fresh = setup();
    await expect(fresh.service.completeHandover('appointment', { note: 'Đã giao' }, staff)).rejects.toThrow('biên bản');
    expect(fresh.update).not.toHaveBeenCalled();
  });
  it('keeps role and contract readiness checks before confirming a handover', async () => {
    const state = setup();
    await expect(state.service.completeHandover('appointment', { handoverReport: report }, { ...staff, role: 'FACILITY_MANAGER' })).rejects.toThrow('nhân viên');
    state.row.reservation.invoices[0].status = 'OPEN';
    await expect(state.service.completeHandover('appointment', { handoverReport: report }, staff)).rejects.toThrow('thanh toán');
    expect(state.update).not.toHaveBeenCalled();
  });
  it('requires complete, distinct physical unit checks when the client sends a checklist', async () => {
    const { service, row, update } = setup();
    addSecondUnit(row);
    const one = { unitId: 'unit', unitCode: 'Invoice-01', condition: 'Cửa và sàn tốt', inspected: true };
    const two = { unitId: 'unit-2', condition: 'Có vết xước nhẹ', inspected: true };
    for (const unitChecks of [[one], [one, one], [one, { ...two, inspected: false }], [one, { ...two, unitId: 'unallocated' }]]) {
      await expect(service.completeHandover('appointment', { handoverReport: { ...report, unitChecks } }, staff)).rejects.toThrow();
    }
    expect(update).not.toHaveBeenCalled();
    const result = await service.completeHandover('appointment', { handoverReport: { ...report, unitChecks: [two, one] } }, staff);
    expect(result.handoverReport).toMatchObject({ unitChecks: [
      { ...one, unitCode: 'A01' }, { ...two, unitCode: 'A02' },
    ] });
    expect(result.handoverNote).toContain('Kho A02: Có vết xước nhẹ');
    await service.completeHandover('appointment', {}, staff);
    expect(update).toHaveBeenCalledOnce();
  });

  it('records each physical handover independently and preserves the two saved times through retries and finalization', async () => {
    const { service, row, update } = setup();
    addSecondUnit(row);
    const begin = new Date();
    const later = new Date(begin.getTime() + 1000);
    const capture = { condition: 'Cửa và khóa bình thường', inspected: true, identityVerified: true, accessDelivered: true };
    vi.setSystemTime(begin);
    try {
      await expect(service.recordUnitHandover('appointment', 'unit', capture, { ...staff, id: 'other' })).rejects.toThrow('được giao');
      await expect(service.recordUnitHandover('appointment', 'foreign', capture, staff)).rejects.toThrow('không thuộc');
      const first = await service.recordUnitHandover('appointment', 'unit', capture, staff);
      expect(first.status).toBe('CONFIRMED');
      expect(first.unitHandoverProgress).toEqual([expect.objectContaining({ unitId: 'unit', completedAt: begin.toISOString() })]);
      expect(first.activityUpdatedAt).toBe(row.updatedAt.toISOString());
      await expect(service.completeHandover('appointment', { handoverReport: report }, staff)).rejects.toThrow('từng kho');
      vi.setSystemTime(later);
      const retry = await service.recordUnitHandover('appointment', 'unit', capture, staff);
      expect(retry.unitHandoverProgress).toEqual(first.unitHandoverProgress);
      const second = await service.recordUnitHandover('appointment', 'unit-2', capture, staff);
      expect(second.unitHandoverProgress).toEqual([...first.unitHandoverProgress!, expect.objectContaining({ unitId: 'unit-2', completedAt: later.toISOString() })]);
      const done = await service.completeHandover('appointment', { handoverReport: report }, staff);
      expect(done.status).toBe('COMPLETED');
      expect(done.handoverReport.unitChecks).toEqual([
        expect.objectContaining({ unitId: 'unit', completedAt: begin.toISOString() }),
        expect.objectContaining({ unitId: 'unit-2', completedAt: later.toISOString() }),
      ]);
      expect((await service.recordUnitHandover('appointment', 'unit', capture, staff)).status).toBe('COMPLETED');
      expect(update).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
});
