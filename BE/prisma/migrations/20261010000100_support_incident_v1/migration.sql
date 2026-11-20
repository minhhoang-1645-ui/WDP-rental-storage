CREATE TYPE "SupportCategory" AS ENUM ('UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'PAYMENT_SUPPORT', 'STORED_ITEM_CONCERN', 'OTHER');
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED');
CREATE TYPE "SupportResolutionType" AS ENUM ('ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'MANAGER_RESOLVED', 'TRANSFER_RECOMMENDED', 'NO_ACTION_REQUIRED', 'OTHER');

CREATE TABLE "SupportRequest" (
  "id" TEXT NOT NULL,
  "supportCode" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "rentalContractId" TEXT,
  "storageUnitId" TEXT,
  "invoiceId" TEXT,
  "category" "SupportCategory" NOT NULL,
  "priority" "SupportPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "assignedStaffUserId" TEXT,
  "startedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "escalatedByUserId" TEXT,
  "escalationReason" TEXT,
  "resolutionType" "SupportResolutionType",
  "resolutionNote" TEXT,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "lastAction" TEXT,
  "lastActionIdempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportRequest_subject_check" CHECK (length(btrim("subject")) >= 3),
  CONSTRAINT "SupportRequest_description_check" CHECK (length(btrim("description")) >= 3),
  CONSTRAINT "SupportRequest_resolution_check" CHECK (
    ("status" = 'RESOLVED' AND "resolutionType" IS NOT NULL AND "resolutionNote" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND "resolvedAt" IS NOT NULL)
    OR ("status" <> 'RESOLVED' AND "resolutionType" IS NULL AND "resolvedByUserId" IS NULL AND "resolvedAt" IS NULL)
  ),
  CONSTRAINT "SupportRequest_escalation_check" CHECK (
    ("status" IN ('ESCALATED', 'RESOLVED') AND "escalatedAt" IS NOT NULL AND "escalatedByUserId" IS NOT NULL AND "escalationReason" IS NOT NULL)
    OR ("status" NOT IN ('ESCALATED', 'RESOLVED'))
    OR ("status" = 'RESOLVED' AND "escalatedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "SupportRequest_supportCode_key" ON "SupportRequest"("supportCode");
CREATE UNIQUE INDEX "SupportRequest_idempotencyKey_key" ON "SupportRequest"("idempotencyKey");
CREATE UNIQUE INDEX "SupportRequest_lastActionIdempotencyKey_key" ON "SupportRequest"("lastActionIdempotencyKey");
CREATE INDEX "SupportRequest_customerUserId_createdAt_idx" ON "SupportRequest"("customerUserId", "createdAt");
CREATE INDEX "SupportRequest_status_priority_createdAt_idx" ON "SupportRequest"("status", "priority", "createdAt");
CREATE INDEX "SupportRequest_assignedStaffUserId_status_idx" ON "SupportRequest"("assignedStaffUserId", "status");
CREATE INDEX "SupportRequest_reservationId_createdAt_idx" ON "SupportRequest"("reservationId", "createdAt");
CREATE INDEX "SupportRequest_storageUnitId_status_idx" ON "SupportRequest"("storageUnitId", "status");

ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_escalatedByUserId_fkey" FOREIGN KEY ("escalatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
