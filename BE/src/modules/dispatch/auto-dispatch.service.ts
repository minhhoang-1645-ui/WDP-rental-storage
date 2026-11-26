import { ConflictException, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { transferSubjectFilter } from '../transfers/transfer-intake.js';

import { AppointmentsService } from '../appointments/appointments.service.js';
import { ReturnsService } from '../returns/returns.service.js';
import { assertRoutineFacilityAccess } from '../facilities/facility-safety.js';
import { staffDirectWork, transferWork, type WorkKind } from './work-phase.js';

type Db = Prisma.TransactionClient;
type Candidate = { id: string; queuedAt: Date; resource: WorkKind; priority: number };
const taskTables: Record<WorkKind, string> = {
  appointments: 'HandoverAppointment', returns: 'ReturnRequest', transfers: 'TransferRequest',
  'damage-claims': 'DamageClaim', 'support-requests': 'SupportRequest', maintenance: 'MaintenanceRequest',
};
const batchSize = 50;
const activeStaff = (facilityId: string) => ({
  role: 'FACILITY_STAFF' as const, accountStatus: 'ACTIVE' as const,
  facilityAccess: { some: { facilityId, revokedAt: null } },
});
const present = (now: Date) => ({
  status: 'SCHEDULED' as const, startsAt: { lte: now }, endsAt: { gt: now },
  checkedInAt: { lte: now }, checkedOutAt: null, breakStartedAt: null,
});
const location = (facilityId: string) => ({ storageType: { facilityId } });
const support = (facilityId: string): Prisma.SupportRequestWhereInput => ({
  closurePlanId: null, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter,
  OR: [
    { storageUnit: location(facilityId) },
    { storageUnitId: null, rentalContract: { reservationUnit: { storageUnit: location(facilityId) } } },
    { storageUnitId: null, rentalContractId: null, reservation: { facilityId } },
  ],
});
const maintenance = (facilityId: string) => ({
  OR: [{ commonAreaFacilityId: facilityId }, { storageUnit: { storageType: { facilityId } } }],
});

const dueAppointment = (facilityId: string, now: Date): Prisma.HandoverAppointmentWhereInput => ({
  reservation: { facilityId }, status: 'CONFIRMED', scheduledAt: { lte: now }, assignedStaffUserId: null,
});
const dueReturn = (facilityId: string, now: Date): Prisma.ReturnRequestWhereInput => ({
  status: 'REQUESTED', inspectionScheduledAt: { lte: now }, assignedStaffUserId: null, physicallyReturnedAt: null,
  OR: [{ inspections: { some: {}, every: { storageUnit: location(facilityId) } } }, { inspections: { none: {} }, reservation: { facilityId } }],
});
const readyTransfer = (facilityId: string): Prisma.TransferRequestWhereInput => ({
  status: 'APPROVED', closurePlanId: null, assignedStaffUserId: null,
  fromStorageUnit: { ...location(facilityId), status: 'OCCUPIED' },
  rentalContract: { status: 'ACTIVE' }, fromReservationUnit: { releasedAt: null },
  toReservationUnit: { releasedAt: null },
  toStorageUnit: { ...location(facilityId), status: 'RESERVED', incidentBlocks: { none: { releasedAt: null } },
    maintenanceRequests: { none: { activeKey: { not: null } } } },
  // Commercial orders retain their existing review/payment workflow.
  commercialSnapshot: { equals: Prisma.DbNull },
});
const readyClaim = (facilityId: string): Prisma.DamageClaimWhereInput => ({
  status: { in: ['REPORTED', 'INVESTIGATING'] }, staffFacts: null, assignedStaffId: null,
  rentalContract: { reservationUnit: { storageUnit: location(facilityId) } },
});

@Injectable()
export class AutoDispatchService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweep?: Promise<void>;
  private readonly log = new Logger(AutoDispatchService.name);

  constructor(private readonly database: PrismaService, @Optional() private readonly appointments?: AppointmentsService,
    @Optional() private readonly returns?: ReturnsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.NESTBOX_AUTO_DISPATCH_ENABLED !== 'true') return;
    // Polling is a technical retry cadence. Readiness and staffing use business data.
    this.timer = setInterval(() => this.tick(), 15000);
    this.timer.unref();
    this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.sweep;
  }

  private tick() {
    if (this.sweep) return;
    this.sweep = this.run().catch(error => {
      this.log.error('Không thể quét hàng chờ phân công.', error instanceof Error ? error.message : undefined);
    }).finally(() => { this.sweep = undefined; });
  }

  async run() {
    const facilities = await this.database.staffShift.findMany({
      where: present(new Date()), distinct: ['facilityId'], select: { facilityId: true },
    });
    for (const { facilityId } of facilities) await this.dispatchFacility(facilityId);
  }

  async dispatchFacility(facilityId: string) {
    const tasks = await this.queued(facilityId);
    let assigned = 0;
    for (const task of tasks) if (await this.tryAssign(facilityId, task)) assigned++;
    return assigned;
  }

  private async queued(facilityId: string): Promise<Candidate[]> {
    const now = new Date();
    const supportWhere = { ...support(facilityId), status: 'OPEN' as const, assignedStaffUserId: null };
    const maintenanceWhere = { ...maintenance(facilityId), status: 'OPEN' as const, dispatchReadyAt: { lte: now }, assignedStaffUserId: null };
    const maintenanceBatch = (priority: Prisma.MaintenanceRequestWhereInput['priority']) => this.database.maintenanceRequest.findMany({
      where: { ...maintenanceWhere, priority }, orderBy: [{ dispatchReadyAt: 'asc' }, { id: 'asc' }],
      take: batchSize, select: { id: true, dispatchReadyAt: true },
    });
    const age = [{ createdAt: 'asc' }, { id: 'asc' }] as const;
    const [urgent, regularMaintenance, prioritySupport, regularSupport, appointments, returns, transfers, claims] = await Promise.all([
      maintenanceBatch({ in: ['URGENT', 'HIGH'] }), maintenanceBatch({ notIn: ['URGENT', 'HIGH'] }),
      this.database.supportRequest.findMany({ where: { ...supportWhere, priority: 'HIGH' }, orderBy: [...age], take: batchSize, select: { id: true, createdAt: true } }),
      this.database.supportRequest.findMany({ where: { ...supportWhere, priority: { not: 'HIGH' } }, orderBy: [...age], take: batchSize, select: { id: true, createdAt: true } }),
      this.database.handoverAppointment.findMany({ where: dueAppointment(facilityId, now), orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: batchSize, select: { id: true, scheduledAt: true } }),
      this.database.returnRequest.findMany({ where: dueReturn(facilityId, now), orderBy: [{ inspectionScheduledAt: 'asc' }, { id: 'asc' }], take: batchSize, select: { id: true, inspectionScheduledAt: true } }),
      this.database.transferRequest.findMany({ where: readyTransfer(facilityId), orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }], take: batchSize, select: { id: true, approvedAt: true, createdAt: true } }),
      this.database.damageClaim.findMany({ where: readyClaim(facilityId), orderBy: [...age], take: batchSize, select: { id: true, createdAt: true } }),
    ]);
    const candidate = (resource: WorkKind, id: string, queuedAt: Date, priority = 3): Candidate => ({ resource, id, queuedAt, priority });
    return [
      ...urgent.map(row => candidate('maintenance', row.id, row.dispatchReadyAt!, 1)),
      ...prioritySupport.map(row => candidate('support-requests', row.id, row.createdAt, 1)),
      ...appointments.map(row => candidate('appointments', row.id, row.scheduledAt, 2)),
      ...returns.map(row => candidate('returns', row.id, row.inspectionScheduledAt!, 2)),
      ...regularMaintenance.map(row => candidate('maintenance', row.id, row.dispatchReadyAt!)),
      ...regularSupport.map(row => candidate('support-requests', row.id, row.createdAt)),
      ...transfers.map(row => candidate('transfers', row.id, row.approvedAt ?? row.createdAt)),
      ...claims.map(row => candidate('damage-claims', row.id, row.createdAt)),
    ].sort((a, b) => a.priority - b.priority || +a.queuedAt - +b.queuedAt || a.id.localeCompare(b.id));
  }

  private async tryAssign(facilityId: string, task: Candidate) {
    return this.database.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${'nestbox.dispatch:' + facilityId}, 0)) AS acquired
      `;
      if (!lock?.acquired) return false;
      const table = Prisma.raw('"' + taskTables[task.resource] + '"');
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM ${table} WHERE id = ${task.id} FOR UPDATE`);
      if (!rows.length) return false;
      const now = new Date();
      if (task.resource === 'appointments' && !await this.appointments?.dispatchEligible(tx, task.id, now)) return false;
      if (task.resource === 'returns' && !await this.returns?.dispatchEligible(tx, task.id, now)) return false;
      if (task.resource === 'transfers') {
        try {
          await assertRoutineFacilityAccess(tx, facilityId);
        } catch (error) {
          if (error instanceof ConflictException) return false;
          throw error;
        }
        const transfer = await tx.transferRequest.findUniqueOrThrow({ where: { id: task.id } });
        const phase = transferWork(transfer);
        if (phase.awaitingCustomer || phase.problemPending) return false;
      }
      const shifts = await tx.staffShift.findMany({
        where: { facilityId, ...present(now), staff: activeStaff(facilityId) },
        select: { id: true, staffUserId: true },
      });
      const rotation = await tx.$queryRaw<{ staffId: string; last: Date }[]>`
        SELECT "metadata"->>'assignedStaffUserId' AS "staffId", MAX("createdAt") AS last
        FROM "AuditEvent"
        WHERE "action" = 'TASK_ASSIGNMENT' AND "metadata"->>'source' = 'AUTO' AND "metadata"->>'facilityId' = ${facilityId}
        GROUP BY 1
      `;
      const last = new Map(rotation.map(row => [row.staffId, +row.last]));
      const sentToQueue = await tx.auditEvent.findFirst({
        where: { action: 'TASK_ASSIGNMENT', resource: task.resource, resourceId: task.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { metadata: true, createdAt: true },
      });
      const release = sentToQueue?.metadata;
      const previous = release && typeof release === 'object' && !Array.isArray(release) && release.source === 'MANAGER_QUEUE'
        ? release.previousStaffUserId : undefined;
      shifts.sort((a, b) => (last.get(a.staffUserId) ?? 0) - (last.get(b.staffUserId) ?? 0) || a.staffUserId.localeCompare(b.staffUserId));
      for (const shift of shifts) {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${shift.staffUserId} FOR UPDATE SKIP LOCKED`;
        if (!locked.length) continue;
        const current = await tx.staffShift.findFirst({
          where: { id: shift.id, facilityId, ...present(new Date()), staff: activeStaff(facilityId) },
          select: { checkedInAt: true },
        });
        if (!current || previous === shift.staffUserId && sentToQueue && current.checkedInAt! <= sentToQueue.createdAt
          || (await staffDirectWork(tx, shift.staffUserId, new Date())).length) continue;
        const changed = await this.assign(tx, task, facilityId, shift.staffUserId, new Date());
        if (changed.count !== 1) return false;
        await tx.auditEvent.create({ data: {
          category: 'ACTIVITY', action: 'TASK_ASSIGNMENT', outcome: 'SUCCESS',
          resource: task.resource, resourceId: task.id, route: '/system/dispatch', method: 'PATCH', httpStatus: 200,
          metadata: { source: 'AUTO', facilityId, shiftId: shift.id, previousStaffUserId: null, assignedStaffUserId: shift.staffUserId },
        } });
        return true;
      }
      return false;
    });
  }

  private assign(tx: Db, task: Candidate, facilityId: string, staffId: string, now: Date) {
    const id = task.id;
    const data = { assignedStaffUserId: staffId };
    switch (task.resource) {
      case 'support-requests': return tx.supportRequest.updateMany({
        where: { id, ...support(facilityId), status: 'OPEN', assignedStaffUserId: null }, data: { ...data, status: 'ASSIGNED' },
      });
      case 'maintenance': return tx.maintenanceRequest.updateMany({
        where: { id, ...maintenance(facilityId), status: 'OPEN', dispatchReadyAt: { lte: now }, assignedStaffUserId: null }, data,
      });
      case 'appointments': return tx.handoverAppointment.updateMany({
        where: { id, ...dueAppointment(facilityId, now) }, data: { ...data, assignedAt: now },
      });
      case 'returns': return tx.returnRequest.updateMany({ where: { id, ...dueReturn(facilityId, now) }, data });
      case 'transfers': return tx.transferRequest.updateMany({ where: { id, ...readyTransfer(facilityId) }, data });
      case 'damage-claims': return tx.damageClaim.updateMany({ where: { id, ...readyClaim(facilityId) }, data: { assignedStaffId: staffId } });
    }
  }
}
