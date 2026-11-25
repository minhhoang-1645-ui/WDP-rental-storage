import type { PublicUser } from '../auth/auth.types.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import { invoiceFacilityScope, returnTaskScope, supportTaskScope, transferTaskScope, renewalTaskScope, currentContractScope } from '../facility-access/task-access.js';
import {
  legacyTransferFilter,
  transferSubjectFilter,
} from '../transfers/transfer-intake.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export function analyticsPeriod(input: Record<string, unknown>) {
  const parse = (key: string) => {
    const value = input[key];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException(`${key} phải là ngày YYYY-MM-DD hợp lệ.`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException(`${key} phải là ngày YYYY-MM-DD hợp lệ.`);
    return value;
  };
  const from = parse('from'),
    to = parse('to');
  if (from && to && from > to)
    throw new BadRequestException(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    );
  const until = to
    ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000)
    : undefined;
  return {
    from: from ?? null,
    to: to ?? null,
    timeZone: 'Asia/Ho_Chi_Minh',
    range: {
      ...(from ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
      ...(until ? { lt: until } : {}),
    },
  };
}
const money = (value: bigint | null) => {
  const result = Number(value ?? 0n);
  if (!Number.isSafeInteger(result))
    throw new Error('Tổng tiền vượt giới hạn hiển thị chính xác.');
  return result;
};

@Injectable()
export class ManagerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(input: Record<string, unknown>, actor: PublicUser) {
    const reservation = managerReservationScope(actor);
    const facility = reservation.facility;
    const scope = {
      storageUnit: { storageType: { facility } },
      rentalContract: { reservationUnit: { releasedAt: null, storageUnit: { storageType: { facility } } } },
      invoice: invoiceFacilityScope(actor),
      payment: { invoice: invoiceFacilityScope(actor) },
      depositSettlement: { returnRequest: returnTaskScope(actor) },
      user: { facilityAccess: { some: { revokedAt: null, facility } } },
      supportRequest: supportTaskScope(actor),
      maintenanceRequest: { OR: [{ storageUnit: { storageType: { facility } } }, { commonAreaFacility: facility }] },
      handoverAppointment: { reservation },
      returnRequest: returnTaskScope(actor),
      transferRequest: transferTaskScope(actor),
      damageClaim: { rentalContract: currentContractScope(actor) },
      renewalRequest: renewalTaskScope(actor),
      paymentSubmission: { invoice: invoiceFacilityScope(actor) },
      onlinePaymentReconciliation: {
        OR: [
          { onlinePaymentTransaction: { invoice: invoiceFacilityScope(actor) } },
          { paymentSubmission: { invoice: invoiceFacilityScope(actor) } },
        ],
      },
    };

