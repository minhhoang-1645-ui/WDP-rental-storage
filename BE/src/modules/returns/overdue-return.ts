import { BadRequestException, ConflictException } from '@nestjs/common';
import { businessToday, daysAfterRentalEnd } from '../../business-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { invoiceMoney } from '../billing/invoice-breakdown.js';
import { pricingPolicyValidators, type PricingPolicySnapshot } from '../policies/pricing-policy.js';

type Quote = { monthlyUnitPrice?: number; pricingPolicy?: PricingPolicySnapshot };
type Contract = { id: string; activatedAt: Date | null; endDate: Date; currentMonthlyRate: bigint | null; rateEffectiveFrom: Date | null };
type Renewal = { rentalContractId: string | null; status: string; requestedEndDate: Date; quoteSnapshot: unknown; appendixAcceptedAt: Date | null };

export function calculateOccupiedOverdue(contract: Contract, bookingQuote: unknown, renewals: Renewal[], vacatedOn: Date) {
  const renewal = renewals.find(item => item.status === 'COMPLETED' && +item.requestedEndDate === +contract.endDate &&
    (item.rentalContractId === contract.id || !item.rentalContractId));
  const quote = (renewal ? renewal.appendixAcceptedAt && renewal.quoteSnapshot : bookingQuote) as Quote | null;
  const signed = quote?.pricingPolicy?.returnOverdue;
  if (!signed || vacatedOn <= contract.endDate) return null;
  const terms = pricingPolicyValidators.returnOverdue(signed.value);
  const overdueDays = daysAfterRentalEnd(contract.endDate, vacatedOn);
  const billableDays = Math.max(0, overdueDays - terms.graceDays);
  const rate = !renewal && contract.rateEffectiveFrom && contract.rateEffectiveFrom <= contract.endDate ? contract.currentMonthlyRate : quote?.monthlyUnitPrice;
  if (!rate || typeof rate === 'number' && !Number.isSafeInteger(rate) || BigInt(rate) <= 0n) throw new ConflictException('Thiếu đơn giá cam kết để tính phí quá hạn trả kho.');
  const amount = (BigInt(rate) * BigInt(billableDays) * BigInt(terms.multiplier) + 1500n) / 3000n;
  return { contractId: contract.id, overdueDays, billableDays, monthlyRate: invoiceMoney(BigInt(rate)), amount: invoiceMoney(amount), version: signed.version, terms };
}

export async function applyOccupiedOverdue(tx: Prisma.TransactionClient, record: {
  id: string; returnCode: string; reservationId: string; overdueSettlement: Prisma.JsonValue;
}, contracts: Contract[], bookingQuote: unknown, renewals: Renewal[], actorId: string, now: Date, input: Record<string, unknown>, protectedReturn: boolean, facilityId?: string) {
  const today = businessToday(now);
  if (protectedReturn || !contracts.some(contract => calculateOccupiedOverdue(contract, bookingQuote, renewals, today))) return undefined;
  const value = input.physicalReturnDate === undefined || input.physicalReturnDate === '' ? today.toISOString().slice(0, 10)
    : typeof input.physicalReturnDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(input.physicalReturnDate) ? input.physicalReturnDate : '';
  const at = new Date(value + 'T00:00:00Z');
  const evidence = typeof input.physicalReturnEvidence === 'string' ? input.physicalReturnEvidence.trim() : '';
  if (!Number.isFinite(+at) || at.toISOString().slice(0, 10) !== value || at > today ||
      contracts.some(contract => !contract.activatedAt || at < businessToday(contract.activatedAt)) || (at < today && evidence.length < 3) || evidence.length > 500) {
    throw new BadRequestException('Nhập ngày bàn giao thực tế và căn cứ xác minh việc thu hồi quyền truy cập.');
  }
  const rows = contracts.flatMap(contract => calculateOccupiedOverdue(contract, bookingQuote, renewals, at) ?? []);
  const decision = record.overdueSettlement as { waived?: boolean; decisionBy?: string; reason?: string } | null;
  const amount = decision?.waived ? 0n : rows.reduce((total, row) => total + BigInt(row.amount), 0n);
  if (amount > 0n) {
    await tx.invoice.create({ data: { invoiceCode: `${record.returnCode}-OCCUPANCY`, reservationId: record.reservationId,
      type: 'SETTLEMENT', rentalAmount: 0n, serviceAmount: 0n, depositAmount: 0n, chargeAmount: amount,
      totalAmount: amount, balanceDue: amount, dueAt: today, billingCycle: null, facilityIdSnapshot: facilityId,
      pricingSnapshot: { adjustment: 'RETURN_OVERDUE', returnRequestId: record.id, contracts: rows.map(row => row.contractId), physicalReturnDate: value, items: rows },
    } });
  }
  return { ...(decision ?? {}), physicalReturnDate: value, evidence, recordedBy: actorId, recordedAt: now.toISOString(), rows, amount: invoiceMoney(amount) };
}
