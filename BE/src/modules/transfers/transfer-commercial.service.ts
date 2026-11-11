import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { businessToday } from '../../business-date.js';
import { DocumentPolicy } from '../documents/document-policy.js';

@Injectable()
export class TransferCommercialService {
  constructor(private readonly policy: DocumentPolicy) {}
  async prepare(tx: Prisma.TransactionClient, transfer: any, destination: any) {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: transfer.reservationId }, include: { contracts: true, customer: { select: { fullName: true, email: true, phone: true } } } });
    // Current reservation pricing/renewals are homogeneous. Do not silently reprice unrelated contracts.
    if (reservation.quantity !== 1) throw new ConflictException('Đổi loại kho hiện chỉ áp dụng cho đơn có một kho. Đơn nhiều kho cần phương án tách hợp đồng và bảng giá riêng, không tự đổi giá những kho còn lại.');
    if (await tx.renewalRequest.count({ where: { reservationId: reservation.id, status: { not: 'REJECTED' } } })) throw new ConflictException('Đơn đã có hồ sơ gia hạn. Cần đối chiếu riêng phụ lục và kỳ thu trước khi đổi loại, không tự ghi lại giá lịch sử.');
    const contract = reservation.contracts[0], today = businessToday();
    if (contract.rateEffectiveFrom && contract.rateEffectiveFrom > today) throw new ConflictException('Đang có thay đổi giá chờ kỳ thu tiếp theo. Chưa thể đổi loại lần nữa.');
    const type = await tx.storageType.findUniqueOrThrow({ where: { id: destination.storageTypeId } });
    const source = await tx.storageType.findUniqueOrThrow({ where: { id: transfer.fromStorageUnit.storageTypeId } });
    const rate = Number(type.monthlyRate), oldRate = Number(contract.currentMonthlyRate ?? (reservation.quoteSnapshot as any).monthlyUnitPrice);
    if (![rate, oldRate].every(value => Number.isSafeInteger(value) && value > 0)) throw new ConflictException('Chưa có giá tháng hợp lệ để lập phụ lục đổi loại.');
    const future = await tx.invoice.findMany({ where: { reservationId: reservation.id, status: { not: 'VOID' }, billingPeriodStart: { gt: today }, type: 'RECURRING' }, orderBy: { billingPeriodStart: 'asc' } });
    const next = future.find(invoice => invoice.amountPaid === 0n && invoice.status === 'OPEN');
    const effectiveFrom = next?.billingPeriodStart ?? contract.endDate;
    const revised = future.filter(invoice => invoice.billingPeriodStart && invoice.billingPeriodStart >= effectiveFrom);
    if (revised.some(invoice => invoice.amountPaid !== 0n || invoice.status !== 'OPEN')) throw new ConflictException('Có kỳ tương lai đã thu tiền. Cần đối chiếu khoản đã thu trước khi lập phương án đổi giá.');
    const pending = await tx.paymentSubmission.count({ where: { invoiceId: { in: revised.map(invoice => invoice.id) }, status: 'PENDING_VERIFICATION' } });
    const online = await tx.onlinePaymentTransaction.count({ where: { invoiceId: { in: revised.map(invoice => invoice.id) }, status: 'PENDING' } });
    if (pending || online) throw new ConflictException('Có khoản thanh toán kỳ sau đang xử lý. Hoàn tất đối soát trước khi đổi loại.');
    const unit = (row: any, storageType: any) => ({ id: row.id, code: row.unitNumber, typeId: storageType.id, typeName: storageType.name, widthCm: storageType.widthCm, lengthCm: storageType.lengthCm, heightCm: storageType.heightCm });
    return { version: 'NESTBOX-TRANSFER-COMMERCIAL-V1', code: `${transfer.transferCode}-PL01`, issuer: this.policy.issuer(), customerId: reservation.customerId, customer: reservation.customer, reservationId: reservation.id, contractCode: contract.contractCode, from: unit(transfer.fromStorageUnit, source), to: unit(destination, type), currentRate: oldRate, newRate: rate, differencePerMonth: rate - oldRate, effectiveFrom: effectiveFrom.toISOString().slice(0, 10), smaller: type.widthCm * type.lengthCm < source.widthCm * source.lengthCm, currentPeriodUnchanged: true, depositUnchanged: true, fitGuaranteed: false, futureInvoices: revised.map(invoice => ({ id: invoice.id, updatedAt: invoice.updatedAt.toISOString(), cycle: invoice.billingCycle, previousRental: Number(invoice.rentalAmount), newRental: rate, difference: rate - Number(invoice.rentalAmount) })), generatedAt: new Date().toISOString() };
  }
  async apply(tx: Prisma.TransactionClient, transfer: any) {
    const snapshot = transfer.commercialSnapshot as any;
    if (!snapshot) return;
    if (!transfer.customerAcceptedAt || !transfer.commercialSignedSnapshot) throw new ConflictException('Khách cần ký và xác thực phụ lục đổi loại trước khi chuyển hàng.');
    const today = businessToday();
    if (snapshot.futureInvoices.length && new Date(snapshot.effectiveFrom) <= today) throw new ConflictException('Đã tới kỳ đổi giá trước khi chuyển thực tế. Cần lập lại phương án và xác nhận, không tính lùi ngày.');
    for (const row of snapshot.futureInvoices) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${row.id} FOR UPDATE`);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.id } });
      if (invoice.status !== 'OPEN' || invoice.amountPaid !== 0n || invoice.updatedAt.toISOString() !== row.updatedAt) throw new ConflictException('Hóa đơn tương lai đã thay đổi. Chưa thể áp dụng phụ lục cũ.');
      if (await tx.paymentSubmission.count({ where: { invoiceId: invoice.id, status: 'PENDING_VERIFICATION' } }) || await tx.onlinePaymentTransaction.count({ where: { invoiceId: invoice.id, status: 'PENDING' } })) throw new ConflictException('Có thanh toán đang xử lý. Hãy đối soát trước.');
      const rental = BigInt(snapshot.newRate), total = rental + invoice.depositAmount + invoice.serviceAmount + invoice.chargeAmount;
      // Keep original monetary fields and its entire evidence. Only void its outstanding claim.
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', balanceDue: 0n, billingCycle: null } });
      await tx.invoice.create({ data: { invoiceCode: `${invoice.invoiceCode}-${transfer.transferCode}`, reservationId: invoice.reservationId, type: invoice.type, billingCycle: row.cycle, billingPeriodStart: invoice.billingPeriodStart, billingPeriodEnd: invoice.billingPeriodEnd, dueAt: invoice.dueAt, status: 'OPEN', rentalAmount: rental, depositAmount: invoice.depositAmount, serviceAmount: invoice.serviceAmount, chargeAmount: invoice.chargeAmount, totalAmount: total, amountPaid: 0n, balanceDue: total, currency: invoice.currency, replacesInvoiceId: invoice.id, storageTypeIdSnapshot: snapshot.to.typeId, pricingSnapshot: { currency: invoice.currency, storageTypeId: snapshot.to.typeId, storageTypeName: snapshot.to.typeName, monthlyUnitPrice: snapshot.newRate, quantity: 1, rentalAmount: Number(rental), depositAmount: Number(invoice.depositAmount), addOnTotalAmount: Number(invoice.serviceAmount), quotedTotalAmount: Number(total), transferCode: transfer.transferCode, effectiveFrom: snapshot.effectiveFrom } } });
    }
    await tx.rentalContract.update({ where: { id: transfer.rentalContractId }, data: { currentMonthlyRate: BigInt(snapshot.newRate), rateEffectiveFrom: new Date(snapshot.effectiveFrom) } });
    await tx.reservation.update({ where: { id: transfer.reservationId }, data: { storageTypeId: snapshot.to.typeId } });
  }
}