    const { range, ...period } = analyticsPeriod(input);
    return this.prisma.$transaction(
      async (tx) => {
        // One consistent read; Payment is the only source of collected money.
        const units = await tx.storageUnit.groupBy({
          where: scope.storageUnit,
          by: ['status'],
          _count: { _all: true },
        });
        const unitCounts = Object.fromEntries(
          units.map((row) => [row.status, row._count._all]),
        );
        const total = units.reduce((sum, row) => sum + row._count._all, 0);
        const activeContracts = await tx.rentalContract.count({
          where: { ...scope.rentalContract, status: 'ACTIVE' },
        });
        const debt = await tx.invoice.aggregate({
          where: {
            ...scope.invoice,
            status: { in: ['OPEN', 'PARTIALLY_PAID'] },
            balanceDue: { gt: 0 },
          },
          _sum: { balanceDue: true },
          _count: { _all: true },
        });
        const collected = await tx.payment.aggregate({
          where: {
            ...scope.payment,
            receivedAt: range,
            OR: [
              { onlinePaymentTransactionId: null },
              { onlinePaymentTransaction: { is: { status: 'SUCCESS' } } },
            ],
          },
          _sum: { amount: true },
          _count: { _all: true },
        });
        const deposits = await tx.invoice.aggregate({
          where: {
            ...scope.invoice,
            status: 'PAID',
            paidAt: { not: null, ...range },
          },
          _sum: { depositAmount: true },
        });
        const refunds = await tx.depositSettlement.aggregate({
          where: {
            ...scope.depositSettlement,
            status: { in: ['APPROVED', 'AWAITING_OUTSTANDING_PAYMENT'] },
            refundedAt: null,
          },
          _sum: { refundAmount: true },
          _count: { _all: true },
        });
        const staff = await tx.user.findMany({
          where: { ...scope.user, role: 'FACILITY_STAFF' },
          select: { id: true, fullName: true, accountStatus: true },
          orderBy: { fullName: 'asc' },
        });
        const missingAssignee = {
          OR: [
            { assignedStaffUserId: null },
            {
              assignedStaff: {
                is: {
                  OR: [
                    { role: { not: 'FACILITY_STAFF' as const } },
                    { accountStatus: 'DISABLED' as const },
                  ],
                },
              },
            },
          ],
        };
        const ordinarySupport = {
          subject: { not: EARLY_RETURN_SUBJECT },
          NOT: transferSubjectFilter,
        };
        const queue = {
          unassignedSupport: await tx.supportRequest.count({
            where: {
              ...scope.supportRequest,
              status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
              ...ordinarySupport,
              ...missingAssignee,
              transferRequests: {
                none: {
                  status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] },
                },
              },
            },
          }),
          unassignedMaintenance: await tx.maintenanceRequest.count({
            where: {
              ...scope.maintenanceRequest,
              status: { in: ['OPEN', 'IN_PROGRESS'] },
              ...missingAssignee,
            },
          }),
          unassignedAppointments: await tx.handoverAppointment.count({
            where: {
              ...scope.handoverAppointment,
              status: { in: ['REQUESTED', 'CONFIRMED'] },
              ...missingAssignee,
            },
          }),
          unassignedReturns: await tx.returnRequest.count({
            where: {
              ...scope.returnRequest,
              status: {
                in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
              },
              ...missingAssignee,
            },
          }),
          unassignedTransfers: await tx.transferRequest.count({
            where: {
              ...scope.transferRequest,
              status: 'APPROVED',
              ...missingAssignee,
            },
          }),
          unassignedClaims: await tx.damageClaim.count({
            where: {
              ...scope.damageClaim,
              status: { in: ['REPORTED', 'INVESTIGATING'] },
              staffFacts: null,
              OR: [
                { assignedStaffId: null },
                {
                  assignedStaffId: {
                    notIn: staff
                      .filter((person) => person.accountStatus === 'ACTIVE')
                      .map((person) => person.id),
                  },
                },
              ],
            },
          }),
          escalatedSupport: await tx.supportRequest.count({
            where: {
              ...scope.supportRequest,
              status: 'ESCALATED',
              ...ordinarySupport,
              transferRequests: {
                none: {
                  status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] },
                },
              },
            },
          }),
          earlyReturnReview: await tx.supportRequest.count({
            where: {
              ...scope.supportRequest,
              status: { in: ['OPEN', 'ESCALATED'] },
              category: 'OTHER',
              subject: EARLY_RETURN_SUBJECT,
            },
          }),
          renewalReview: await tx.renewalRequest.count({
            where: { ...scope.renewalRequest, status: 'PENDING' },
          }),
          transferReview:
            (await tx.transferRequest.count({
              where: { ...scope.transferRequest, status: 'REQUESTED' },
            })) +
            (await tx.supportRequest.count({
              where: { ...scope.supportRequest, ...legacyTransferFilter },
            })),
          damageReview: await tx.damageClaim.count({
            where: {
              ...scope.damageClaim,
              status: 'INVESTIGATING',
              staffFacts: { not: null },
            },
          }),
          maintenanceReview: await tx.maintenanceRequest.count({
            where: {
              ...scope.maintenanceRequest,
              status: 'AWAITING_VERIFICATION',
            },
          }),
          paymentVerification: await tx.paymentSubmission.count({
            where: {
              ...scope.paymentSubmission,
              status: 'PENDING_VERIFICATION',
            },
          }),
          depositReview: await tx.depositSettlement.count({
            where: {
              ...scope.depositSettlement,
              status: 'PENDING_REVIEW',
            },
          }),
          onlineReconciliation: await tx.onlinePaymentReconciliation.count({
            where: {
              ...scope.onlinePaymentReconciliation,
              status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] },
            },
          }),
        };
        const support = await tx.supportRequest.groupBy({
          by: ['assignedStaffUserId'],
          where: {
            ...scope.supportRequest,
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
          _count: { _all: true },
        });
        const maintenance = await tx.maintenanceRequest.groupBy({
          by: ['assignedStaffUserId'],
          where: {
            ...scope.maintenanceRequest,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          _count: { _all: true },
        });
        const count = (rows: typeof support, id: string) =>
          rows.find((row) => row.assignedStaffUserId === id)?._count._all ?? 0;
        return {
          asOf: new Date().toISOString(),
          period,
          units: {
            total,
            available: unitCounts.AVAILABLE ?? 0,
            occupied: unitCounts.OCCUPIED ?? 0,
            maintenance: unitCounts.MAINTENANCE ?? 0,
            reserved: unitCounts.RESERVED ?? 0,
            utilizationPercent: total
              ? Math.round(((unitCounts.OCCUPIED ?? 0) * 10000) / total) / 100
              : null,
          },
          activeContracts,
          finance: {
            unpaidInvoices: debt._count._all,
            outstandingAmount: money(debt._sum.balanceDue),
            collectedAmount: money(collected._sum.amount),
            paymentCount: collected._count._all,
            depositOnFullyPaidInvoices: money(deposits._sum.depositAmount),
            approvedRefundOutstanding: money(refunds._sum.refundAmount),
          },
          queue,
          workload: staff.map((person) => ({
            ...person,
            support: count(support, person.id),
            maintenance: count(maintenance, person.id),
          })),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
  }
}
