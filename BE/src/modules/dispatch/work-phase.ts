import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { readUnitHandoverDraft } from '../appointments/handover-report.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { transferSubjectFilter } from '../transfers/transfer-intake.js';

export type WorkPhase = 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'STAFF_DONE';
export type WaitReason = 'CUSTOMER' | 'MANAGER' | 'SCHEDULE' | 'SAFETY' | 'RENTAL_REQUIREMENTS';
export type WorkKind = 'appointments' | 'transfers' | 'returns' | 'support-requests' | 'maintenance' | 'damage-claims';

export const handoverUnitSafety = {
  status: true,
  incidentBlocks: { where: { releasedAt: null }, select: { id: true }, take: 1 },
  maintenanceRequests: { where: { activeKey: { not: null } }, select: { id: true }, take: 1 },
} satisfies Prisma.StorageUnitSelect;

export function handoverSafetyBlocked(units: { status: string; incidentBlocks?: unknown[]; maintenanceRequests?: unknown[] }[]) {
  return units.some(unit => ['MAINTENANCE', 'OCCUPIED'].includes(unit.status) ||
    Boolean(unit.incidentBlocks?.length || unit.maintenanceRequests?.length));
}

type Work = {
  status: string;
  assignedStaffUserId?: string | null;
  scheduledAt?: Date | null;
  physicallyReturnedAt?: Date | null;
  staffFacts?: unknown;
  bookingReady?: boolean;
  safetyBlocked?: boolean;
  handoverStarted?: boolean;
  problemPending?: boolean;
  awaitingCustomer?: boolean;
  customerWaitReason?: string | null;
};

export function workPhase(kind: WorkKind, work: Work, now = new Date()): { phase: WorkPhase; waitReason?: WaitReason } {
  if (['COMPLETED', 'RESOLVED', 'REJECTED', 'CANCELLED'].includes(work.status)
    || kind === 'returns' && (work.physicallyReturnedAt || work.status === 'PENDING_SETTLEMENT')
    || kind === 'damage-claims' && (work.staffFacts || work.status === 'APPROVED')) return { phase: 'STAFF_DONE' };
  if (kind === 'appointments' && work.safetyBlocked) return { phase: 'WAITING', waitReason: 'SAFETY' };
  if (kind === 'appointments' && work.bookingReady === false) return { phase: 'WAITING', waitReason: 'RENTAL_REQUIREMENTS' };
  if (kind === 'appointments' && work.status === 'REQUESTED'
    || kind === 'transfers' && (work.status === 'REQUESTED' || work.problemPending)
    || kind === 'support-requests' && work.status === 'ESCALATED'
    || kind === 'maintenance' && work.status === 'AWAITING_VERIFICATION') return { phase: 'WAITING', waitReason: 'MANAGER' };
  if (work.awaitingCustomer || work.customerWaitReason) return { phase: 'WAITING', waitReason: 'CUSTOMER' };
  if ((kind === 'appointments' || kind === 'returns' && work.status === 'REQUESTED') && !work.handoverStarted && work.scheduledAt && work.scheduledAt > now) {
    return { phase: 'WAITING', waitReason: 'SCHEDULE' };
  }
  if (!work.assignedStaffUserId) return { phase: 'UNASSIGNED' };
  if (work.handoverStarted || ['IN_PROGRESS', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(work.status)) {
    return { phase: 'IN_PROGRESS' };
  }
  return { phase: 'ASSIGNED' };
}
export async function staffDirectWork(tx: Prisma.TransactionClient, staffId: string, now: Date) {
  const assignedStaffUserId = staffId;
  const [appointments, transfers, returns, support, maintenance, claims] = await Promise.all([
    tx.handoverAppointment.findMany({ where: { assignedStaffUserId, status: 'CONFIRMED' },
      select: { id: true, status: true, scheduledAt: true, handoverReport: true, reservation: { select: {
        status: true, paidCancellation: true, units: { where: { releasedAt: null }, select: { storageUnit: { select: handoverUnitSafety } } },
      } } } }),
    tx.transferRequest.findMany({ where: { status: 'APPROVED', OR: [{ assignedStaffUserId }, { receivingStaffId: staffId }] },
      select: { id: true, status: true, assignedStaffUserId: true, receivingStaffId: true, closurePlanId: true,
        sourceHandover: true, destinationHandover: true, handoverReport: true, commercialSnapshot: true, customerAcceptedAt: true } }),
    tx.returnRequest.findMany({ where: { assignedStaffUserId, status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] } },
      select: { id: true, status: true, inspectionScheduledAt: true, physicallyReturnedAt: true } }),
    tx.supportRequest.findMany({ where: { assignedStaffUserId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      closurePlanId: null, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter },
      select: { id: true, status: true, customerWaitReason: true } }),
    tx.maintenanceRequest.findMany({ where: { assignedStaffUserId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: { id: true, status: true } }),
    tx.damageClaim.findMany({ where: { assignedStaffId: staffId, status: { in: ['REPORTED', 'INVESTIGATING'] } },
      select: { id: true, status: true, staffFacts: true } }),
  ]);
  const direct = (kind: WorkKind, items: (Work & { id: string })[]) => items.flatMap(item => {
    const { phase } = workPhase(kind, { ...item, assignedStaffUserId }, now);
    return phase === 'ASSIGNED' || phase === 'IN_PROGRESS' ? [{ kind, id: item.id, phase }] : [];
  });
  return [
    ...direct('appointments', appointments.map(row => ({
      ...row, handoverStarted: !!readUnitHandoverDraft(row.handoverReport).unitProgress.length,
      bookingReady: row.reservation.status === 'CONFIRMED' && (row.reservation.paidCancellation as { state?: string } | null)?.state !== 'REQUESTED',
      safetyBlocked: handoverSafetyBlocked(row.reservation.units.map(unit => unit.storageUnit)),
    }))),
    ...direct('transfers', transfers.flatMap(row => {
      if (!row.closurePlanId) return [{ ...row, ...transferWork(row) }];
      if (row.assignedStaffUserId === staffId && !row.sourceHandover ||
        row.receivingStaffId === staffId && row.sourceHandover && !row.destinationHandover) return [row];
      return [];
    })),
    ...direct('returns', returns.map(row => ({ ...row, scheduledAt: row.inspectionScheduledAt }))),
    ...direct('support-requests', support), ...direct('maintenance', maintenance), ...direct('damage-claims', claims),
  ];
}

export function transferWork(row: { handoverReport: Prisma.JsonValue | null; commercialSnapshot: unknown; customerAcceptedAt: Date | null }) {
  const json = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const report = json(row.handoverReport);
  const problems = Array.isArray(report.problems) ? report.problems.length : 0;
  return {
    awaitingCustomer: Boolean(row.commercialSnapshot && !row.customerAcceptedAt || report.destinationAccessDeliveredAt && !report.customerMoveReadyAt),
    problemPending: problems > 0 && json(report.problemReview).problemCount !== problems,
    handoverStarted: Boolean(report.sourceInspectionStartedAt),
  };
}

export async function assertCanStartDirectWork(tx: Prisma.TransactionClient, staffId: string, kind: WorkKind, id: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${staffId} FOR UPDATE`;
  const now = new Date();
  if ((await staffDirectWork(tx, staffId, now)).some(task => task.phase === 'IN_PROGRESS' && (task.id !== id || task.kind !== kind))) {
    throw new ConflictException('Bạn đang thực hiện công việc khác. Hãy hoàn thành hoặc chuyển giao trước.');
  }
}
