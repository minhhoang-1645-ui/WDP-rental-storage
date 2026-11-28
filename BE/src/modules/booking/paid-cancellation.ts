import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { businessToday } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';
import { invoiceMoney, savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertActiveAssignee, assertAssignmentVersion, managerAssignmentInput } from '../facility-access/operational-assignment.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTaskFacility } from '../facility-access/task-access.js';
import { pricingPolicyValidators, type PricingPolicySnapshot } from '../policies/pricing-policy.js';
import type { AdditionalServiceInventoryService } from '../additional-services/additional-service-inventory.service.js';
import { readUnitHandoverDraft } from '../appointments/handover-report.js';

const day = 86_400_000;
const include = {
  contracts: { select: { status: true, activatedAt: true, termsAcceptedAt: true } },
  units: { where: { releasedAt: null }, include: { storageUnit: { include: { storageType: { select: { facilityId: true } } } } } },
  appointments: { orderBy: { id: 'asc' } }, services: true,
  invoices: { orderBy: { id: 'asc' }, include: {
    payments: { select: { id: true, amount: true }, orderBy: { id: 'asc' } },
    paymentSubmissions: { where: { OR: [{ status: 'PENDING_VERIFICATION' }, { reconciliation: { is: { status: { not: 'RECONCILED' } } } }] }, select: { id: true } },
    onlinePaymentTransactions: { where: { OR: [{ status: 'PENDING' }, { reconciliation: { is: { status: { not: 'RECONCILED' } } } }] }, select: { createdAt: true, status: true, reconciliation: { select: { status: true } } } },
  } }, facility: { select: { operationalStatus: true } },
} satisfies Prisma.ReservationInclude;
type Booking = Prisma.ReservationGetPayload<{ include: typeof include }>;
type Cancellation = { state: 'REQUESTED' | 'REFUND_PENDING' | 'REFUNDED' | 'COMPLETED' | 'REJECTED'; requestedAt: string;
  quote: ReturnType<typeof cancellationQuote>; verification?: { at: string; staffId: string; evidence: string }; refundDueOn?: string;
  recoveryStaffId?: string; approvedAt?: string; note?: string; refundedAt?: string; refundReference?: string };

export function cancellationQuote(booking: Booking, now: Date) {
  const agreed = (booking.quoteSnapshot as { pricingPolicy?: PricingPolicySnapshot } | null)?.pricingPolicy?.cancellation;
  if (!agreed || booking.status !== 'CONFIRMED' || booking.facility.operationalStatus !== 'OPEN' ||
     booking.contracts.length !== booking.quantity || booking.units.length !== booking.quantity ||
     booking.contracts.some(contract => contract.activatedAt || !contract.termsAcceptedAt || !['PENDING_PAYMENT', 'READY_FOR_HANDOVER'].includes(contract.status)) ||
     booking.units.some(unit => unit.actualVacatedAt || unit.storageUnit.status === 'OCCUPIED' || unit.storageUnit.storageType.facilityId !== booking.facilityId)) {
    throw new ConflictException('Đơn không đủ điều kiện hủy theo chính sách. Nếu kho đã sử dụng, hãy yêu cầu trả kho.');
  }
  const invoice = booking.invoices.find(item => item.type === 'INITIAL' && item.status !== 'VOID');
  if (!invoice || booking.invoices.some(item => item.id !== invoice.id && (item.status !== 'VOID' || item.amountPaid || item.payments.length))) {
    throw new ConflictException('Cần đối soát chứng từ của đơn đặt kho.');
  }
  const collected = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0n);
  if (!collected || collected !== invoice.amountPaid || collected !== invoice.totalAmount || invoice.balanceDue !== 0n || invoice.status !== 'PAID' ||
     invoice.paymentSubmissions.length || invoice.onlinePaymentTransactions.some(item => item.reconciliation && item.reconciliation.status !== 'RECONCILED' ||
       item.status === 'PENDING' && +item.createdAt > +now - ONLINE_PAYMENT_TTL_MS)) {
    throw new ConflictException({ code: 'CANCELLATION_RECONCILIATION_REQUIRED', message: 'Cần quản lý đối soát số đã thu hoặc khoản trả một phần trước khi lập khoản hoàn.' });
  }
  const details = savedInvoiceBreakdown(invoice.pricingSnapshot, invoice);
  if (!details || details.adjustmentAmount || details.units.length !== booking.quantity || new Set(details.units.map(unit => unit.contractId)).size !== booking.quantity) {
    throw new ConflictException('Hóa đơn thiếu phân bổ tiền thuê, cọc hoặc dịch vụ. Cần đối soát.');
  }
  const rule = pricingPolicyValidators.cancellation(agreed.value);
  const days = Math.round((+booking.startDate - +businessToday(now)) / day);
  const percent = days >= rule.farDays ? rule.farPercent : days >= rule.nearDays ? rule.middlePercent : days > 0 ? rule.nearPercent : rule.startedPercent;
  const services = details.sharedServices.map(line => {
    const service = booking.services.find(row => row.id === line.id);
    if (!service || !['RESERVED', 'FULFILLED'].includes(service.fulfillmentStatus ?? '') && service.serviceKindSnapshot !== 'RENTAL') {
      throw new ConflictException('Trạng thái bàn giao dịch vụ cần đối soát.');
    }
    return { id: line.id, name: line.name, amount: service.fulfillmentStatus === 'FULFILLED' ? 0 : line.amount };
  });
  const requiresRecovery = booking.appointments.some(item => item.status === 'COMPLETED' || readUnitHandoverDraft(item.handoverReport).unitProgress.length) ||
    booking.services.some(item => item.serviceKindSnapshot === 'RENTAL' && item.fulfillmentStatus === 'FULFILLED');
  const rent = (invoice.rentalAmount * BigInt(percent) + 50n) / 100n;
  const quote = { invoiceId: invoice.id, paymentIds: invoice.payments.map(item => item.id), version: agreed.version, percent, requiresRecovery,
    rent: invoiceMoney(rent), deposit: invoiceMoney(invoice.depositAmount), services, refundDays: rule.refundDays,
    total: invoiceMoney(rent + invoice.depositAmount + services.reduce((sum, item) => sum + BigInt(item.amount), 0n)) };
  return { ...quote, confirmation: createHash('sha256').update(JSON.stringify(quote)).digest('hex') };
}

