import type { Prisma } from '../../generated/prisma/client.js';

export const openRenewalStatuses = ['PENDING', 'APPROVED_PENDING_PAYMENT'] as const;

export function renewalAppliesTo(renewal: { rentalContractId?: string | null }, contractIds: readonly string[]) {
  return !renewal.rentalContractId || contractIds.includes(renewal.rentalContractId);
}

export function renewalOverlapsUnits(unitIds: string[]): Prisma.RenewalRequestWhereInput {
  const unit = { storageUnitId: { in: unitIds }, releasedAt: null };
  return { OR: [
    { rentalContract: { reservationUnit: unit } },
    { rentalContractId: null, reservation: { units: { some: unit } } },
  ] };
}

type CommittedRenewal = {
  rentalContractId?: string | null; status: string; paymentPlan?: string; termMonths?: number;
  invoices?: Array<{ renewalCycle: number | null; status: string }>;
};

export function hasUnissuedRenewalInstallments(renewals: CommittedRenewal[], contractIds: readonly string[]) {
  return renewals.some(renewal => {
    if (renewal.status !== 'COMPLETED' || renewal.paymentPlan !== 'PAY_MONTHLY' || !renewalAppliesTo(renewal, contractIds)) return false;
    const cycles = new Set(renewal.invoices?.filter(invoice => invoice.status !== 'VOID').map(invoice => invoice.renewalCycle));
    return Array.from({ length: renewal.termMonths ?? 0 }, (_, index) => index + 1).some(cycle => !cycles.has(cycle));
  });
}
