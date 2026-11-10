import { describe, expect, it, vi } from 'vitest';
import { AppointmentsService } from './appointments.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
const report = { condition: 'Kho sạch, cửa và khóa bình thường', accessItemCount: 1, identityVerified: true, unitInspected: true, accessDelivered: true, documentsDelivered: true };

function setup(status = 'CONFIRMED') {
  const now = new Date();
  const startDate = new Date(now.getTime() + 86400000);
  const endDate = new Date(now.getTime() + 31 * 86400000);
  const row = {
    id: 'appointment', appointmentCode: 'A01', status,
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
  const tx = { $queryRaw: vi.fn(), handoverAppointment: { findUnique: vi.fn().mockResolvedValue(row), update }, rentalContract: { count: vi.fn().mockResolvedValue(0) } };
  const prisma = {
    handoverAppointment: { findFirst: vi.fn().mockResolvedValue({ id: row.id }) },
    $transaction: vi.fn(operation => operation(tx)),
  };
  return { service: new AppointmentsService(prisma as never, {} as never, {} as never), row, update };
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
    await expect(state.service.completeHandover('appointment', { handoverReport: report }, { ...staff, role: 'MANAGER' })).rejects.toThrow('nhân viên');
    state.row.reservation.invoices[0].status = 'OPEN';
    await expect(state.service.completeHandover('appointment', { handoverReport: report }, staff)).rejects.toThrow('thanh toán');
    expect(state.update).not.toHaveBeenCalled();
  });
});
