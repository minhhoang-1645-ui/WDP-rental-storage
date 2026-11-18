import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export const invoiceContractInclude = {
  reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true, storageTypeId: true, storageType: { select: { name: true } } } } } },
} satisfies Prisma.RentalContractInclude;

type InvoiceUnit = {
  id: string;
  contractCode: string;
  reservationUnit: {
    id: string;
    storageUnit: { id: string; unitNumber: string; storageTypeId: string; storageType: { name: string } };
  };
};

type UnitLine = {
  contractId: string; contractCode: string; reservationUnitId: string; storageUnitId: string;
  unitCode: string; storageTypeId: string; storageTypeName: string; monthlyRate: number;
  rentalAmount: number; depositAmount: number;
};
export type InvoiceServiceLine = {
  id: string; name: string; quantity: number; billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH'; unitPrice: number;
  physicalUnit?: string; billablePeriods?: number; amount: number;
};
export type InvoiceBreakdown = {
  version: 1;
  periodStart: string;
  periodEnd: string;
  units: UnitLine[];
  sharedServices: InvoiceServiceLine[];
  adjustmentAmount: number;
};

type Totals = { rentalAmount: bigint; depositAmount: bigint; serviceAmount: bigint; chargeAmount?: bigint; totalAmount: bigint };

export function invoiceMoney(value: bigint) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new ConflictException('Số tiền hóa đơn vượt phạm vi VND hợp lệ.');
  return amount;
}

export function invoiceUnit(contract: InvoiceUnit, monthlyRate: bigint, rentalAmount: bigint, depositAmount: bigint, typeName?: string): UnitLine {
  const unit = contract.reservationUnit.storageUnit;
  return {
    contractId: contract.id, contractCode: contract.contractCode, reservationUnitId: contract.reservationUnit.id,
    storageUnitId: unit.id, unitCode: unit.unitNumber, storageTypeId: unit.storageTypeId,
    storageTypeName: typeName ?? unit.storageType.name, monthlyRate: invoiceMoney(monthlyRate),
    rentalAmount: invoiceMoney(rentalAmount), depositAmount: invoiceMoney(depositAmount),
  };
}

// The quote prices identical units together and rounds once. Assign the remaining đồng in contract-code order.
export function homogeneousInvoiceUnits(contracts: InvoiceUnit[], monthlyRate: bigint, rental: bigint, deposit: bigint, typeName?: string) {
  const divisor = BigInt(contracts.length);
  if (!divisor) throw new ConflictException('Hóa đơn thiếu hợp đồng để phân bổ.');
  const share = (amount: bigint, index: number) => amount / divisor + (BigInt(index) < amount % divisor ? 1n : 0n);
  return [...contracts].sort((a, b) => a.contractCode.localeCompare(b.contractCode)).map((contract, index) =>
    invoiceUnit(contract, monthlyRate, share(rental, index), share(deposit, index), typeName));
}

export function invoiceBreakdown(start: Date, end: Date, units: UnitLine[], sharedServices: InvoiceServiceLine[], totals: Totals): InvoiceBreakdown {
  invoiceMoney(totals.totalAmount);
  const result: InvoiceBreakdown = {
    version: 1, periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10),
    units, sharedServices, adjustmentAmount: invoiceMoney(totals.chargeAmount ?? 0n),
  };
  if (!matchesTotals(result, totals)) throw new ConflictException('Chi tiết các khoản không khớp tổng hóa đơn.');
  return result;
}

function matchesTotals(details: InvoiceBreakdown, totals: Totals) {
  const sum = (values: number[]) => values.reduce((total, value) => total + BigInt(value), 0n);
  const charge = totals.chargeAmount ?? 0n;
  return [details.adjustmentAmount, ...details.units.flatMap(unit => [unit.rentalAmount, unit.depositAmount]), ...details.sharedServices.map(service => service.amount)]
    .every(amount => Number.isSafeInteger(amount) && amount >= 0)
    && sum(details.units.map(unit => unit.rentalAmount)) === totals.rentalAmount
    && sum(details.units.map(unit => unit.depositAmount)) === totals.depositAmount
    && sum(details.sharedServices.map(service => service.amount)) === totals.serviceAmount
    && BigInt(details.adjustmentAmount) === charge
    && totals.rentalAmount + totals.depositAmount + totals.serviceAmount + charge === totals.totalAmount;
}

export function savedInvoiceBreakdown(snapshot: unknown, totals: Totals) {
  const details = (snapshot as { breakdown?: InvoiceBreakdown } | null)?.breakdown;
  return details?.version === 1 && Array.isArray(details.units) && Array.isArray(details.sharedServices) && matchesTotals(details, totals) ? details : null;
}
