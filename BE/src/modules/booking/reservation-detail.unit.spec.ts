import type { PublicUser } from '../auth/auth.types.js';
import { reservationWorkflow } from './reservation-detail.js';

const customer = { id: 'customer', fullName: 'Khách thuê' };
const staff = { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser;
const createdAt = new Date('2026-11-15T02:00:00Z');
const confirmedAt = new Date('2026-11-15T03:00:00Z');
const signedAt = new Date('2026-11-15T04:00:00Z');
const scheduledAt = new Date('2026-11-22T03:00:00Z');
type RecordInput = Parameters<typeof reservationWorkflow>[0];

function confirmed() {
  return {
    status: 'CONFIRMED', quantity: 2, customerId: customer.id, customer, createdAt, confirmedAt,
    units: [{ id: 'allocation-a', releasedAt: null }, { id: 'allocation-b', releasedAt: null }],
    contracts: [
      { contractCode: 'C01', status: 'READY_FOR_HANDOVER', reservationUnitId: 'allocation-a', termsAcceptedAt: signedAt, termsAcceptedByUserId: customer.id },
      { contractCode: 'C02', status: 'READY_FOR_HANDOVER', reservationUnitId: 'allocation-b', termsAcceptedAt: signedAt, termsAcceptedByUserId: customer.id },
    ],
    invoices: [{ invoiceCode: 'I01', status: 'OPEN', currency: 'VND', totalAmount: 4000000n, balanceDue: 4000000n, amountPaid: 0n,
      rentalAmount: 2000000n, depositAmount: 2000000n, serviceAmount: 0n, chargeAmount: 0n, issuedAt: confirmedAt, paidAt: null, pricingSnapshot: null }],
    appointments: [{
      id: 'private-appointment', appointmentCode: 'A01', status: 'CONFIRMED', scheduledAt, createdAt,
      confirmedAt, completedAt: null, assignedStaffUserId: staff.id, completedByUserId: null,
      assignedStaff: { accountStatus: 'ACTIVE', role: 'FACILITY_STAFF' }, requestedBy: customer, confirmedBy: { fullName: 'Nhân viên' }, completedBy: null,
    }],
  };
}

describe('Reservation read model for staff', () => {
  it('requires allocations and actual customer signatures and payment before reporting handover readiness', () => {
    const record = confirmed();
    const projection = () => reservationWorkflow(record as unknown as RecordInput, staff);
    expect(projection()).toMatchObject({ allocationComplete: true, contractsSigned: true, handoverReady: false,
      paymentStatus: 'OPEN', initialInvoice: null });
    expect(projection().history.some(event => event.result === 'I01')).toBe(false);
    expect(reservationWorkflow(record as unknown as RecordInput).initialInvoice).toMatchObject({ status: 'OPEN', total: 4000000 });
    Object.assign(record.invoices[0], { status: 'PAID', paidAt: signedAt, balanceDue: 0n, amountPaid: 4000000n });
    expect(projection()).toMatchObject({ handoverReady: true, appointment: { id: 'private-appointment', assignment: 'SELF' } });
    expect(projection().history.some(event => event.action === 'Bàn giao kho')).toBe(false);
    record.contracts[1].termsAcceptedByUserId = 'different-user';
    expect(projection()).toMatchObject({ contractsSigned: false, handoverReady: false });
    record.units.pop();
    expect(projection().allocationComplete).toBe(false);
  });

  it('redacts the details of an appointment another staff member cannot open', () => {
    const record = confirmed() as unknown as RecordInput;
    const projection = reservationWorkflow(record, { ...staff, id: 'other-staff' });
    expect(projection.appointment).toEqual({ status: 'CONFIRMED', assignment: 'OTHER' });
    expect(projection.history.some(event => event.action === 'Xác nhận lịch bàn giao')).toBe(false);
    Object.assign(record.appointments[0], {
      assignedStaffUserId: null, assignedStaff: null, status: 'COMPLETED', completedAt: scheduledAt,
      completedByUserId: staff.id, completedBy: { fullName: 'Nhân viên' },
    });
    const legacy = reservationWorkflow(record, staff);
    expect(legacy.appointment?.id).toBe('private-appointment');
    expect(legacy.history[0]).toMatchObject({ action: 'Bàn giao kho', actor: 'Nhân viên', at: scheduledAt });
  });
});
