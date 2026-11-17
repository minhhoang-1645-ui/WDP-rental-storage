import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export function analyticsPeriod(input: Record<string, unknown>) {
  const parse = (key: string) => {
    const value = input[key];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${key} phải là ngày YYYY-MM-DD hợp lệ.`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${key} phải là ngày YYYY-MM-DD hợp lệ.`);
    return value;
  };
  const from = parse('from'), to = parse('to');
  if (from && to && from > to) throw new BadRequestException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  const until = to ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000) : undefined;
  return { from: from ?? null, to: to ?? null, timeZone: 'Asia/Ho_Chi_Minh', range: { ...(from ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}), ...(until ? { lt: until } : {}) } };
}
const money = (value: bigint | null) => {
  const result = Number(value ?? 0n);
  if (!Number.isSafeInteger(result)) throw new Error('Tổng tiền vượt giới hạn hiển thị chính xác.');
  return result;
};

@Injectable()
export class ManagerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(input: Record<string, unknown>) {
    const { range, ...period } = analyticsPeriod(input);
    return this.prisma.$transaction(async tx => {
      // One consistent read; Payment is the only source of collected money.
      const units = await tx.storageUnit.groupBy({ by: ['status'], _count: { _all: true } });
      const unitCounts = Object.fromEntries(units.map(row => [row.status, row._count._all]));
      const total = units.reduce((sum, row) => sum + row._count._all, 0);
      const activeContracts = await tx.rentalContract.count({ where: { status: 'ACTIVE' } });
      const debt = await tx.invoice.aggregate({ where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] }, balanceDue: { gt: 0 } }, _sum: { balanceDue: true }, _count: { _all: true } });
      const collected = await tx.payment.aggregate({ where: { receivedAt: range, OR: [{ onlinePaymentTransactionId: null }, { onlinePaymentTransaction: { is: { status: 'SUCCESS' } } }] }, _sum: { amount: true }, _count: { _all: true } });
      const deposits = await tx.invoice.aggregate({ where: { status: 'PAID', paidAt: { not: null, ...range } }, _sum: { depositAmount: true } });
      const refunds = await tx.depositSettlement.aggregate({ where: { status: { in: ['APPROVED', 'AWAITING_OUTSTANDING_PAYMENT'] }, refundedAt: null }, _sum: { refundAmount: true }, _count: { _all: true } });
      const queue = {
        unassignedStock: await tx.stockMovement.count({ where: { status: 'REQUESTED', assignedStaffUserId: null } }),
        unassignedSupport: await tx.supportRequest.count({ where: { status: 'OPEN', assignedStaffUserId: null } }),
        unassignedMaintenance: await tx.maintenanceRequest.count({ where: { status: 'OPEN', assignedStaffUserId: null } }),
        escalatedSupport: await tx.supportRequest.count({ where: { status: 'ESCALATED' } }),
        maintenanceReview: await tx.maintenanceRequest.count({ where: { status: 'AWAITING_VERIFICATION' } }),
        paymentVerification: await tx.paymentSubmission.count({ where: { status: 'PENDING_VERIFICATION' } }),
        depositReview: await tx.depositSettlement.count({ where: { status: 'PENDING_REVIEW' } }),
        onlineReconciliation: await tx.onlinePaymentReconciliation.count({ where: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } }),
      };
      const staff = await tx.user.findMany({ where: { role: 'STAFF' }, select: { id: true, fullName: true, accountStatus: true }, orderBy: { fullName: 'asc' } });
      const stock = await tx.stockMovement.groupBy({ by: ['assignedStaffUserId'], where: { status: 'ASSIGNED' }, _count: { _all: true } });
      const support = await tx.supportRequest.groupBy({ by: ['assignedStaffUserId'], where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, _count: { _all: true } });
      const maintenance = await tx.maintenanceRequest.groupBy({ by: ['assignedStaffUserId'], where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: { _all: true } });
      const count = (rows: typeof stock, id: string) => rows.find(row => row.assignedStaffUserId === id)?._count._all ?? 0;
      return {
        asOf: new Date().toISOString(), period,
        units: { total, available: unitCounts.AVAILABLE ?? 0, occupied: unitCounts.OCCUPIED ?? 0, maintenance: unitCounts.MAINTENANCE ?? 0, reserved: unitCounts.RESERVED ?? 0, utilizationPercent: total ? Math.round((unitCounts.OCCUPIED ?? 0) * 10000 / total) / 100 : null },
        activeContracts,
        finance: { unpaidInvoices: debt._count._all, outstandingAmount: money(debt._sum.balanceDue), collectedAmount: money(collected._sum.amount), paymentCount: collected._count._all, depositOnFullyPaidInvoices: money(deposits._sum.depositAmount), approvedRefundOutstanding: money(refunds._sum.refundAmount) },
        queue,
        workload: staff.map(person => ({ ...person, stock: count(stock, person.id), support: count(support, person.id), maintenance: count(maintenance, person.id) })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
}
