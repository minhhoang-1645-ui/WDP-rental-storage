import { describe, expect, it, vi } from 'vitest';
import { ReturnsService } from './returns.service.js';
import { SupportService } from '../support/support.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

// Memory-only dependencies: these tests never construct PrismaService or load credentials.
function setup() {
  const actor = { id: 'manager', role: 'MANAGER', fullName: 'Quản lý', email: 'manager@example.test', phone: '' } satisfies PublicUser;
  const end = new Date('2030-04-01T00:00:00Z');
  const allocation = { id: 'allocation-current', storageUnitId: 'unit-new', releasedAt: null, storageUnit: { status: 'OCCUPIED', unitNumber: 'B02' } };
  const reservation = { id: 'rental', reservationCode: 'RES-1', customerId: 'customer', status: 'CONFIRMED', quantity: 1, endDate: end, storageType: { id: 'type', name: 'Kho nhỏ' }, units: [allocation],
    contracts: [{ id: 'contract', contractCode: 'CON-1', status: 'ACTIVE', endDate: end, reservationUnitId: allocation.id, reservationUnit: allocation }], renewals: [] as { status: string }[], supportRequests: [] as any[],
    invoices: [{ invoiceCode: 'INV-1', totalAmount: 300n, amountPaid: 200n, balanceDue: 100n, depositAmount: 50n }] };
  const request = { id: 'proposal', supportCode: 'SUP-1', subject: 'Đề nghị trả kho trước hạn', category: 'OTHER', description: 'Không còn nhu cầu sử dụng', status: 'OPEN', createdAt: new Date(), resolutionNote: null as string | null, resolvedAt: null as Date | null, resolvedBy: null as any, lastAction: null as string | null, lastActionIdempotencyKey: null as string | null, customer: { id: 'customer', fullName: 'Khách' }, reservation };
  const tx = { $queryRaw: vi.fn(async () => []), supportRequest: {
    findFirst: vi.fn(async () => ({ id: request.id, reservationId: reservation.id })), findUniqueOrThrow: vi.fn(async () => request),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(request, data); request.resolvedBy = actor; return request; }),
  }, returnRequest: { findUnique: vi.fn(async () => null as any) } };
  const prisma = { $transaction: vi.fn(async (run: (value: typeof tx) => Promise<unknown>) => run(tx)) };
  const service = new ReturnsService(prisma as unknown as PrismaService);
  const input = { decision: 'APPROVED', note: 'Đã đối chiếu công nợ, giữ nguyên nghĩa vụ hóa đơn.', financialReviewConfirmed: true, reviewedEndDate: '2030-04-01', reviewedOutstandingAmount: 100, reviewedPaidAmount: 200 };
  return { actor, reservation, request, tx, prisma, service, input, internal: service as any };
}

