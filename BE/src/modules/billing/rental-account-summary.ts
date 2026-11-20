import { businessDate } from '../../business-date.js';

type Money = bigint | number | string | null;
interface AccountInvoice {
  id?: string; invoiceCode?: string; type?: string; status?: string; renewalRequestId?: string | null;
  billingCycle?: number | null; renewalCycle?: number | null;
  billingPeriodStart?: Date | null; billingPeriodEnd?: Date | null; dueAt?: Date | null;
  rentalAmount?: Money; depositAmount?: Money; serviceAmount?: Money; chargeAmount?: Money;
  totalAmount: Money; amountPaid: Money; balanceDue?: Money;
}
export interface RentalAccountRecord {
  startDate: Date; endDate: Date; durationMonths?: number | null; quoteSnapshot: unknown;
  contracts?: Array<{ id?: string; status: string; startDate?: Date; endDate?: Date }>;
  invoices?: AccountInvoice[];
  renewals?: Array<{ rentalContractId?: string | null; status: string; termMonths: number; previousEndDate: Date; requestedEndDate: Date }>;
}
const money = (value?: Money) => {
  const amount = Number(value ?? 0);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid stored invoice amount.');
  return amount;
};
const dateOnly = (value?: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const groupNames: Record<string, string> = {
  INITIAL: 'Lần thanh toán đầu tiên', RECURRING: 'Các kỳ còn lại của đơn thuê ban đầu',
  RENEWAL: 'Tiền gia hạn', SETTLEMENT: 'Phí quyết toán',
};

/** Read invoice amounts as recorded; never infer how a partial payment was split between rent and deposit. */
export function rentalAccountSummary(record: RentalAccountRecord, now = new Date()) {
  const snapshot = (record.quoteSnapshot ?? {}) as Record<string, unknown>;
  const completed = (record.renewals ?? []).filter(renewal => renewal.status === 'COMPLETED');
  const allContracts = (record.contracts ?? []).filter(contract => contract.status !== 'CANCELLED');
  const activeContracts = allContracts.filter(contract => contract.status === 'ACTIVE');
  const contracts = activeContracts.length ? activeContracts : allContracts;
  const starts = contracts.map(contract => dateOnly(contract.startDate)).filter((date): date is string => !!date).sort();
  const ends = contracts.map(contract => dateOnly(contract.endDate)).filter((date): date is string => !!date).sort();
  const originalStartDate = typeof snapshot.startDate === 'string' ? snapshot.startDate : starts[0] ?? businessDate(record.startDate);
  const originalEndDate = typeof snapshot.endDate === 'string' ? snapshot.endDate : completed.map(renewal => dateOnly(renewal.previousEndDate)!).sort()[0] ?? ends.at(-1) ?? businessDate(record.endDate);
  const originalMonths = typeof snapshot.termMonths === 'number' ? snapshot.termMonths : record.durationMonths ?? null;
  const longest = contracts.reduce<typeof contracts[number] | undefined>((latest, contract) =>
    !latest || (contract.endDate?.getTime() ?? 0) > (latest.endDate?.getTime() ?? 0) ? contract : latest, undefined);
  const extendedMonths = completed.filter(renewal => !renewal.rentalContractId || renewal.rentalContractId === longest?.id)
    .reduce((sum, renewal) => sum + renewal.termMonths, 0);
  const rentalPeriod = {
    originalStartDate, originalEndDate, originalMonths, extendedMonths,
    currentStartDate: starts[0] ?? originalStartDate,
    currentEndDate: ends.at(-1) ?? (completed.length ? businessDate(record.endDate) : originalEndDate),
    totalMonths: originalMonths === null ? null : originalMonths + extendedMonths,
  };
  const invoices = (record.invoices ?? []).filter(invoice => invoice.status !== 'VOID').map(invoice => {
    const total = money(invoice.totalAmount), paid = money(invoice.amountPaid);
    const dueAt = dateOnly(invoice.dueAt);
    return {
      id: invoice.id ?? invoice.invoiceCode ?? '', code: invoice.invoiceCode ?? '', type: invoice.type ?? 'INITIAL',
      renewalId: invoice.renewalRequestId ?? null, status: invoice.status ?? (paid === total ? 'PAID' : 'OPEN'),
      periodStart: dateOnly(invoice.billingPeriodStart), periodEnd: dateOnly(invoice.billingPeriodEnd), dueAt,
      rental: money(invoice.rentalAmount), deposit: money(invoice.depositAmount), services: money(invoice.serviceAmount), charges: money(invoice.chargeAmount),
      total, paid, balance: invoice.balanceDue === undefined ? Math.max(0, total - paid) : money(invoice.balanceDue),
      dueState: paid >= total ? 'PAID' : !dueAt ? 'OPEN' : dueAt < businessDate(now) ? 'OVERDUE' : dueAt > businessDate(now) ? 'UPCOMING' : 'DUE_TODAY',
    };
  }).sort((a, b) => (a.periodStart ?? '').localeCompare(b.periodStart ?? '') || a.code.localeCompare(b.code));
  const groups = ['INITIAL', 'RECURRING', 'RENEWAL', 'SETTLEMENT'].map(type => {
    const rows = invoices.filter(invoice => invoice.type === type);
    return { type, title: groupNames[type], total: rows.reduce((sum, row) => sum + row.total, 0), paid: rows.reduce((sum, row) => sum + row.paid, 0), balance: rows.reduce((sum, row) => sum + row.balance, 0), invoices: rows };
  }).filter(group => group.invoices.length);
  return { rentalPeriod, paymentDetails: {
    totalInvoiced: invoices.reduce((sum, row) => sum + row.total, 0),
    totalPaid: invoices.reduce((sum, row) => sum + row.paid, 0),
    totalOutstanding: invoices.reduce((sum, row) => sum + row.balance, 0), groups,
  } };
}
