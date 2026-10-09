CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'COMPLETED');
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASS', 'ISSUE_FOUND');

CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "returnCode" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionStartedAt" TIMESTAMP(3),
    "inspectionStartedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnInspection" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "rentalContractId" TEXT NOT NULL,
    "storageUnitId" TEXT NOT NULL,
    "result" "InspectionResult" NOT NULL DEFAULT 'PENDING',
    "conditionNote" TEXT,
    "issueNote" TEXT,
    "inspectedByUserId" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnInspection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReturnInspection_actor_check" CHECK (("result" = 'PENDING' AND "inspectedByUserId" IS NULL AND "inspectedAt" IS NULL) OR ("result" <> 'PENDING' AND "inspectedByUserId" IS NOT NULL AND "inspectedAt" IS NOT NULL)),
    CONSTRAINT "ReturnInspection_issue_note_check" CHECK ("result" <> 'ISSUE_FOUND' OR LENGTH(TRIM("issueNote")) >= 3)
);

CREATE UNIQUE INDEX "ReturnRequest_returnCode_key" ON "ReturnRequest"("returnCode");
CREATE UNIQUE INDEX "ReturnRequest_idempotencyKey_key" ON "ReturnRequest"("idempotencyKey");
CREATE UNIQUE INDEX "ReturnRequest_activeKey_key" ON "ReturnRequest"("activeKey");
CREATE INDEX "ReturnRequest_reservationId_createdAt_idx" ON "ReturnRequest"("reservationId", "createdAt");
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");
CREATE UNIQUE INDEX "ReturnInspection_returnRequestId_rentalContractId_key" ON "ReturnInspection"("returnRequestId", "rentalContractId");
CREATE UNIQUE INDEX "ReturnInspection_returnRequestId_storageUnitId_key" ON "ReturnInspection"("returnRequestId", "storageUnitId");
CREATE INDEX "ReturnInspection_storageUnitId_result_idx" ON "ReturnInspection"("storageUnitId", "result");
CREATE INDEX "ReturnInspection_rentalContractId_idx" ON "ReturnInspection"("rentalContractId");

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_inspectionStartedById_fkey" FOREIGN KEY ("inspectionStartedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnInspection" ADD CONSTRAINT "ReturnInspection_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnInspection" ADD CONSTRAINT "ReturnInspection_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnInspection" ADD CONSTRAINT "ReturnInspection_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnInspection" ADD CONSTRAINT "ReturnInspection_inspectedByUserId_fkey" FOREIGN KEY ("inspectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