describe('Early return approval with memory-only persistence', () => {
  it('only allows Manager decisions', async () => {
    for (const role of ['STAFF', 'CUSTOMER', 'ADMIN'] as const) { const app = setup(); await expect(app.service.decideEarlyReturn('proposal', app.input, { ...app.actor, role })).rejects.toThrow('Chỉ quản lý'); expect(app.prisma.$transaction).not.toHaveBeenCalled(); }
  });
  it('records an approval scoped to the reviewed end date without changing invoices or allocations', async () => {
    const app = setup(), before = structuredClone(app.reservation); const result = await app.service.decideEarlyReturn('proposal', app.input, app.actor);
    expect(result.decision).toBe('APPROVED'); expect(app.request.status).toBe('RESOLVED'); expect(app.request.lastActionIdempotencyKey).toBe('early-return:proposal:2030-04-01'); expect(app.reservation).toEqual(before); expect(app.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result.financialSummary).toEqual({ outstandingAmount: 100, paidAmount: 200, invoicedDeposit: 50 });
  });
  it('requires explicit financial review and rejects stale end dates or ledger values', async () => {
    for (const change of [{ financialReviewConfirmed: false }, { reviewedEndDate: '2030-05-01' }, { reviewedOutstandingAmount: 99 }, { reviewedPaidAmount: 199 }]) { const app = setup(); await expect(app.service.decideEarlyReturn('proposal', { ...app.input, ...change }, app.actor)).rejects.toThrow(); expect(app.tx.supportRequest.update).not.toHaveBeenCalled(); }
  });
  it('blocks approval during renewal or an active return', async () => {
    const app = setup(); app.reservation.renewals.push({ status: 'PENDING' }); await expect(app.service.decideEarlyReturn('proposal', app.input, app.actor)).rejects.toThrow('gia hạn'); app.reservation.renewals = []; app.tx.returnRequest.findUnique.mockResolvedValue({ id: 'return' }); await expect(app.service.decideEarlyReturn('proposal', app.input, app.actor)).rejects.toThrow('hồ sơ trả kho');
  });
  it('supports retries but rejects a conflicting second decision', async () => {
    const app = setup(); await app.service.decideEarlyReturn('proposal', app.input, app.actor); await app.service.decideEarlyReturn('proposal', app.input, app.actor); expect(app.tx.supportRequest.update).toHaveBeenCalledTimes(1);
    await expect(app.service.decideEarlyReturn('proposal', { ...app.input, decision: 'REJECTED' }, app.actor)).rejects.toThrow('đã được quyết định');
  });
  it('records a rejection without granting early return permission', async () => {
    const app = setup(); expect((await app.service.decideEarlyReturn('proposal', { ...app.input, decision: 'REJECTED', financialReviewConfirmed: false }, app.actor)).decision).toBe('REJECTED');
    app.reservation.supportRequests.push(app.request); expect(() => app.internal.assertReturnEligible(app.reservation, 'customer', new Date('2029-01-01'))).toThrow('quản lý chấp thuận');
  });
  it('requires authoritative approval for the current rental period, then permits return before expiry', async () => {
    const app = setup(), now = new Date('2029-01-01'); expect(() => app.internal.assertReturnEligible(app.reservation, 'customer', now)).toThrow('quản lý chấp thuận');
    await app.service.decideEarlyReturn('proposal', app.input, app.actor); app.reservation.supportRequests.push(app.request);
    expect(app.internal.assertReturnEligible(app.reservation, 'customer', now).unitIds).toEqual(['unit-new']);
    app.request.resolvedBy = { role: 'STAFF' }; expect(() => app.internal.assertReturnEligible(app.reservation, 'customer', now)).toThrow();
    app.request.resolvedBy = app.actor; app.request.lastActionIdempotencyKey = 'early-return:proposal:2029-04-01'; expect(() => app.internal.assertReturnEligible(app.reservation, 'customer', now)).toThrow();
    expect(() => app.internal.assertReturnEligible(app.reservation, 'another-customer', now)).toThrow('thuộc khách hàng');
  });
  it('retains normal expiry returns and excludes released transfer allocations in both read and eligibility queries', () => {
    const app = setup(); expect(app.internal.assertReturnEligible(app.reservation, 'customer', new Date('2030-04-02')).unitIds).toEqual(['unit-new']);
    expect(app.internal.eligibilityInclude().units.where).toEqual({ releasedAt: null }); expect(app.internal.include().reservation.include.units.where).toEqual({ releasedAt: null });
  });
  it('prevents ordinary support transitions from modifying early-return approval state', async () => {
    const app = setup(); const prisma = { supportRequest: { findFirst: vi.fn(async () => ({ id: 'proposal' })) }, $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run({ ...app.tx, supportRequest: { ...app.tx.supportRequest, findUnique: vi.fn(async () => app.request) } })) };
    const support = new SupportService(prisma as unknown as PrismaService);
    await expect(support.priority('proposal', { priority: 'HIGH' }, 'isolated-test-key-12345678', { ...app.actor, role: 'STAFF' })).rejects.toThrow('trả trước hạn');
    expect(app.tx.supportRequest.update).not.toHaveBeenCalled();
  });
  it('creates one whole-rental proposal and blocks duplicates while pending or approved', async () => {
    const app = setup(); let duplicate = false;
    const tx = { $queryRaw: vi.fn(async () => []), reservation: { findUnique: vi.fn(async () => ({ ...app.reservation, invoices: [] })) }, supportRequest: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => duplicate ? { id: 'existing' } : null), create: vi.fn(async ({ data }: any) => ({ id: 'new', ...data })) } };
    const prisma = { reservation: { findFirst: vi.fn(async () => ({ id: app.reservation.id })) }, supportRequest: { findUnique: vi.fn(async () => null) }, $transaction: vi.fn(async (run: any) => run(tx)) };
    const service = new SupportService(prisma as unknown as PrismaService); vi.spyOn(service as any, 'toView').mockImplementation(record => record);
    const customer = { ...app.actor, id: 'customer', role: 'CUSTOMER' as const }, input = { reservationId: 'rental', category: 'OTHER', subject: 'Đề nghị trả kho trước hạn', description: 'Tôi không còn nhu cầu sử dụng.' };
    await service.createCustomer(customer, input, 'isolated-proposal-123'); expect(tx.supportRequest.create).toHaveBeenCalledTimes(1);
    duplicate = true; await expect(service.createCustomer(customer, input, 'isolated-proposal-456')).rejects.toThrow('Đã có đề nghị'); expect(tx.supportRequest.create).toHaveBeenCalledTimes(1);
    duplicate = false;
    for (const change of [{ category: 'UNIT_ISSUE' }, { rentalContractId: 'contract' }, { storageUnitId: 'unit-new' }]) await expect(service.createCustomer(customer, { ...input, ...change }, 'isolated-proposal-789')).rejects.toThrow('toàn bộ kỳ thuê');
    app.reservation.contracts[0].status = 'COMPLETED'; await expect(service.createCustomer(customer, input, 'isolated-proposal-999')).rejects.toThrow('toàn bộ kho');
  });
});
