-- Prepared only. Do not apply to the shared database without the user's approval.
CREATE TABLE "UnitStaffAssignment" (
  "id" TEXT NOT NULL,
  "storageUnitId" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "UnitStaffAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnitStaffAssignment_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UnitStaffAssignment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UnitStaffAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "UnitStaffAssignment_storageUnitId_endedAt_idx" ON "UnitStaffAssignment"("storageUnitId", "endedAt");
CREATE INDEX "UnitStaffAssignment_staffUserId_endedAt_idx" ON "UnitStaffAssignment"("staffUserId", "endedAt");
CREATE UNIQUE INDEX "UnitStaffAssignment_one_active_staff_per_unit" ON "UnitStaffAssignment"("storageUnitId") WHERE "endedAt" IS NULL;
