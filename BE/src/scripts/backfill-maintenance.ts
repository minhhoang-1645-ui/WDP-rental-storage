import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const prisma = new PrismaService();

async function main() {
  const reporterEmail = process.env.MAINTENANCE_BACKFILL_REPORTER_EMAIL ?? process.env.SEED_MANAGER_EMAIL;
  if (!reporterEmail) throw new Error('MAINTENANCE_BACKFILL_REPORTER_EMAIL or SEED_MANAGER_EMAIL is required.');
  const reporter = await prisma.user.findFirst({
    where: { email: reporterEmail.trim().toLowerCase(), role: { in: ['MANAGER', 'ADMIN'] } },
    select: { id: true },
  });
  if (!reporter) throw new Error('Configured maintenance backfill reporter must be an existing MANAGER or ADMIN.');

  const candidates = await prisma.storageUnit.findMany({
    where: { status: 'MAINTENANCE', maintenanceRequests: { none: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'] } } } },
    select: {
      id: true,
      unitNumber: true,
      returnInspections: {
        where: { result: 'ISSUE_FOUND', maintenanceRequest: null },
        select: { id: true, issueType: true, issueNote: true, conditionNote: true },
        orderBy: { createdAt: 'desc' },
        take: 2,
      },
    },
  });

  let returnInspection = 0;
  let manual = 0;
  for (const unit of candidates) {
    const inspection = unit.returnInspections.length === 1 ? unit.returnInspections[0] : null;
    await prisma.maintenanceRequest.create({
      data: {
        maintenanceCode: `WDP-MNT-IMPORT-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        storageUnitId: unit.id,
        source: inspection ? 'RETURN_INSPECTION' : 'MANUAL',
        returnInspectionId: inspection?.id,
        category: inspection ? category(inspection.issueType!) : 'OTHER',
        priority: 'MEDIUM',
        description: inspection?.issueNote ?? inspection?.conditionNote ?? 'Existing maintenance state imported into Maintenance V1.',
        reportedByUserId: reporter.id,
        activeKey: `MAINTENANCE:${unit.id}`,
        createIdempotencyKey: `MAINTENANCE_IMPORT:${unit.id}`,
      },
    });
    if (inspection) returnInspection += 1;
    else manual += 1;
  }
  console.log(JSON.stringify({ candidates: candidates.length, returnInspection, manual }));
}

function category(issueType: string) {
  if (issueType === 'CUSTOMER_DAMAGE') return 'UNIT_DAMAGE' as const;
  if (issueType === 'CLEANING_REQUIRED') return 'CLEANING' as const;
  if (issueType === 'LOST_KEY_OR_ACCESS_ITEM') return 'LOCK_OR_ACCESS' as const;
  if (issueType === 'FACILITY_FAULT') return 'FACILITY_EQUIPMENT' as const;
  return 'OTHER' as const;
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Maintenance backfill failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
