import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';
import { assertTaskFacility } from '../facility-access/task-access.js';

export const CLOSURE_BOOKING_REFUND_PENDING = 'CLOSURE_BOOKING_REFUND_PENDING';
const refundPending = CLOSURE_BOOKING_REFUND_PENDING;
export const CLOSURE_BOOKING_REFUND_RECORDED = 'CLOSURE_BOOKING_REFUND_RECORDED';
const refundRecorded = CLOSURE_BOOKING_REFUND_RECORDED;
const cancelled = 'CLOSURE_BOOKING_CANCELLED';
const bookingCaseKey = (id: string) => 'closure-booking:' + id;

export function closureBookingCaseView(record: { status: string; lastAction: string | null; earlyReturnFinancialReview: Prisma.JsonValue } | null | undefined) {
  if (!record) return null;
  const evidence = record.earlyReturnFinancialReview as { refundAmount?: string } | null;
  return { status: record.lastAction, refundAmount: evidence?.refundAmount ?? '0', confirmed: record.status === 'RESOLVED' };
}

export async function resolveClosureBooking(tx: Prisma.TransactionClient, id: string, actor: PublicUser, input: Record<string, unknown>) {
  if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được xử lý hồ sơ đặt kho này.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length < 3 || note.length > 2000) throw new BadRequestException('Cần căn cứ xử lý dài 3–2000 ký tự.');
  if (input.action !== 'CANCEL' && input.action !== 'CONFIRM_REFUND') throw new BadRequestException('Chọn thao tác xử lý đơn.');

  await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id=${id} FOR UPDATE`;
  const booking = await tx.reservation.findUnique({ where: { id }, include: {
    contracts:{select:{id:true,status:true,activatedAt:true}},
    units:{where:{releasedAt:null},select:{id:true,actualVacatedAt:true,storageUnit:{select:{status:true,storageType:{select:{facilityId:true}}}}}},
    appointments:{where:{status:{not:'CANCELLED'}},select:{status:true,handoverReport:true}},
    services:{select:{serviceKindSnapshot:true,fulfillmentStatus:true}},
    invoices:{select:{id:true,invoiceCode:true,status:true,type:true,amountPaid:true,totalAmount:true,balanceDue:true,
      payments:{select:{id:true,amount:true}},
      paymentSubmissions:{where:{OR:[{status:'PENDING_VERIFICATION'},{reconciliation:{is:{status:{not:'RECONCILED'}}}}]},select:{id:true}},
      onlinePaymentTransactions:{where:{OR:[{status:'PENDING',createdAt:{gt:new Date(Date.now()-ONLINE_PAYMENT_TTL_MS)}},{reconciliation:{is:{status:{not:'RECONCILED'}}}}]},select:{id:true}},
    }},
  }});
  if (!booking) throw new NotFoundException('Không tìm thấy đơn đặt kho.');
  await assertTaskFacility(tx,actor,{reservationId:id});
  const key = bookingCaseKey(id);
  const previous = await tx.supportRequest.findUnique({where:{idempotencyKey:key}});
  if (input.action === 'CONFIRM_REFUND') {
    if (previous?.lastAction === refundRecorded) return closureBookingCaseView(previous);
    if (booking.status !== 'CANCELLED' || previous?.lastAction !== refundPending || previous.status === 'RESOLVED' || input.refunded !== true)
      throw new ConflictException('Chưa có khoản hoàn hợp lệ hoặc chưa xác nhận đã hoàn thực tế.');
    const evidence = previous.earlyReturnFinancialReview as { refundAmount?: string } | null;
    if (typeof evidence?.refundAmount !== 'string' || !/^[1-9]\d*$/.test(evidence.refundAmount) || input.refundAmount !== evidence.refundAmount)
      throw new ConflictException('Số tiền cần hoàn đã thay đổi. Hãy tải lại hồ sơ.');
    const updated = await tx.supportRequest.update({where:{id:previous.id},data:{
      status:'RESOLVED',lastAction:refundRecorded,resolutionType:'MANAGER_RESOLVED',resolutionNote:'NestBox đã ghi nhận hoàn tiền cho khách.',resolvedAt:new Date(),resolvedByUserId:actor.id,
    }});
    await recordAudit(tx,actor,booking,refundRecorded,{note,refundAmount:evidence.refundAmount,caseId:previous.id});
    return closureBookingCaseView(updated);
  }
  if (previous) return closureBookingCaseView(previous);
  if (input.customerAgreed !== true) throw new BadRequestException('Cần xác nhận khách đã đồng ý hủy đơn.');
  const facilities = await tx.$queryRaw<{ operationalStatus: string; closurePlanId: string | null }[]>`SELECT "operationalStatus", "closurePlanId" FROM "Facility" WHERE id=${booking.facilityId} FOR SHARE`;
  const facility = facilities[0];
  if (facility?.operationalStatus !== 'CLOSING' || !facility.closurePlanId || booking.status !== 'CONFIRMED')
    throw new ConflictException('Chỉ hủy đơn đã xác nhận thuộc kế hoạch ngừng kinh doanh đang hoạt động.');
  if (booking.contracts.some(contract=>contract.activatedAt || !['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(contract.status)) ||
      booking.units.some(unit=>unit.actualVacatedAt || unit.storageUnit.status==='OCCUPIED' || unit.storageUnit.storageType.facilityId!==booking.facilityId) ||
      booking.appointments.some(appointment=>appointment.status==='COMPLETED' || appointment.handoverReport))
    throw new ConflictException('Đơn có dấu vết bàn giao thực tế. Cần xử lý trên hồ sơ bàn giao hoặc trả kho.');
  if (booking.services.some(service=>service.fulfillmentStatus==='FULFILLED'))
    throw new ConflictException('Có sản phẩm đã giao. Cần đối soát quyền lợi trước khi hủy.');

  const refunds: { invoiceId: string; paymentIds: string[]; amount: string }[] = [];
  let refundAmount = 0n;
  for (const invoice of booking.invoices) {
    if (invoice.paymentSubmissions.length || invoice.onlinePaymentTransactions.length) throw new ConflictException(`Hóa đơn ${invoice.invoiceCode} còn giao dịch cần đối soát.`);
    const collected = invoice.payments.reduce((sum,payment)=>sum+payment.amount,0n);
    if (invoice.status==='VOID' && collected===0n && invoice.amountPaid===0n) continue;
    if (invoice.type!=='INITIAL' || !['OPEN','PARTIALLY_PAID','PAID'].includes(invoice.status) || collected!==invoice.amountPaid || collected<0n || invoice.totalAmount!==collected+invoice.balanceDue)
      throw new ConflictException(`Chưa đối soát được hóa đơn ${invoice.invoiceCode}.`);
    if (collected>0n) {
      refundAmount += collected;
      refunds.push({invoiceId:invoice.id,paymentIds:invoice.payments.map(payment=>payment.id),amount:String(collected)});
    }
  }
  if (refundAmount>0n && booking.services.some(service=>service.serviceKindSnapshot==='PURCHASE' && service.fulfillmentStatus===null))
    throw new ConflictException('Cần đối soát trạng thái sản phẩm trước khi lập khoản hoàn.');

  const now = new Date();
  const status = refundAmount > 0n ? refundPending : cancelled;
  const financialReview = { refundAmount:String(refundAmount),refunds,closurePlanId:facility.closurePlanId,consentRecordedAt:now.toISOString(),consentRecordedBy:actor.id };
  await tx.invoice.updateMany({where:{reservationId:id,status:{in:['OPEN','PARTIALLY_PAID']}},data:{status:'VOID',balanceDue:0n,voidedAt:now,voidReason:'Hủy đơn chưa bàn giao do cơ sở ngừng kinh doanh.'}});
  await tx.handoverAppointment.updateMany({where:{reservationId:id,status:{in:['REQUESTED','CONFIRMED']}},data:{status:'CANCELLED',cancelledAt:now,activeKey:null}});
  await tx.rentalContract.updateMany({where:{reservationId:id,status:{in:['PENDING_PAYMENT','READY_FOR_HANDOVER']}},data:{status:'CANCELLED'}});
  await tx.reservationUnit.updateMany({where:{reservationId:id,releasedAt:null},data:{releasedAt:now}});
  await tx.reservationService.updateMany({where:{reservationId:id,OR:[{fulfillmentStatus:'RESERVED'},{serviceKindSnapshot:'RENTAL',fulfillmentStatus:null}]},data:{fulfillmentStatus:'RELEASED'}});
  await tx.reservation.update({where:{id},data:{status:'CANCELLED'}});
  const task = await tx.supportRequest.create({data:{
    idempotencyKey:key,supportCode:'WDP-SUP-'+randomUUID(),reservationId:id,customerUserId:booking.customerId,closurePlanId:facility.closurePlanId,
    category:'OTHER',priority:'HIGH',status:refundAmount>0n?'OPEN':'RESOLVED',lastAction:status,subject:'Hủy đặt kho do cơ sở ngừng kinh doanh',
    description:refundAmount>0n?`Đơn chưa bàn giao đã được hủy theo thỏa thuận. Khoản hoàn theo đối soát là ${refundAmount.toLocaleString('vi-VN')} đ.`:'Đơn chưa bàn giao đã được hủy theo thỏa thuận.',
    ...(refundAmount===0n?{resolutionType:'MANAGER_RESOLVED',resolvedAt:now,resolvedByUserId:actor.id}:{}),
    earlyReturnFinancialReview:{ refundAmount:financialReview.refundAmount },
  }});
  await recordAudit(tx,actor,booking,status,{note,...financialReview,caseId:task.id});
  return closureBookingCaseView(task);
}

async function recordAudit(tx: Prisma.TransactionClient, actor: PublicUser, booking: {id:string;customerId:string;facilityId:string;reservationCode:string}, action: string, metadata: Prisma.InputJsonObject) {
  await tx.auditEvent.create({data:{category:'ACTIVITY',action,outcome:'SUCCESS',actorId:actor.id,actorRole:actor.role,actorName:actor.fullName,actorEmail:actor.email,
    resource:'relocation',resourceId:booking.id,method:'POST',route:'/relocations/bookings/resolve',httpStatus:201,
    metadata:{...metadata,customerId:booking.customerId,sourceFacilityId:booking.facilityId,code:booking.reservationCode}}});
}
