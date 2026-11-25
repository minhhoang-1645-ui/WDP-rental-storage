import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

export async function assertRoutineAccess(tx: Prisma.TransactionClient, unitIds: string[], authorizedPlanId?: string, priorPhysicalHandover = false) {
  if (!unitIds.length) return;
  const rows = await tx.$queryRaw<{ operationalStatus: string; closureMode: string | null; closurePlanId: string | null }[]>(Prisma.sql`
    SELECT f."operationalStatus", f."closureMode", f."closurePlanId" FROM "Facility" f
    WHERE f.id IN (
      SELECT t."facilityId" FROM "StorageType" t
      JOIN "StorageUnit" u ON u."storageTypeId" = t.id
      WHERE u.id IN (${Prisma.join(unitIds)})
    ) ORDER BY f.id FOR SHARE
  `);
  if (rows.some(f => f.operationalStatus === 'CLOSED' ||
      (f.operationalStatus === 'CLOSING' && f.closureMode === 'REQUIRED_RELOCATION' && !priorPhysicalHandover && (!authorizedPlanId || f.closurePlanId !== authorizedPlanId))))
    throw new ConflictException('Cơ sở đã dừng bàn giao thông thường. Liên hệ quản lý để xác nhận phương án an toàn.');
}

export async function assertRoutineFacilityAccess(tx: Prisma.TransactionClient, facilityId: string) {
  const rows = await tx.$queryRaw<{ operationalStatus: string; closureMode: string | null }[]>(Prisma.sql`
    SELECT "operationalStatus", "closureMode" FROM "Facility" WHERE id=${facilityId} FOR SHARE
  `);
  if (rows.some(f => f.operationalStatus === 'CLOSED' || f.operationalStatus === 'CLOSING' && f.closureMode === 'REQUIRED_RELOCATION'))
    throw new ConflictException('Cơ sở đã dừng bàn giao thông thường. Liên hệ quản lý để xác nhận phương án an toàn.');
}
