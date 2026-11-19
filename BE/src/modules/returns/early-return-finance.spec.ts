import { describe, expect, it, vi } from 'vitest';
import { assertFullSettlementPolicyInput, assertReturnFullyPaid, returnReadiness } from './early-return-finance.js';
import { ReturnsService } from './returns.service.js';
import { contractDeposit, contractReturnReadiness } from './contract-return-finance.js';
import { invoiceBreakdown } from '../billing/invoice-breakdown.js';
import type { PublicUser } from '../auth/auth.types.js';

const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
function setup(balance = 0n, endDate = '2030-05-17') {
  const unit = { id: 'unit', status: 'OCCUPIED' }, allocation = { id: 'allocation', reservationId: 'reservation', storageUnitId: 'unit', releasedAt: null, storageUnit: unit };
  const reservation = { id: 'reservation', customerId: customer.id, reservationCode: 'RES', status: 'CONFIRMED', quantity: 1, endDate: new Date(endDate), units: [allocation],
    quoteSnapshot: { depositAmount: 1500000 },
    contracts: [{ id: 'contract', status: 'ACTIVE', endDate: new Date(endDate), reservationUnitId: allocation.id, reservationUnit: allocation }], renewals: [],
    supportRequests: [{ id: 'proposal', rentalContractId: null, status: 'RESOLVED', lastAction: 'EARLY_RETURN_APPROVED', lastActionIdempotencyKey: `early-return:proposal:${endDate}`, resolvedBy: { role: 'MANAGER' }, earlyReturnFinancialReview: { disposition: 'WAIVE_UNUSED' } }],
    invoices: [{ id: 'initial', type: 'INITIAL', status: 'PAID', invoiceCode: 'I01', totalAmount: 3000000n, amountPaid: 3000000n, balanceDue: 0n, depositAmount: 1500000n }, { id: 'future', type: 'RENEWAL', status: balance ? 'OPEN' : 'PAID', invoiceCode: 'FUTURE', totalAmount: 1500000n, amountPaid: 1500000n - balance, balanceDue: balance, depositAmount: 0n }],
  };
  const row = { id: 'return', activeKey: 'RETURN:reservation', status: 'INSPECTION_IN_PROGRESS', assignedStaffUserId: staff.id, reservationId: reservation.id, returnCode: 'RETURN', reservation, inspections: [{ id: 'inspection', result: 'PASS', issueType: null, storageUnitId: 'unit', rentalContractId: 'contract' }] };
  const tx = { $queryRaw: vi.fn(), reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
    returnRequest: { findUnique: vi.fn(async ({ where }) => where.id ? row : null), findUniqueOrThrow: vi.fn(async () => row), create: vi.fn(), count: vi.fn().mockResolvedValue(0), update: vi.fn(async ({ data }) => Object.assign(row, data)) },
    rentalContract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), aggregate: vi.fn().mockResolvedValue({ _max: { endDate: null } }) }, reservationUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storageUnit: { updateMany: vi.fn(async ({ where }) => ({ count: where.id.in.length })) },
    stockMovement: { count: vi.fn().mockResolvedValue(0) }, storedItem: { count: vi.fn().mockResolvedValue(0) }, depositSettlement: { create: vi.fn() },
    transferRequest: { count: vi.fn().mockResolvedValue(0) }, returnInspection: { findFirst: vi.fn().mockResolvedValue(null) },
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

describe('Shared invoice allocation for one returned warehouse', () => {
  type Invoice = Parameters<typeof contractReturnReadiness>[0][number];
  const line = (contractId: string, rentalAmount: number, depositAmount: number) => ({
    contractId, contractCode: contractId, reservationUnitId: contractId + '-allocation', storageUnitId: contractId + '-unit',
    unitCode: contractId, storageTypeId: 'type', storageTypeName: 'Kho', monthlyRate: rentalAmount, rentalAmount, depositAmount,
  });
  const invoice = (lines: ReturnType<typeof line>[], amountPaid: bigint, type = 'RECURRING'): Invoice => {
    const rentalAmount = lines.reduce((sum, unit) => sum + BigInt(unit.rentalAmount), 0n);
    const depositAmount = lines.reduce((sum, unit) => sum + BigInt(unit.depositAmount), 0n);
    const totalAmount = rentalAmount + depositAmount;
    const balanceDue = totalAmount - amountPaid;
    const totals = { rentalAmount, depositAmount, totalAmount, serviceAmount: 0n, chargeAmount: 0n };
    const breakdown = invoiceBreakdown(new Date('2026-10-01'), new Date('2026-11-01'), lines, [], totals);
    return { ...totals, invoiceCode: type + '-1', type, amountPaid, balanceDue, status: balanceDue === 0n ? 'PAID' : amountPaid === 0n ? 'OPEN' : 'PARTIALLY_PAID', pricingSnapshot: { breakdown } };
  };
  const ids = ['A', 'B'];

  it('allows A to return when a validated open invoice only bills B', () => {
    const onlyB = invoice([line('B', 1500000, 0)], 0n);
    expect(contractReturnReadiness([onlyB], ['A'], ids)).toMatchObject({ canReturn: true, totalOutstanding: 0 });
    expect(contractReturnReadiness([onlyB], ['B'], ids)).toMatchObject({ canReturn: false, totalOutstanding: 1500000 });
  });

  it('counts a wholly unpaid shared invoice and requires reconciliation for an unallocated partial payment', () => {
    const lines = [line('A', 1250000, 0), line('B', 1750000, 0)];
    expect(contractReturnReadiness([invoice(lines, 0n)], ['A'], ids)).toMatchObject({ canReturn: false, totalOutstanding: 3000000, requiresReconciliation: false });
    expect(contractReturnReadiness([invoice(lines, 1000000n)], ['A'], ids)).toMatchObject({ canReturn: false, totalOutstanding: null, requiresReconciliation: true });
  });

  it('uses the settled invoice’s actual deposit lines and rejects missing or malformed allocation', () => {
    const initial = invoice([line('A', 1500000, 1250000), line('B', 1500000, 1750000)], 6000000n, 'INITIAL');
    expect(contractDeposit([initial], ['A'], ids, { depositAmount: 3000000 }, false)).toBe(1250000n);
    expect(contractDeposit([initial], ['B'], ids, { depositAmount: 3000000 }, false)).toBe(1750000n);
    for (const pricingSnapshot of [null, { breakdown: { version: 1, units: [null], sharedServices: [] } }]) {
      const old = { ...initial, pricingSnapshot };
      expect(() => contractDeposit([old], ['A'], ids, { depositAmount: 3000000 }, false)).toThrow('Chưa xác định được tiền cọc');
      expect(contractDeposit([old], ids, ids, { depositAmount: 3000000 }, true)).toBe(3000000n);
    }
  });
});
