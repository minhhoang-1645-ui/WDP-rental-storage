import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { businessToday } from '../../business-date.js';
import { DocumentPolicy } from '../documents/document-policy.js';
import { invoiceBreakdown, invoiceMoney, invoiceUnit, savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';
import { loadPricingPolicy, type PricingPolicySnapshot } from '../policies/pricing-policy.js';
import { transferAmounts, transferCharge, transferredDepositDelta } from './transfer-finance.js';

type SourceQuote = { pricingPolicy?: PricingPolicySnapshot; monthlyUnitPrice?: number; baseRentalAmount?: number; billingMode?: string; termMonths?: number };

export function transferDebtWhere(today = businessToday()): Prisma.InvoiceWhereInput {
  return { status: { not: 'VOID' }, balanceDue: { gt: 0 },
    AND: [{ OR: [{ type: { in: ['INITIAL', 'RECURRING', 'RENEWAL'] } }, { pricingSnapshot: { path: ['adjustment'], equals: transferCharge } }] },
      { OR: [{ dueAt: null }, { dueAt: { lte: today } }] }] };
}

@Injectable()
export class TransferCommercialService {
  constructor(private readonly policy: DocumentPolicy) {}
  async prepare(tx: Prisma.TransactionClient, transfer: any, destination: any) {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: transfer.reservationId }, include: { contracts: true, customer: { select: { fullName: true, email: true, phone: true } } } });
    // Current reservation pricing/renewals are homogeneous. Do not silently reprice unrelated contracts.
    if (reservation.quantity !== 1) throw new ConflictException('Đổi loại kho hiện chỉ áp dụng cho đơn có một kho. Đơn nhiều kho cần phương án tách hợp đồng và bảng giá riêng, không tự đổi giá những kho còn lại.');
    const contract = reservation.contracts.find(item => item.id === transfer.rentalContractId);
    if (!contract || reservation.contracts.length !== 1) throw new ConflictException('Cần đối chiếu hợp đồng áp dụng trước khi đổi loại kho.');
    const today = businessToday();
    const renewals = await tx.renewalRequest.findMany({ where: { reservationId: reservation.id,
      OR: [{ rentalContractId: null }, { rentalContractId: contract.id }], status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED'] } },
      select: { id: true, renewalCode: true, status: true, previousEndDate: true, requestedEndDate: true, paymentPlan: true,
        rentalContractId: true, appendixCode: true, appendixSnapshot: true, appendixAcceptedAt: true, quoteSnapshot: true,
        invoices: { where: { renewalCycle: 1, status: 'PAID', balanceDue: 0n, amountPaid: { gt: 0 } }, select: { id: true } } }, orderBy: { previousEndDate: 'asc' } });
    if (renewals.some(item => item.status === 'PENDING')) throw new ConflictException('Gia hạn đang chờ duyệt. Xử lý hoặc hủy yêu cầu gia hạn trước khi đổi loại kho.');
    if (renewals.some(item => item.status === 'APPROVED_PENDING_PAYMENT')) throw new ConflictException('Gia hạn chưa được kích hoạt. Cần ký phụ lục và thanh toán hóa đơn kích hoạt trước khi đổi loại kho.');
    if (renewals.some((item, index) => !item.appendixCode || !item.appendixSnapshot || (item.rentalContractId && !item.appendixAcceptedAt) || !item.invoices.length
      || item.previousEndDate < contract.startDate || item.previousEndDate >= item.requestedEndDate || item.requestedEndDate > contract.endDate
      || (index > 0 && renewals[index - 1].requestedEndDate > item.previousEndDate))) {
      throw new ConflictException('Lịch sử gia hạn thiếu phụ lục, kỳ kích hoạt chưa được đối soát hoặc các kỳ thuê bị trùng. Cần kiểm tra hồ sơ gia hạn trước khi đổi loại.');
    }
    if (contract.rateEffectiveFrom && contract.rateEffectiveFrom > today) throw new ConflictException('Đang có thay đổi giá chờ kỳ thu tiếp theo. Chưa thể đổi loại lần nữa.');
    const type = await tx.storageType.findUniqueOrThrow({ where: { id: destination.storageTypeId } });
    const source = await tx.storageType.findUniqueOrThrow({ where: { id: transfer.fromStorageUnit.storageTypeId } });
    const currentRenewal = renewals.find(item => item.previousEndDate <= today && today < item.requestedEndDate);
    const rate = Number(type.monthlyRate), oldRate = Number(currentRenewal
      ? (currentRenewal.quoteSnapshot as { monthlyUnitPrice?: number } | null)?.monthlyUnitPrice
      : contract.currentMonthlyRate ?? (reservation.quoteSnapshot as { monthlyUnitPrice?: number } | null)?.monthlyUnitPrice);
    if (![rate, oldRate].every(value => Number.isSafeInteger(value) && value > 0)) throw new ConflictException('Chưa có giá tháng hợp lệ để lập phụ lục đổi loại.');
    const invoices = await tx.invoice.findMany({ where: { reservationId: reservation.id, status: { not: 'VOID' }, type: { in: ['INITIAL', 'RECURRING', 'RENEWAL'] } }, orderBy: { billingPeriodStart: 'asc' } });
    let protectedThrough = renewals.at(-1)?.requestedEndDate ?? today;
    for (const invoice of invoices) {
      const protectedPeriod = invoice.type !== 'RECURRING' || !invoice.billingPeriodStart || invoice.billingPeriodStart <= today
        || invoice.amountPaid !== 0n || invoice.status !== 'OPEN';
      if (protectedPeriod && invoice.billingPeriodEnd && invoice.billingPeriodEnd > protectedThrough) protectedThrough = invoice.billingPeriodEnd;
    }
    const future = invoices.filter(invoice => invoice.type === 'RECURRING' && invoice.billingPeriodStart && invoice.billingPeriodStart > today);
    const next = future.find(invoice => invoice.billingPeriodStart! >= protectedThrough && invoice.amountPaid === 0n && invoice.status === 'OPEN');
    const effectiveFrom = next?.billingPeriodStart ?? contract.endDate;
    if (effectiveFrom > contract.endDate || protectedThrough > contract.endDate) throw new ConflictException('Có kỳ thu ngoài thời hạn hiện tại. Cần đối chiếu trước khi đổi loại.');
    const revised = future.filter(invoice => invoice.billingPeriodStart && invoice.billingPeriodStart >= effectiveFrom);
    if (revised.some(invoice => invoice.amountPaid !== 0n || invoice.status !== 'OPEN')) throw new ConflictException('Có kỳ tương lai đã thu tiền. Cần đối chiếu khoản đã thu trước khi lập phương án đổi giá.');
    await this.assertNoPendingPayment(tx, revised.map(invoice => invoice.id));
    const due = invoices.filter(invoice => invoice.balanceDue > 0n && (!invoice.dueAt || invoice.dueAt <= today));
    const originalQuote = reservation.quoteSnapshot as SourceQuote;
    let adjustmentTerms: (ReturnType<typeof transferAmounts> & { invoiceId: string; depositVersion: number }) | undefined;
    if (originalQuote.pricingPolicy?.transferFee && transfer.reason === 'OTHER' && !transfer.closurePlanId) {
      const current = invoices.find(invoice => invoice.billingPeriodStart && invoice.billingPeriodEnd && invoice.billingPeriodStart <= today && today < invoice.billingPeriodEnd);
      const initial = invoices.find(invoice => invoice.type === 'INITIAL');
      const signedInvoice = current && savedInvoiceBreakdown(current.pricingSnapshot, current);
      const sourceUnit = signedInvoice?.units.find(unit => unit.contractId === contract.id);
      if (!current?.billingPeriodStart || !current.billingPeriodEnd || !sourceUnit || !initial || initial.status !== 'PAID') {
        throw new ConflictException('Cần đối soát kỳ thuê hiện tại và hóa đơn cọc trước khi lập phụ lục.');
      }
      if (await tx.transferRequest.count({ where: { rentalContractId: contract.id, status: 'COMPLETED',
        commercialSettlement: { path: ['sourceInvoiceId'], equals: current.id } } })) {
        throw new ConflictException('Kỳ hiện tại đã quyết toán một lần chuyển kho. Cần đối soát trước khi tiếp tục.');
      }
      const { deposit } = await loadPricingPolicy(tx);
      const daily = originalQuote.billingMode === 'DAILY';
      const rule = deposit.value[type.sizeId === 'locker' ? 'locker' : daily && type.sizeId === 'small' ? 'smallDaily' : 'other'];
      const basis = BigInt(originalQuote.baseRentalAmount ?? 0) * BigInt(rate);
      const oldBasisRate = BigInt(originalQuote.monthlyUnitPrice ?? 0);
      if (rule.method === 'RENT_PERCENTAGE' && (!oldBasisRate || !basis)) throw new ConflictException('Thiếu tiền thuê gốc để xác định cọc mục tiêu.');
      const targetDeposit = rule.method === 'FIXED_AMOUNT' ? BigInt(rule.amount) : rule.method === 'MONTHLY_RENT_MULTIPLIER' ? BigInt(rate) * BigInt(rule.amount)
        : rule.method === 'RENT_PERCENTAGE' ? (basis * BigInt(rule.amount) + oldBasisRate * 50n) / (oldBasisRate * 100n) : 0n;
      const heldDeposit = invoiceMoney(initial.depositAmount + await transferredDepositDelta(tx, reservation.id, contract.id));
      // Preserve the current billed discount ratio when deriving the new rate for the same period.
      const oldRental = BigInt(sourceUnit.rentalAmount);
      const bookedRate = BigInt(sourceUnit.monthlyRate);
      if (!bookedRate) throw new ConflictException('Thiếu đơn giá kỳ hiện tại để quyết toán phần còn lại.');
      const newRental = (oldRental * BigInt(rate) + bookedRate / 2n) / bookedRate;
      adjustmentTerms = { ...transferAmounts({ moveDate: today.toISOString().slice(0, 10), periodStart: current.billingPeriodStart.toISOString().slice(0, 10),
        periodEnd: current.billingPeriodEnd.toISOString().slice(0, 10), oldRate: invoiceMoney(oldRental), newRate: invoiceMoney(newRental),
        fee: 0, currentDeposit: heldDeposit, targetDeposit: invoiceMoney(targetDeposit) }), invoiceId: current.id, depositVersion: deposit.version };
    }
    const sum = (amount: (invoice: (typeof invoices)[number]) => bigint) => Number(invoices.reduce((total, invoice) => total + amount(invoice), 0n));
    const adjustment = revised.reduce((total, invoice) => total + rate - Number(invoice.rentalAmount), 0);
    const financialReview = {
      leaseStart: contract.startDate.toISOString().slice(0, 10), leaseEnd: contract.endDate.toISOString().slice(0, 10),
      requestedMoveDate: transfer.supportRequest?.transferRequestedStartAt?.toISOString() ?? null,
      renewals: renewals.map(item => ({ id: item.id, code: item.renewalCode, appendixCode: item.appendixCode, start: item.previousEndDate.toISOString().slice(0, 10), end: item.requestedEndDate.toISOString().slice(0, 10), paymentPlan: item.paymentPlan })),
      paidAmount: sum(invoice => invoice.amountPaid), outstandingAmount: sum(invoice => invoice.balanceDue),
      depositAmount: sum(invoice => invoice.depositAmount), depositAdjustment: 0,
      dueAmount: Number(due.reduce((total, invoice) => total + invoice.balanceDue, 0n)),
      dueInvoices: due.map(invoice => ({ id: invoice.id, code: invoice.invoiceCode, balanceDue: Number(invoice.balanceDue) })),
      futureRentIncrease: Math.max(0, adjustment), futureRentReduction: Math.max(0, -adjustment),
    };
    const unit = (row: any, storageType: any) => ({ id: row.id, code: row.unitNumber, typeId: storageType.id, typeName: storageType.name, widthCm: storageType.widthCm, lengthCm: storageType.lengthCm, heightCm: storageType.heightCm });
    return { version: 'NESTBOX-TRANSFER-COMMERCIAL-V2', code: `${transfer.transferCode}-PL01`, issuer: this.policy.issuer(), customerId: reservation.customerId, customer: reservation.customer, reservationId: reservation.id, contractCode: contract.contractCode, from: unit(transfer.fromStorageUnit, source), to: unit(destination, type), currentRate: oldRate, newRate: rate, differencePerMonth: rate - oldRate, effectiveFrom: effectiveFrom.toISOString().slice(0, 10), smaller: type.widthCm * type.lengthCm < source.widthCm * source.lengthCm, currentPeriodUnchanged: !adjustmentTerms, depositUnchanged: !adjustmentTerms || adjustmentTerms.depositAdjustment === 0, fitGuaranteed: false, futureInvoices: revised.map(invoice => ({ id: invoice.id, updatedAt: invoice.updatedAt.toISOString(), cycle: invoice.billingCycle, previousRental: Number(invoice.rentalAmount), newRental: rate, difference: rate - Number(invoice.rentalAmount) })), financialReview, ...(adjustmentTerms ? { adjustmentTerms } : {}), generatedAt: new Date().toISOString() };
  }
  async apply(tx: Prisma.TransactionClient, transfer: any) {
    const snapshot = transfer.commercialSnapshot as any;
    if (!snapshot) return;
    if (!transfer.customerAcceptedAt || !transfer.commercialSignedSnapshot) throw new ConflictException('Khách cần ký và xác thực phụ lục đổi loại trước khi chuyển hàng.');
    const today = businessToday();
    if (snapshot.financialReview && today >= new Date(snapshot.financialReview.leaseEnd)) {
      throw new ConflictException('Hợp đồng đã hết hạn trong thời gian chờ bàn giao. Cần rà soát lại hồ sơ chuyển kho.');
    }
    const effectiveFrom = new Date(snapshot.effectiveFrom);
    const futureInvoices: { id: string; cycle: number; updatedAt: string }[] = snapshot.futureInvoices;
    if (futureInvoices.length && effectiveFrom <= today) throw new ConflictException('Đã tới kỳ đổi giá trước khi chuyển thực tế. Cần lập lại phương án và xác nhận, không tính lùi ngày.');
    const unreviewed = await tx.invoice.count({ where: { reservationId: transfer.reservationId, type: 'RECURRING', status: { not: 'VOID' },
      billingPeriodStart: { gte: effectiveFrom }, id: { notIn: futureInvoices.map(invoice => invoice.id) } } });
    if (unreviewed) throw new ConflictException('Có hóa đơn kỳ sau chưa được duyệt trong phụ lục. Cần lập lại phương án đổi giá.');
    if (await tx.invoice.count({ where: { reservationId: transfer.reservationId, ...transferDebtWhere(today) } })) {
      throw new ConflictException('Còn hóa đơn đến hạn chưa thanh toán. Khách cần thanh toán trước khi bàn giao kho mới.');
    }
    const monthlyRenewals = (snapshot.financialReview?.renewals ?? []) as { id: string; start: string; end: string; paymentPlan: string }[];
    for (const period of monthlyRenewals) {
      if (period.paymentPlan !== 'PAY_MONTHLY' || new Date(period.start) > today) continue;
      const invoices = await tx.invoice.findMany({ where: { reservationId: transfer.reservationId, renewalRequestId: period.id, type: 'RENEWAL', status: 'PAID', balanceDue: 0n },
        select: { billingPeriodStart: true, billingPeriodEnd: true }, orderBy: { billingPeriodStart: 'asc' } });
      let coveredUntil = new Date(period.start);
      for (const invoice of invoices) {
        if (invoice.billingPeriodStart?.getTime() === coveredUntil.getTime() && invoice.billingPeriodEnd && invoice.billingPeriodEnd > coveredUntil) {
          coveredUntil = invoice.billingPeriodEnd;
        }
      }
      if (coveredUntil <= today && coveredUntil < new Date(period.end)) {
        throw new ConflictException('Có kỳ gia hạn đến hạn chưa được phát hành hoặc đối soát. Kiểm tra hóa đơn trước khi bàn giao.');
      }
    }
    for (const row of futureInvoices) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${row.id} FOR UPDATE`);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.id } });
      if (invoice.reservationId !== transfer.reservationId || invoice.type !== 'RECURRING' || invoice.billingCycle !== row.cycle || invoice.status !== 'OPEN' || invoice.amountPaid !== 0n || invoice.updatedAt.toISOString() !== row.updatedAt) throw new ConflictException('Hóa đơn tương lai đã thay đổi. Chưa thể áp dụng phụ lục cũ.');
      await this.assertNoPendingPayment(tx, [invoice.id]);
      const rental = BigInt(snapshot.newRate), total = rental + invoice.depositAmount + invoice.serviceAmount + invoice.chargeAmount;
      const previous = savedInvoiceBreakdown(invoice.pricingSnapshot, invoice);
      const breakdown = invoice.billingPeriodStart && invoice.billingPeriodEnd && (previous || invoice.serviceAmount === 0n)
        ? invoiceBreakdown(invoice.billingPeriodStart, invoice.billingPeriodEnd, [invoiceUnit({
          id: transfer.rentalContractId, contractCode: snapshot.contractCode,
          reservationUnit: { id: transfer.toReservationUnitId, storageUnit: {
            id: transfer.toStorageUnitId, unitNumber: snapshot.to.code, storageTypeId: snapshot.to.typeId, storageType: { name: snapshot.to.typeName },
          } },
        }, rental, rental, invoice.depositAmount)], previous?.sharedServices ?? [], { ...invoice, rentalAmount: rental, totalAmount: total })
        : null;
      // Keep original monetary fields and its entire evidence. Only void its outstanding claim.
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', balanceDue: 0n, billingCycle: null } });
      await tx.invoice.create({ data: { invoiceCode: `${invoice.invoiceCode}-${transfer.transferCode}`, reservationId: invoice.reservationId, facilityIdSnapshot: invoice.facilityIdSnapshot, type: invoice.type, billingCycle: row.cycle, billingPeriodStart: invoice.billingPeriodStart, billingPeriodEnd: invoice.billingPeriodEnd, dueAt: invoice.dueAt, status: 'OPEN', rentalAmount: rental, depositAmount: invoice.depositAmount, serviceAmount: invoice.serviceAmount, chargeAmount: invoice.chargeAmount, totalAmount: total, amountPaid: 0n, balanceDue: total, currency: invoice.currency, replacesInvoiceId: invoice.id, storageTypeIdSnapshot: snapshot.to.typeId, pricingSnapshot: { ...(invoice.pricingSnapshot as Prisma.JsonObject | null), currency: invoice.currency, storageTypeId: snapshot.to.typeId, storageTypeName: snapshot.to.typeName, monthlyUnitPrice: snapshot.newRate, quantity: 1, rentalAmount: Number(rental), depositAmount: Number(invoice.depositAmount), addOnTotalAmount: Number(invoice.serviceAmount), quotedTotalAmount: Number(total), transferCode: transfer.transferCode, effectiveFrom: snapshot.effectiveFrom, breakdown } } });
    }
    await tx.rentalContract.update({ where: { id: transfer.rentalContractId }, data: { currentMonthlyRate: BigInt(snapshot.newRate), rateEffectiveFrom: effectiveFrom } });
    await tx.reservation.update({ where: { id: transfer.reservationId }, data: { storageTypeId: snapshot.to.typeId } });
    if (snapshot.adjustmentTerms) {
      // Complete the agreed addendum, including fees recorded before transfers became free.
      const terms = snapshot.adjustmentTerms;
      const amounts = transferAmounts({ ...terms, moveDate: today.toISOString().slice(0, 10) });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: terms.invoiceId } });
      const paid = await tx.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
      if (invoice.reservationId !== transfer.reservationId || invoice.status !== 'PAID' || invoice.balanceDue || paid._sum.amount !== invoice.totalAmount) {
        throw new ConflictException('Kỳ hiện tại cần thanh toán và đối soát đầy đủ trước khi chuyển.');
      }
      const source = { adjustment: transferCharge, transferId: String(transfer.id), rentalContractId: String(transfer.rentalContractId),
        sourceInvoiceId: invoice.id, ...amounts };
      const charge = BigInt(amounts.amountDue);
      const generated = charge ? await tx.invoice.create({ data: { invoiceCode: `${transfer.transferCode}-FINANCE`, reservationId: transfer.reservationId,
        type: 'SETTLEMENT', billingCycle: null, rentalAmount: 0n, depositAmount: 0n, serviceAmount: 0n, chargeAmount: charge,
        totalAmount: charge, balanceDue: charge, dueAt: today, facilityIdSnapshot: invoice.facilityIdSnapshot, pricingSnapshot: source } }) : null;
      return { ...source, invoiceId: generated?.id ?? null, refundState: amounts.refundAmount ? 'PENDING' : 'NONE' };
    }
  }

  private async assertNoPendingPayment(tx: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return;
    const invoiceId = { in: ids };
    const bank = await tx.paymentSubmission.count({ where: { invoiceId, status: 'PENDING_VERIFICATION' } });
    const online = await tx.onlinePaymentTransaction.count({ where: { invoiceId, OR: [
      { status: 'PENDING' }, { reconciliation: { is: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } } },
    ] } });
    if (bank || online) throw new ConflictException('Có khoản thanh toán kỳ sau đang xử lý. Hoàn tất đối soát trước khi đổi loại.');
  }
}
