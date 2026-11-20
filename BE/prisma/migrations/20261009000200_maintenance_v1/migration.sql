-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MaintenanceSource" AS ENUM ('RETURN_INSPECTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "maintenanceCode" TEXT NOT NULL,
    "storageUnitId" TEXT NOT NULL,
    "source" "MaintenanceSource" NOT NULL,
    "returnInspectionId" TEXT,
    "category" "MaintenanceCategory" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "assignedStaffUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "workCompletedAt" TIMESTAMP(3),
    "workNote" TEXT,
    "verificationNote" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "activeKey" TEXT,
    "createIdempotencyKey" TEXT NOT NULL,
    "lastAction" TEXT,
    "lastActionIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceRequest_source_link_check" CHECK (
      ("source" = 'RETURN_INSPECTION' AND "returnInspectionId" IS NOT NULL)
      OR ("source" = 'MANUAL' AND "returnInspectionId" IS NULL)
    ),
    CONSTRAINT "MaintenanceRequest_active_state_check" CHECK (
      ("status" = 'COMPLETED' AND "activeKey" IS NULL)
      OR ("status" <> 'COMPLETED' AND "activeKey" IS NOT NULL)
    ),
    CONSTRAINT "MaintenanceRequest_completion_check" CHECK (
      ("status" <> 'COMPLETED')
      OR ("verifiedByUserId" IS NOT NULL AND "verifiedAt" IS NOT NULL)
    ),
    CONSTRAINT "MaintenanceRequest_description_check" CHECK (length(btrim("description")) >= 3)
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_maintenanceCode_key" ON "MaintenanceRequest"("maintenanceCode");
CREATE UNIQUE INDEX "MaintenanceRequest_returnInspectionId_key" ON "MaintenanceRequest"("returnInspectionId");
CREATE UNIQUE INDEX "MaintenanceRequest_activeKey_key" ON "MaintenanceRequest"("activeKey");
CREATE UNIQUE INDEX "MaintenanceRequest_createIdempotencyKey_key" ON "MaintenanceRequest"("createIdempotencyKey");
CREATE UNIQUE INDEX "MaintenanceRequest_lastActionIdempotencyKey_key" ON "MaintenanceRequest"("lastActionIdempotencyKey");
CREATE INDEX "MaintenanceRequest_status_priority_createdAt_idx" ON "MaintenanceRequest"("status", "priority", "createdAt");
CREATE INDEX "MaintenanceRequest_storageUnitId_createdAt_idx" ON "MaintenanceRequest"("storageUnitId", "createdAt");
CREATE INDEX "MaintenanceRequest_assignedStaffUserId_status_idx" ON "MaintenanceRequest"("assignedStaffUserId", "status");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_returnInspectionId_fkey" FOREIGN KEY ("returnInspectionId") REFERENCES "ReturnInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
