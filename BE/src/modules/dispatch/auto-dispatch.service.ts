import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { transferSubjectFilter } from '../transfers/transfer-intake.js';

type Db = Prisma.TransactionClient;
type Candidate = { id: string; createdAt: Date; resource: 'support-requests' | 'maintenance' };
const batchSize = 50;
const activeStaff = (facilityId: string) => ({
  role: 'FACILITY_STAFF' as const, accountStatus: 'ACTIVE' as const,
  facilityAccess: { some: { facilityId, revokedAt: null } },
});
const present = (now: Date) => ({
  status: 'SCHEDULED' as const, startsAt: { lte: now }, endsAt: { gt: now },
  checkedInAt: { lte: now }, checkedOutAt: null,
});
const support = (facilityId: string) => ({
  reservation: { facilityId }, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter,
});
const maintenance = (facilityId: string) => ({
  OR: [{ commonAreaFacilityId: facilityId }, { storageUnit: { storageType: { facilityId } } }],
});

@Injectable()
export class AutoDispatchService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweep?: Promise<void>;
  private readonly log = new Logger(AutoDispatchService.name);

  constructor(private readonly database: PrismaService) {}

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
    const orderBy = [{ createdAt: 'asc' }, { id: 'asc' }] as const;
    const [supportRows, maintenanceRows] = await Promise.all([
      this.database.supportRequest.findMany({
        where: { ...support(facilityId), status: 'OPEN', assignedStaffUserId: null },
        orderBy: [...orderBy], take: batchSize, select: { id: true, createdAt: true },
      }),
      this.database.maintenanceRequest.findMany({
        where: { ...maintenance(facilityId), status: 'OPEN', dispatchReadyAt: { not: null }, assignedStaffUserId: null },
        orderBy: [...orderBy], take: batchSize, select: { id: true, createdAt: true },
      }),
    ]);
    return [
      ...supportRows.map(row => ({ ...row, resource: 'support-requests' as const })),
      ...maintenanceRows.map(row => ({ ...row, resource: 'maintenance' as const })),
    ].sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id)).slice(0, batchSize);
  }

  private async tryAssign(facilityId: string, task: Candidate) {
    return this.database.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${'nestbox.dispatch:' + facilityId}, 0)) AS acquired
      `;
      if (!lock?.acquired) return false;
      if (task.resource === 'support-requests') {
        await tx.$queryRaw`SELECT id FROM "SupportRequest" WHERE id = ${task.id} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "MaintenanceRequest" WHERE id = ${task.id} FOR UPDATE`;
      }
      const now = new Date();
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
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${shift.staffUserId} FOR UPDATE`;
        const current = await tx.staffShift.findFirst({
          where: { id: shift.id, facilityId, ...present(new Date()), staff: activeStaff(facilityId) },
          select: { checkedInAt: true },
        });
        if (!current || previous === shift.staffUserId && sentToQueue && current.checkedInAt! <= sentToQueue.createdAt
          || await this.hasImmediateWork(tx, shift.staffUserId, new Date())) continue;
        const changed = task.resource === 'support-requests'
          ? await tx.supportRequest.updateMany({
            where: { id: task.id, ...support(facilityId), status: 'OPEN', assignedStaffUserId: null },
            data: { assignedStaffUserId: shift.staffUserId, status: 'ASSIGNED' },
          })
          : await tx.maintenanceRequest.updateMany({
            where: { id: task.id, ...maintenance(facilityId), status: 'OPEN', dispatchReadyAt: { not: null }, assignedStaffUserId: null },
            data: { assignedStaffUserId: shift.staffUserId },
          });
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

  private async hasImmediateWork(tx: Db, staffUserId: string, now: Date) {
    const assignedStaffUserId = staffUserId;
    if (await tx.supportRequest.count({ where: {
      assignedStaffUserId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, customerWaitReason: null,
      subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter,
    } })) return true;
    if (await tx.maintenanceRequest.count({ where: { assignedStaffUserId, status: { in: ['OPEN', 'IN_PROGRESS'] } } })) return true;
    if (await tx.handoverAppointment.count({ where: { assignedStaffUserId, status: 'CONFIRMED', scheduledAt: { lte: now } } })) return true;
    if (await tx.returnRequest.count({ where: {
      assignedStaffUserId, physicallyReturnedAt: null,
      OR: [{ status: { in: ['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] } }, {
        status: 'REQUESTED', OR: [{ inspectionScheduledAt: null }, { inspectionScheduledAt: { lte: now } }],
      }],
    } })) return true;
    return Boolean(await tx.damageClaim.count({ where: {
      assignedStaffId: staffUserId, status: { in: ['REPORTED', 'INVESTIGATING'] }, staffFacts: null,
    } }));
  }
}
