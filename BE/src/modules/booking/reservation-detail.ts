import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { invoiceMoney, savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';

export const reservationDetailInclude = {
  customer: true,
  storageType: true,
  units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } },
  contracts: {
    select: { contractCode: true, status: true, reservationUnitId: true, termsAcceptedAt: true, termsAcceptedByUserId: true },
    orderBy: { contractCode: 'asc' },
  },
  invoices: {
    where: { type: 'INITIAL' },
    select: {
      invoiceCode: true, status: true, totalAmount: true, amountPaid: true, balanceDue: true, paidAt: true, issuedAt: true,
      currency: true, rentalAmount: true, depositAmount: true, serviceAmount: true, chargeAmount: true, pricingSnapshot: true,
    },
  },
  appointments: {
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true, appointmentCode: true, status: true, scheduledAt: true, createdAt: true, confirmedAt: true, completedAt: true,
      assignedStaffUserId: true, completedByUserId: true,
      assignedStaff: { select: { accountStatus: true, role: true } },
      requestedBy: { select: { fullName: true } },
      confirmedBy: { select: { fullName: true } },
      completedBy: { select: { fullName: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.ReservationInclude;

type ReservationDetailRecord = Prisma.ReservationGetPayload<{ include: typeof reservationDetailInclude }>;

export function reservationWorkflow(record: ReservationDetailRecord, actor?: PublicUser) {
  const invoice = record.invoices.length === 1 ? record.invoices[0] : null;
  const staff = actor?.role === 'STAFF';
  const contracts = record.contracts.map(contract => ({
    code: contract.contractCode,
    status: contract.status,
    allocationId: contract.reservationUnitId,
    acceptedAt: contract.termsAcceptedByUserId === record.customerId ? contract.termsAcceptedAt : null,
  }));
  const allocationIds = new Set(record.units.filter(unit => !unit.releasedAt).map(unit => unit.id));
  const allocationComplete = allocationIds.size === record.quantity && contracts.length === record.quantity &&
    contracts.every(contract => allocationIds.has(contract.allocationId));
  const contractsSigned = allocationComplete && contracts.every(contract => Boolean(contract.acceptedAt));
  const handoverReady = record.status === 'CONFIRMED' && contractsSigned && invoice?.status === 'PAID' &&
    contracts.every(contract => contract.status === 'READY_FOR_HANDOVER');

  const appointment = record.appointments.find(item => item.status === 'COMPLETED') ?? record.appointments[0];
  const ownAppointment = staff && Boolean(appointment &&
    (appointment.assignedStaffUserId === actor.id || (!appointment.assignedStaffUserId &&
      appointment.status === 'COMPLETED' && appointment.completedByUserId === actor.id)));
  const assignment = appointment?.assignedStaff?.role === 'STAFF' && appointment.assignedStaff.accountStatus === 'ACTIVE'
    ? ownAppointment ? 'SELF' : 'OTHER' : 'UNASSIGNED';
  const history = [
    { at: record.createdAt, action: 'Gửi yêu cầu', actor: record.customer.fullName, result: 'Đã tiếp nhận' },
    ...(record.confirmedAt ? [{ at: record.confirmedAt, action: 'Xác nhận đặt kho', actor: null, result: 'Đã xác nhận' }] : []),
    ...contracts.flatMap(contract => contract.acceptedAt
      ? [{ at: contract.acceptedAt, action: 'Ký hợp đồng', actor: record.customer.fullName, result: contract.code }] : []),
    ...(invoice && !staff ? [{ at: invoice.issuedAt, action: 'Lập hóa đơn ban đầu', actor: null, result: invoice.invoiceCode }] : []),
    ...(invoice?.paidAt && invoice.status === 'PAID' ? [{ at: invoice.paidAt, action: 'Thanh toán hóa đơn ban đầu', actor: null, result: 'Đã thanh toán đủ' }] : []),
    ...(appointment && ownAppointment ? [
      { at: appointment.createdAt, action: 'Đặt lịch bàn giao', actor: appointment.requestedBy.fullName, result: 'Đã tạo lịch' },
      ...(appointment.confirmedAt ? [{ at: appointment.confirmedAt, action: 'Xác nhận lịch bàn giao', actor: appointment.confirmedBy?.fullName ?? null, result: 'Đã xác nhận lịch' }] : []),
      ...(appointment.completedAt && appointment.status === 'COMPLETED' ? [{ at: appointment.completedAt, action: 'Bàn giao kho', actor: appointment.completedBy?.fullName ?? null, result: 'Đã hoàn tất' }] : []),
    ] : []),
  ].sort((left, right) => right.at.getTime() - left.at.getTime());

  return {
    contracts, allocationComplete, contractsSigned, handoverReady, history,
    ...(staff ? { paymentStatus: invoice?.status ?? null } : {}),
    initialInvoice: !staff && invoice ? {
      code: invoice.invoiceCode,
      status: invoice.status,
      total: invoiceMoney(invoice.totalAmount),
      paid: invoiceMoney(invoice.amountPaid),
      balance: invoiceMoney(invoice.balanceDue),
      currency: invoice.currency,
      breakdown: savedInvoiceBreakdown(invoice.pricingSnapshot, invoice),
    } : null,
    appointment: appointment ? {
      status: appointment.status,
      assignment,
      ...(ownAppointment ? { id: appointment.id, code: appointment.appointmentCode, scheduledAt: appointment.scheduledAt } : {}),
    } : null,
  };
}
