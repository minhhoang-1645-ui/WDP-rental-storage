import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { invoiceMoney } from '../billing/invoice-breakdown.js';
import { businessToday } from '../../business-date.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';

export const transferCharge = 'TRANSFER_FINANCE';
const day = 86_400_000;

export function transferAmounts(basis: { moveDate: string; periodStart: string; periodEnd: string; oldRate: number; newRate: number; fee: number; currentDeposit: number; targetDeposit: number }) {
  const start = +new Date(basis.periodStart), end = +new Date(basis.periodEnd), move = +new Date(basis.moveDate);
  if (![start, end, move].every(Number.isFinite) || start >= end || move < start || move >= end) throw new ConflictException('Ngày chuyển nằm ngoài kỳ đã ký. Cần lập lại phụ lục.');
  const days = BigInt((end - move) / day);
  const divisor = BigInt((end - start) / day);
  const rate = BigInt(basis.newRate) - BigInt(basis.oldRate);
  const magnitude = (days * (rate < 0n ? -rate : rate) + divisor / 2n) / divisor;
  const rentalAdjustment = invoiceMoney(magnitude) * (rate < 0n ? -1 : 1);
  const depositAdjustment = basis.targetDeposit - basis.currentDeposit;
  const net = BigInt(rentalAdjustment) + BigInt(depositAdjustment) + BigInt(basis.fee);
  return { ...basis, rentalAdjustment, depositAdjustment, amountDue: invoiceMoney(net > 0n ? net : 0n), refundAmount: invoiceMoney(net < 0n ? -net : 0n) };
}

export async function transferredDepositDelta(tx: Prisma.TransactionClient, reservationId: string, contractId: string, closeout?: { returnId: string; now: Date }) {
  const records = await tx.transferRequest.findMany({ where: { reservationId, rentalContractId: contractId, status: 'COMPLETED' }, select: { id: true, commercialSettlement: true } });
  const adjustments = records.flatMap(record => {
    const terms = record.commercialSettlement as { depositAdjustment?: number; amountDue?: number; invoiceId?: string } | null;
    return terms && Number.isSafeInteger(terms.depositAdjustment) ? [{ ...terms, transferId: record.id }] : [];
  });
  const invoiceIds = adjustments.flatMap(terms => terms.invoiceId ? [terms.invoiceId] : []);
  const paid = new Set(invoiceIds.length ? (await tx.invoice.findMany({ where: { id: { in: invoiceIds }, reservationId, status: 'PAID', balanceDue: 0n }, select: { id: true } })).map(invoice => invoice.id) : []);
  let total = 0n;
  for (const item of adjustments) {
    const delta = item.depositAdjustment!;
    if (delta <= 0 || !item.amountDue || item.invoiceId && paid.has(item.invoiceId)) { total += BigInt(delta); continue; }
    if (!closeout || !item.invoiceId) throw new ConflictException('Cần thanh toán khoản điều chỉnh cọc của lần chuyển trước hoặc đối soát với quản lý.');
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${item.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: item.invoiceId } });
    const snapshot = invoice.pricingSnapshot as { transferId?: string; adjustment?: string } | null;
    if (invoice.status === 'VOID' || invoice.reservationId !== reservationId || invoice.totalAmount !== BigInt(item.amountDue) ||
        invoice.balanceDue !== invoice.totalAmount - invoice.amountPaid || snapshot?.transferId !== item.transferId || snapshot.adjustment !== transferCharge) {
      throw new ConflictException('Cần đối soát hóa đơn điều chỉnh cọc trước khi chốt hồ sơ.');
    }
    const pending = await tx.paymentSubmission.count({ where: { invoiceId: invoice.id, status: 'PENDING_VERIFICATION' } });
    const online = await tx.onlinePaymentTransaction.count({ where: { invoiceId: invoice.id, OR: [
      { status: 'PENDING', createdAt: { gt: new Date(+closeout.now - ONLINE_PAYMENT_TTL_MS) } },
      { reconciliation: { is: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } } },
    ] } });
    const paidEvidence = await tx.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    if (pending || online || (paidEvidence._sum.amount ?? 0n) !== invoice.amountPaid) throw new ConflictException('Khoản điều chỉnh cọc còn giao dịch đang đối soát.');
    // The signed addendum allocates net receipts to rent and fees before deposit.
    const waivedDeposit = invoice.balanceDue < BigInt(delta) ? invoice.balanceDue : BigInt(delta);
    total += BigInt(delta) - waivedDeposit;
    if (!waivedDeposit) continue;
    const remaining = invoice.balanceDue - waivedDeposit;
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', balanceDue: 0n,
      voidedAt: closeout.now, voidReason: 'Tách tiền thuê, phí và tiền cọc chưa thu khi nhận lại kho.' } });
    if (remaining > 0n) {
      await tx.invoice.create({ data: { invoiceCode: `${invoice.invoiceCode}-BALANCE`, reservationId, type: 'SETTLEMENT',
        billingCycle: null, rentalAmount: 0n, depositAmount: 0n, serviceAmount: 0n, chargeAmount: remaining, totalAmount: remaining,
        balanceDue: remaining, currency: invoice.currency, dueAt: invoice.dueAt ?? businessToday(closeout.now), facilityIdSnapshot: invoice.facilityIdSnapshot,
        replacesInvoiceId: invoice.id, pricingSnapshot: { adjustment: 'TRANSFER_RETURN_BALANCE', transferId: item.transferId, rentalContractId: contractId,
          returnRequestId: closeout.returnId, depositWaived: invoiceMoney(waivedDeposit) } } });
    }
  }
  return total;
}
