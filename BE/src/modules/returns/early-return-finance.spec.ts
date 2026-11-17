import { describe, expect, it, vi } from 'vitest';
import { assertFullSettlementPolicyInput, assertReturnFullyPaid, returnReadiness } from './early-return-finance.js';
import { ReturnsService } from './returns.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
function setup(balance = 0n, endDate = '2030-05-17') {
  const unit = { id: 'unit', status: 'OCCUPIED' }, allocation = { id: 'allocation', storageUnitId: 'unit', releasedAt: null, storageUnit: unit };
  const reservation = { id: 'reservation', customerId: customer.id, reservationCode: 'RES', status: 'CONFIRMED', quantity: 1, endDate: new Date(endDate), units: [allocation],
    quoteSnapshot: { depositAmount: 1500000 },
    contracts: [{ id: 'contract', status: 'ACTIVE', endDate: new Date(endDate), reservationUnitId: allocation.id, reservationUnit: allocation }], renewals: [],
    supportRequests: [{ id: 'proposal', status: 'RESOLVED', lastAction: 'EARLY_RETURN_APPROVED', lastActionIdempotencyKey: `early-return:proposal:${endDate}`, resolvedBy: { role: 'MANAGER' }, earlyReturnFinancialReview: { disposition: 'WAIVE_UNUSED' } }],
    invoices: [{ id: 'initial', type: 'INITIAL', status: 'PAID', invoiceCode: 'I01', totalAmount: 3000000n, amountPaid: 3000000n, balanceDue: 0n, depositAmount: 1500000n }, { id: 'future', type: 'RENEWAL', status: balance ? 'OPEN' : 'PAID', invoiceCode: 'FUTURE', totalAmount: 1500000n, amountPaid: 1500000n - balance, balanceDue: balance, depositAmount: 0n }],
  };
  const row = { id: 'return', status: 'INSPECTION_IN_PROGRESS', reservationId: reservation.id, returnCode: 'RETURN', reservation, inspections: [{ id: 'inspection', result: 'PASS', issueType: null, storageUnitId: 'unit', rentalContractId: 'contract' }] };
  const tx = { $queryRaw: vi.fn(), reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
    returnRequest: { findUnique: vi.fn(async ({ where }) => where.id ? row : null), findUniqueOrThrow: vi.fn(async () => row), create: vi.fn(), count: vi.fn().mockResolvedValue(0), update: vi.fn(async ({ data }) => Object.assign(row, data)) },
    rentalContract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, reservationUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storageUnit: { updateMany: vi.fn(async ({ where }) => ({ count: where.id.in.length })) },
    stockMovement: { count: vi.fn().mockResolvedValue(0) }, storedItem: { count: vi.fn().mockResolvedValue(0) }, depositSettlement: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(operation => operation(tx)), reservation: { findFirst: vi.fn().mockResolvedValue({ id: reservation.id }) }, returnRequest: { findFirst: vi.fn().mockResolvedValue({ id: row.id }) } };
  const service = new ReturnsService(db as never);
  vi.spyOn(service as any, 'toReturn').mockImplementation(record => record);
  return { service, db, tx, row, reservation };
}
describe('Mandatory full settlement before warehouse return', () => {
  it('counts all future/partial balances and ignores VOID history only', () => {
    expect(returnReadiness([{ status: 'PAID', balanceDue: 0n }, { status: 'OPEN', balanceDue: 1500000n }, { status: 'PARTIALLY_PAID', balanceDue: 300000n }, { status: 'VOID', balanceDue: 9000000n }])).toMatchObject({ canReturn: false, totalOutstanding: 1800000, unpaidInvoiceCount: 2, requiresFullSettlement: true });
    expect(() => assertReturnFullyPaid([{ status: 'OPEN', balanceDue: 1n }])).toThrow('thanh toán đủ');
    expect(returnReadiness([{ status: 'PAID', balanceDue: 0n }]).canReturn).toBe(true);
    expect(returnReadiness([]).canReturn).toBe(true);
  });
  it('fails closed for missing or malformed ledger amounts', () => {
    for (const invoices of [undefined, [{ status: 'OPEN', balanceDue: NaN }], [{ status: 'OPEN', balanceDue: -1n }]]) expect(returnReadiness(invoices).canReturn).toBe(false);
  });
  it.each(['2030-05-17', '2000-05-17'])('blocks customer creation with debt for end date %s', async end => {
    const app = setup(1500000n, end);
    await expect(app.service.createCustomerReturn(customer, { reservationId: 'reservation' }, 'return-request-key')).rejects.toMatchObject({ response: { code: 'RETURN_UNPAID_INVOICES', totalOutstanding: 1500000 } });
    expect(app.tx.returnRequest.create).not.toHaveBeenCalled(); expect(app.tx.rentalContract.updateMany).not.toHaveBeenCalled();
  });
  it('rechecks debt on staff finalize and never applies legacy pending waivers', async () => {
    const app = setup(1500000n);
    await expect(app.service.finalize('return', staff)).rejects.toMatchObject({ response: { code: 'RETURN_UNPAID_INVOICES' } });
    expect(app.tx.rentalContract.updateMany).not.toHaveBeenCalled(); expect(app.tx.reservationUnit.updateMany).not.toHaveBeenCalled(); expect(app.tx.depositSettlement.create).not.toHaveBeenCalled();
    expect(app.reservation.invoices[1].balanceDue).toBe(1500000n);
  });
  it('uses the fresh ledger after locking the request and reservation', async () => {
    const app = setup();
    app.tx.returnRequest.findUniqueOrThrow.mockImplementationOnce(async () => { app.reservation.invoices[1].balanceDue = 1n; return app.row; });
    await expect(app.service.finalize('return', staff)).rejects.toThrow('thanh toán đủ'); expect(app.tx.rentalContract.updateMany).not.toHaveBeenCalled();
  });
  it('allows physical return after full payment and stock/inspection checks', async () => {
    const app = setup();
    expect((await app.service.finalize('return', staff)).status).toBe('PENDING_SETTLEMENT');
    expect(app.tx.rentalContract.updateMany).toHaveBeenCalledOnce(); expect(app.tx.reservationUnit.updateMany).toHaveBeenCalledOnce(); expect(app.tx.depositSettlement.create).toHaveBeenCalledOnce();
  });
  it('rejects stale waiver payloads and the retired finance endpoint without writes', async () => {
    expect(() => assertFullSettlementPolicyInput({ financialDisposition: 'WAIVE_UNUSED' })).toThrow('thanh toán đủ');
    const app = setup(), manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
    await expect(app.service.reviewEarlyReturnFinance('proposal', { financialDisposition: 'WAIVE_UNUSED' }, manager)).rejects.toMatchObject({ response: { code: 'RETURN_DEBT_WAIVER_DISABLED' } });
    await expect(app.service.decideEarlyReturn('proposal', { decision: 'APPROVED', note: 'Miễn kỳ chưa dùng', financialDisposition: 'WAIVE_UNUSED', financialReviewConfirmed: true }, manager)).rejects.toMatchObject({ response: { code: 'RETURN_DEBT_WAIVER_DISABLED' } });
    expect(app.db.$transaction).not.toHaveBeenCalled();
  });
});
