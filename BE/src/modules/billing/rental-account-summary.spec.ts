import { describe, expect, it } from 'vitest';
import { rentalAccountSummary, type RentalAccountRecord } from './rental-account-summary.js';

const date = (value: string) => new Date(value);
function fixture(): RentalAccountRecord {
  const invoice = (id: string, type: string, rental: number, deposit: number, paid: number, start: string, end: string) => ({
    id, invoiceCode: id, type, status: paid === rental + deposit ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'OPEN',
    totalAmount: BigInt(rental + deposit), amountPaid: BigInt(paid), balanceDue: BigInt(rental + deposit - paid), rentalAmount: BigInt(rental), depositAmount: BigInt(deposit),
    billingPeriodStart: date(start), billingPeriodEnd: date(end), dueAt: date(start),
  });
  return {
    startDate: date('2026-11-16T17:00:00Z'), endDate: date('2027-05-16T17:00:00Z'), durationMonths: 3,
    quoteSnapshot: { startDate: '2026-11-17', endDate: '2027-02-17', termMonths: 3, quotedTotalAmount: 6000000 },
    contracts: [{ status: 'ACTIVE', startDate: date('2026-11-17'), endDate: date('2027-05-17') }],
    renewals: [{ status: 'COMPLETED', termMonths: 3, previousEndDate: date('2027-02-17'), requestedEndDate: date('2027-05-17') }],
    invoices: [
      invoice('I01', 'INITIAL', 1500000, 1500000, 3000000, '2026-11-17', '2026-12-17'),
      invoice('I02', 'RECURRING', 1500000, 0, 0, '2026-12-17', '2027-01-17'),
      invoice('I03', 'RECURRING', 1500000, 0, 0, '2027-01-17', '2027-02-17'),
      invoice('R01', 'RENEWAL', 4275000, 0, 4275000, '2027-02-17', '2027-05-17'),
    ],
  };
}
describe('Customer account summary', () => {
  it('separates the 6m quote from the 3m initial receipt, paid renewal and two unpaid original months', () => {
    const result = rentalAccountSummary(fixture(), date('2026-11-17'));
    expect(result.paymentDetails).toMatchObject({ totalPaid: 7275000, totalOutstanding: 3000000, totalInvoiced: 10275000 });
    expect(result.paymentDetails.groups).toMatchObject([
      { type: 'INITIAL', total: 3000000, paid: 3000000, balance: 0, invoices: [{ rental: 1500000, deposit: 1500000 }] },
      { type: 'RECURRING', total: 3000000, paid: 0, balance: 3000000, invoices: [{ periodStart: '2026-12-17', periodEnd: '2027-01-17', dueState: 'UPCOMING' }, { periodStart: '2027-01-17', periodEnd: '2027-02-17', dueState: 'UPCOMING' }] },
      { type: 'RENEWAL', paid: 4275000, balance: 0 },
    ]);
    expect(result.rentalPeriod).toEqual({ originalStartDate: '2026-11-17', originalEndDate: '2027-02-17', originalMonths: 3, extendedMonths: 3, totalMonths: 6, currentStartDate: '2026-11-17', currentEndDate: '2027-05-17' });
  });
  it('does not extend pending/rejected renewals or fabricate receipts from an estimate', () => {
    const record = fixture();
    record.renewals![0].status = 'APPROVED_PENDING_PAYMENT';
    record.contracts![0].endDate = date('2027-02-17');
    record.invoices = [];
    expect(rentalAccountSummary(record)).toMatchObject({ rentalPeriod: { originalMonths: 3, extendedMonths: 0, totalMonths: 3, currentEndDate: '2027-02-17' }, paymentDetails: { totalPaid: 0, totalOutstanding: 0, groups: [] } });
  });
  it('preserves a partial invoice payment without guessing which rent/deposit component was paid, and excludes VOID invoices', () => {
    const record = fixture();
    record.invoices![0].amountPaid = 1000000n;
    record.invoices![0].balanceDue = 2000000n;
    record.invoices![0].status = 'PARTIALLY_PAID';
    record.invoices!.push({ ...record.invoices![0], id: 'void', status: 'VOID' });
    const details = rentalAccountSummary(record).paymentDetails;
    expect(details.totalPaid).toBe(5275000);
    expect(details.totalOutstanding).toBe(5000000);
    expect(details.groups[0]).toMatchObject({ paid: 1000000, balance: 2000000, invoices: [{ rental: 1500000, deposit: 1500000, paid: 1000000 }] });
    expect(details.groups[0].invoices).toHaveLength(1);
  });
});
