import { describe, expect, it, vi } from 'vitest';
import { BookingService } from './booking.service.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';

describe('Customer rental history preserves original prices and follows the current contract', () => {
  const unit = { id: 'new-unit', unitNumber: 'SM-C08-004', floor: 'Tầng 1', zone: 'C08' };
  function setup() {
    const quote = { quotedTotalAmount: 3800000, paymentPlan: 'PAY_MONTHLY' };
    const record = {
      id: 'reservation', reservationCode: 'RES-1', customerId: 'customer', startDate: new Date('2026-11-17'), endDate: new Date('2027-03-17'), durationMonths: 1, quantity: 1,
      status: 'CONFIRMED', createdAt: new Date('2026-11-17'), quoteSnapshot: quote,
      customer: { id: 'customer', role: 'CUSTOMER' },
      storageType: { id: 'type', name: 'Kho nhỏ', widthCm: 150, lengthCm: 200, heightCm: 240, monthlyRate: 1900000 },
      contracts: [{ id: 'contract', contractCode: 'CON-1', status: 'ACTIVE', reservationUnit: { storageUnit: unit } }],
      invoices: [{ totalAmount: 3800000n, amountPaid: 3800000n }, { totalAmount: 5415000n, amountPaid: 5415000n }],
      renewals: [{ id: 'renewal', renewalCode: 'REN-1', status: 'COMPLETED', termMonths: 3, previousEndDate: new Date('2026-12-17'), requestedEndDate: new Date('2027-03-17'), quoteSnapshot: { totalAmount: 5415000, discountAmount: 285000 }, invoices: [{ totalAmount: 5415000n, amountPaid: 5415000n }] }],
      transferRequests: [{ id: 'transfer', transferCode: 'TRF-1', fromStorageUnit: { unitNumber: 'SM-C08-003' }, toStorageUnit: unit, completedAt: new Date('2026-11-17T09:00:00Z') }],
    };
    const db = { reservation: { findMany: vi.fn().mockResolvedValue([record]), findFirst: vi.fn().mockResolvedValue(record) } };
    return { quote, record, db, service: new BookingService(db as never) };
  }
  it('includes the paid renewal in lists and detail without overwriting the initial quote', async () => {
    const app = setup();
    const [listed] = await app.service.listReservations('customer');
    const detail = await app.service.getReservation({ id: 'customer', role: 'CUSTOMER' } as never, 'RES-1');
    for (const item of [listed, detail]) {
      expect(item.quote).toEqual(app.quote);
      expect(item.durationMonths).toBe(1);
      expect(item.endDateExclusive).toBe('2027-03-17');
      expect(item.rentalSummary).toMatchObject({ totalInvoiced: 9215000, totalPaid: 9215000, renewalPaid: 5415000, renewals: [{ amount: 5415000, discount: 285000, paid: 5415000, months: 3 }] });
      expect(item.rentalSummary?.currentUnits).toMatchObject([{ unitCode: 'SM-C08-004' }]);
      expect(item.rentalSummary?.transfers).toMatchObject([{ from: 'SM-C08-003', to: 'SM-C08-004', handoverReport: null }]);
    }
    const include = app.db.reservation.findMany.mock.calls[0][0].include;
    expect(include.invoices.where).toEqual({ status: { not: 'VOID' } });
    expect(include.renewals.include.invoices.where).toEqual({ status: { not: 'VOID' } });
  });
  it('never presents a partial renewal as fully paid', async () => {
    const app = setup();
    app.record.renewals[0].status = 'APPROVED_PENDING_PAYMENT';
    app.record.renewals[0].invoices[0].amountPaid = 1000000n;
    app.record.invoices[1].amountPaid = 1000000n;
    const [item] = await app.service.listReservations('customer');
    expect(item.rentalSummary?.totalPaid).toBe(4800000);
    expect(item.rentalSummary?.renewalPaid).toBe(1000000);
    expect(item.rentalSummary?.renewals[0].status).toBe('APPROVED_PENDING_PAYMENT');
  });
  it('reports stored goods at the current contract unit after transfer', async () => {
    const db = { storedItem: { findMany: vi.fn().mockResolvedValue([{ id: 'item', name: 'Máy lạnh', balance: 1, unit: 'cái', rentalContract: { id: 'contract', contractCode: 'CON-1', reservationUnit: { storageUnit: unit } } }]) } };
    const result = await new StockMovementsService(db as never).listStoredItems('customer', 'contract');
    expect(result[0]).toMatchObject({ name: 'Máy lạnh', balance: 1, storageUnit: { unitNumber: 'SM-C08-004' } });
    expect(db.storedItem.findMany.mock.calls[0][0].where).toMatchObject({ customerUserId: 'customer', balance: { gt: 0 } });
  });
});
