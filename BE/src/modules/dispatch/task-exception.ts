import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';

export async function recordTaskEvent(tx: Prisma.TransactionClient, actor: PublicUser, action: string, kind: string, id: string,
  metadata?: Prisma.InputJsonObject) {
  const completion: Record<string, string> = {
    appointments: 'complete-handover', returns: 'finalize', transfers: 'complete', 'support-requests': 'resolve', maintenance: 'complete-work',
  };
  const nativeAction = action === 'TASK_STAFF_COMPLETED' ? completion[kind]
    : kind === 'support-requests' ? 'escalate' : kind === 'transfers' ? 'problem' : undefined;
  const claim = kind === 'damage-claims' && action === 'TASK_STAFF_COMPLETED';
  const route = claim ? '/staff/management/damage-claims/:id' : nativeAction ? `/staff/${kind}/:id/${nativeAction}`
    : action === 'TASK_RESUMED' ? '/manager/assignment-queue/:kind/:id/resume' : '/staff/assignment-queue/:kind/:id/escalate';
  await tx.auditEvent.create({ data: {
    category: 'ACTIVITY', outcome: 'SUCCESS', action, resource: kind, resourceId: id, createdAt: new Date(),
    method: nativeAction ? 'POST' : 'PATCH', route, httpStatus: nativeAction ? 201 : 200,
    actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role, metadata,
  } });
}

export async function pendingTaskException(tx: Prisma.TransactionClient, kind: string, id: string) {
  const latest = await tx.auditEvent.findFirst({ where: { category: 'ACTIVITY', outcome: 'SUCCESS',
    action: { in: ['TASK_ESCALATED', 'TASK_RESUMED'] }, resource: kind, resourceId: id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true, metadata: true } });
  return latest?.action === 'TASK_ESCALATED' ? latest : null;
}

export async function assertTaskNotEscalated(tx: Prisma.TransactionClient, kind: string, id: string) {
  if (await pendingTaskException(tx, kind, id)) throw new ConflictException('Công việc đang chờ quản lý xử lý vướng mắc.');
}

export async function pendingTaskIds(tx: Prisma.TransactionClient, kind: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const latest = await tx.auditEvent.findMany({ where: { category: 'ACTIVITY', outcome: 'SUCCESS',
    action: { in: ['TASK_ESCALATED', 'TASK_RESUMED'] }, resource: kind, resourceId: { in: ids } },
    distinct: ['resourceId'], orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true, resourceId: true } });
  return new Set(latest.filter(event => event.action === 'TASK_ESCALATED').map(event => event.resourceId!));
}