export async function paidCancellation(tx: Prisma.TransactionClient, actor: PublicUser, ref: string, action: 'GET' | 'REQUEST' | 'RECOVER' | 'ASSIGN_RECOVERY' | 'APPROVE' | 'REJECT' | 'REFUND', input: Record<string, unknown>, inventory: AdditionalServiceInventoryService) {
  const allowed = actor.role === 'STORAGE_CUSTOMER' ? ['GET', 'REQUEST'] : actor.role === 'FACILITY_STAFF' ? ['RECOVER']
    : actor.role === 'FACILITY_MANAGER' ? ['GET', 'ASSIGN_RECOVERY', 'APPROVE', 'REJECT', 'REFUND'] : [];
  if (!allowed.includes(action)) throw new ForbiddenException('Không có quyền xử lý thao tác hủy đơn.');
  const identity = await tx.reservation.findFirst({ where: { OR: [{ id: ref }, { reservationCode: ref }],
    ...(actor.role === 'STORAGE_CUSTOMER' ? { customerId: actor.id } : {}) }, select: { id: true } });
  if (!identity) throw new NotFoundException('Không tìm thấy đơn đặt kho.');
  const { id } = identity;
  if (action !== 'GET') {
    await tx.$queryRaw`SELECT id FROM "HandoverAppointment" WHERE "reservationId"=${id} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id=${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "reservationId"=${id} ORDER BY id FOR UPDATE`;
  }
  if (actor.role !== 'STORAGE_CUSTOMER') await assertTaskFacility(tx, actor, { reservationId: id });
  const booking = await tx.reservation.findUniqueOrThrow({ where: { id }, include });
  const record = booking.paidCancellation as Cancellation | null;
  const now = new Date(), at = now.toISOString();
  const result = (entry: Cancellation) => actor.role === 'FACILITY_MANAGER' ? entry : { state: entry.state, requestedAt: entry.requestedAt,
    quote: { ...entry.quote, paymentIds: undefined }, refundDueOn: entry.refundDueOn, refundedAt: entry.refundedAt, requiresRecovery: entry.quote.requiresRecovery && !entry.verification };
  if (action === 'GET') {
    if (record) return result(record);
    if (actor.role !== 'STORAGE_CUSTOMER') return null;
    return { state: 'QUOTE', quote: { ...cancellationQuote(booking, now), paymentIds: undefined } };
  }
  let entry: Cancellation;
  if (action === 'REQUEST') {
    if (record) return result(record);
    const quote = cancellationQuote(booking, now);
    if (input.confirmed !== true || input.confirmation !== quote.confirmation) throw new ConflictException('Số tiền hoặc điều kiện hoàn đã thay đổi. Vui lòng xem và xác nhận lại.');
    entry = { state: 'REQUESTED', requestedAt: at, quote };
  } else {
    if (!record) throw new NotFoundException('Chưa có hồ sơ hủy đơn.');
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3 || note.length > 500) throw new BadRequestException('Cần ghi căn cứ từ 3 đến 500 ký tự.');
    if (action === 'REFUND') {
      if (record.state === 'REFUNDED' && record.refundReference === input.reference && record.quote.total === input.amount) return result(record);
      if (record.state !== 'REFUND_PENDING' || input.refunded !== true || input.amount !== record.quote.total || typeof input.reference !== 'string' || !/^[\p{L}\d][\p{L}\d _./-]{2,119}$/u.test(input.reference)) throw new ConflictException('Cần xác nhận đúng số đã hoàn và nhập mã giao dịch thực tế.');
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`booking-refund:${input.reference}`}))`;
      if (await tx.reservation.count({ where: { id: { not: id }, paidCancellation: { path: ['refundReference'], equals: input.reference } } }) ||
        await tx.transferRequest.count({ where: { commercialSettlement: { path: ['refundReference'], equals: input.reference } } })) throw new ConflictException('Mã hoàn tiền đã được dùng.');
      entry = { ...record, state: 'REFUNDED', refundReference: input.reference, refundedAt: at, note };
    } else {
      if (record.state !== 'REQUESTED') return result(record);
      if (action === 'ASSIGN_RECOVERY') {
        if (!record.quote.requiresRecovery || record.verification) throw new ConflictException('Hồ sơ không còn chờ thu hồi quyền truy cập.');
        const staffId = managerAssignmentInput(actor, input);
        assertAssignmentVersion(input, record.recoveryStaffId);
        await assertActiveAssignee(tx, staffId, actor, { reservationId: id });
        if (!booking.appointments.some(item => ['CONFIRMED', 'COMPLETED'].includes(item.status))) {
          throw new ConflictException('Không còn lịch bàn giao để xác minh thu hồi.');
        }
        await recordAssignment(tx, actor, 'reservation-recovery', id, record.recoveryStaffId, staffId, { note, facilityId: booking.facilityId });
        entry = { ...record, recoveryStaffId: staffId };
      } else if (action === 'RECOVER') {
        const assigned = record.recoveryStaffId ? record.recoveryStaffId === actor.id :
          booking.appointments.some(item => (item.assignedStaffUserId === actor.id || item.completedByUserId === actor.id) &&
            ['CONFIRMED', 'COMPLETED'].includes(item.status));
        if (!assigned) throw new ForbiddenException('Chỉ nhân viên được giao mới được xác nhận thu hồi.');
        if (record.verification) return result(record);
        if (!record.quote.requiresRecovery || input.neverUsed !== true || input.unitEmpty !== true || input.accessRevoked !== true || input.equipmentReturned !== true) throw new ConflictException('Nhân viên phụ trách cần xác nhận kho chưa sử dụng, đã thu hồi quyền truy cập và thiết bị.');
        cancellationQuote(booking, new Date(record.requestedAt));
        entry = { ...record, verification: { at, staffId: actor.id, evidence: note } };
      } else if (action === 'REJECT') {
        if (record.verification) await tx.handoverAppointment.updateMany({ where: { reservationId: id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
          data: { status: 'CANCELLED', activeKey: null, cancelledAt: now } });
        entry = { ...record, state: 'REJECTED', note };
      }
      else {
        const quote = cancellationQuote(booking, new Date(record.requestedAt));
        if (quote.confirmation !== record.quote.confirmation || quote.requiresRecovery && !record.verification) throw new ConflictException('Khoản hoàn đã thay đổi hoặc chưa có xác nhận thu hồi thực tế.');
        await tx.handoverAppointment.updateMany({ where: { reservationId: id, status: { in: ['REQUESTED', 'CONFIRMED'] } }, data: { status: 'CANCELLED', activeKey: null, cancelledAt: now } });
        await tx.rentalContract.updateMany({ where: { reservationId: id, status: { in: ['PENDING_PAYMENT', 'READY_FOR_HANDOVER'] } }, data: { status: 'CANCELLED' } });
        await tx.reservationUnit.updateMany({ where: { reservationId: id, releasedAt: null }, data: { releasedAt: now } });
        await inventory.releasePurchases(tx, id);
        await tx.reservationService.updateMany({ where: { reservationId: id, serviceKindSnapshot: 'RENTAL', fulfillmentStatus: { not: 'RELEASED' } }, data: { fulfillmentStatus: 'RELEASED' } });
        entry = { ...record, state: quote.total ? 'REFUND_PENDING' : 'COMPLETED', approvedAt: at, note,
          ...(quote.total ? { refundDueOn: new Date(+businessToday(now) + quote.refundDays * day).toISOString().slice(0, 10) } : {}) };
      }
    }
  }
  await tx.reservation.update({ where: { id }, data: { paidCancellation: entry as Prisma.InputJsonValue,
    ...(action === 'APPROVE' ? { status: 'CANCELLED' } : {}) } });
  await tx.auditEvent.create({ data: { action: `BOOKING_CANCELLATION_${action}`, category: 'ACTIVITY', outcome: 'SUCCESS', actorId: actor.id,
    actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email, resource: 'reservations', resourceId: id, method: 'POST', route: '/reservations/:id/paid-cancellation', httpStatus: 201,
    metadata: { customerId: booking.customerId, facilityId: booking.facilityId, state: entry.state, refundAmount: entry.quote.total } } });
  return result(entry);
}
