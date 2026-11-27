import { businessToday } from '../../business-date.js';
import { pricingPolicyValidators, type PricingPolicySnapshot } from '../policies/pricing-policy.js';

const dayMs = 86_400_000;

export function datedPaymentOverdue(snapshot: unknown, dueAt: Date | null, now: Date) {
  const agreed = (snapshot as { pricingPolicy?: PricingPolicySnapshot } | null)?.pricingPolicy?.paymentOverdue;
  if (!agreed || !dueAt) return null;
  const rule = pricingPolicyValidators.paymentOverdue(agreed.value);
  const overdueDays = Math.max(0, Math.floor((+businessToday(now) - +dueAt) / dayMs));
  return { overdueDays, rule, version: agreed.version, managerReviewOn: new Date(+dueAt + rule.managerDays * dayMs).toISOString().slice(0, 10) };
}

export function verifiedRentDebt(invoice: {
  rentalAmount: bigint; depositAmount: bigint; serviceAmount: bigint; chargeAmount: bigint;
  totalAmount: bigint; amountPaid: bigint; balanceDue: bigint;
}) {
  if (invoice.rentalAmount <= 0n || invoice.balanceDue <= 0n || invoice.amountPaid < 0n ||
    invoice.totalAmount !== invoice.rentalAmount + invoice.depositAmount + invoice.serviceAmount + invoice.chargeAmount ||
    invoice.balanceDue !== invoice.totalAmount - invoice.amountPaid) return null;
  if (invoice.amountPaid === 0n) return invoice.rentalAmount;
  return invoice.totalAmount === invoice.rentalAmount ? invoice.balanceDue : null;
}
