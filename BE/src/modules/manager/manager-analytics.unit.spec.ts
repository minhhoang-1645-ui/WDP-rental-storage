import { describe, expect, it, vi } from 'vitest';
import { analyticsPeriod, ManagerAnalyticsService } from './manager-analytics.service.js';

function setup() {
  const tx = {
    storageUnit: { groupBy: vi.fn().mockResolvedValue([{ status: 'AVAILABLE', _count: { _all: 80 } }, { status: 'OCCUPIED', _count: { _all: 30 } }, { status: 'MAINTENANCE', _count: { _all: 10 } }]) },
    rentalContract: { count: vi.fn().mockResolvedValue(31) },
    invoice: { aggregate: vi.fn(async ({ where }) => where.status === 'PAID' ? { _sum: { depositAmount: 1500000n } } : { _sum: { balanceDue: 600000n }, _count: { _all: 2 } }) },
    payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 3000000n }, _count: { _all: 1 } }) },
    depositSettlement: { aggregate: vi.fn().mockResolvedValue({ _sum: { refundAmount: 1000000n }, _count: { _all: 1 } }), count: vi.fn().mockResolvedValue(1) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'staff', fullName: 'Nhân viên', accountStatus: 'ACTIVE' }]) },
    stockMovement: { count: vi.fn().mockResolvedValue(1), groupBy: vi.fn().mockResolvedValue([{ assignedStaffUserId: 'staff', _count: { _all: 3 } }]) },
    supportRequest: { count: vi.fn().mockResolvedValue(2), groupBy: vi.fn().mockResolvedValue([]) },
    maintenanceRequest: { count: vi.fn().mockResolvedValue(3), groupBy: vi.fn().mockResolvedValue([]) },
    paymentSubmission: { count: vi.fn().mockResolvedValue(4) }, onlinePaymentReconciliation: { count: vi.fn().mockResolvedValue(1) },
  };
  const prisma = { $transaction: vi.fn(operation => operation(tx)) };
  return { tx, service: new ManagerAnalyticsService(prisma as never) };
}

describe('RV3 Manager report, no database writes', () => {
  it('defines inclusive Vietnam calendar dates with an exclusive upper bound', () => {
    expect(analyticsPeriod({ from: '2026-11-10', to: '2026-11-10' }).range).toEqual({ gte: new Date('2026-11-09T17:00:00Z'), lt: new Date('2026-11-10T17:00:00Z') });
    for (const query of [{ from: '2026-02-30' }, { to: '2026-13-01' }, { from: '2026-11-10', to: '2026-11-09' }, { from: ['2026-01-01'] }]) expect(() => analyticsPeriod(query)).toThrow();
  });
  it('counts all physical units, actual contracts and scoped staff workload', async () => {
    const { service } = setup(); const data = await service.report({});
    expect(data.units).toMatchObject({ total: 120, occupied: 30, reserved: 0, utilizationPercent: 25 });
    expect(data.activeContracts).toBe(31);
    expect(data.workload).toEqual([expect.objectContaining({ stock: 3, support: 0, maintenance: 0 })]);
  });
  it('does not label an empty denominator as zero utilization or suppress API failures', async () => {
    const { service, tx } = setup(); tx.storageUnit.groupBy.mockResolvedValue([]);
    expect((await service.report({})).units.utilizationPercent).toBeNull();
    tx.payment.aggregate.mockRejectedValue(new Error('unavailable'));
    await expect(service.report({})).rejects.toThrow('unavailable');
  });
  it('sums only confirmed Payment cashflow, excludes pending VNPay and never sums submissions', async () => {
    const { service, tx } = setup(); const data = await service.report({ from: '2026-11-10', to: '2026-11-10' });
    expect(tx.payment.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { receivedAt: { gte: new Date('2026-11-09T17:00:00Z'), lt: new Date('2026-11-10T17:00:00Z') }, OR: [{ onlinePaymentTransactionId: null }, { onlinePaymentTransaction: { is: { status: 'SUCCESS' } } }] } }));
    expect(tx.paymentSubmission.count).toHaveBeenCalledWith({ where: { status: 'PENDING_VERIFICATION' } });
    expect(data.finance.collectedAmount).toBe(3000000);
    expect(data.finance.depositOnFullyPaidInvoices).toBe(1500000);
    expect(data.finance).not.toHaveProperty('revenue');
  });
  it('excludes VOID and PAID invoices from current debt and uses paidAt only for paid deposit snapshots', async () => {
    const { service, tx } = setup(); await service.report({});
    expect(tx.invoice.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] }, balanceDue: { gt: 0 } } }));
    expect(tx.invoice.aggregate).toHaveBeenCalledWith({ where: { status: 'PAID', paidAt: { not: null } }, _sum: { depositAmount: true } });
    expect(tx.depositSettlement.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ['APPROVED', 'AWAITING_OUTSTANDING_PAYMENT'] }, refundedAt: null } }));
  });
});
