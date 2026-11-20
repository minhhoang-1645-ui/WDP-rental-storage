CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED');
CREATE TYPE "TransferReason" AS ENUM ('UNIT_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'OPERATIONAL_RELOCATION', 'OTHER');

ALTER TABLE "User"
  ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "TransferRequest" (
  "id" TEXT NOT NULL,
  "transferCode" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "rentalContractId" TEXT NOT NULL,
  "fromStorageUnitId" TEXT NOT NULL,
  "toStorageUnitId" TEXT,
  "fromReservationUnitId" TEXT NOT NULL,
  "toReservationUnitId" TEXT,
  "supportRequestId" TEXT,
  "reason" "TransferReason" NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "completedByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferRequest_transferCode_key" ON "TransferRequest"("transferCode");
CREATE UNIQUE INDEX "TransferRequest_toReservationUnitId_key" ON "TransferRequest"("toReservationUnitId");
CREATE UNIQUE INDEX "TransferRequest_idempotencyKey_key" ON "TransferRequest"("idempotencyKey");
CREATE UNIQUE INDEX "TransferRequest_active_contract_key" ON "TransferRequest"("rentalContractId") WHERE "status" IN ('REQUESTED', 'APPROVED');
CREATE INDEX "TransferRequest_status_createdAt_idx" ON "TransferRequest"("status", "createdAt");
CREATE INDEX "TransferRequest_reservationId_createdAt_idx" ON "TransferRequest"("reservationId", "createdAt");
CREATE INDEX "TransferRequest_fromStorageUnitId_status_idx" ON "TransferRequest"("fromStorageUnitId", "status");
CREATE INDEX "TransferRequest_toStorageUnitId_status_idx" ON "TransferRequest"("toStorageUnitId", "status");

ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_fromStorageUnitId_fkey" FOREIGN KEY ("fromStorageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_toStorageUnitId_fkey" FOREIGN KEY ("toStorageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_fromReservationUnitId_fkey" FOREIGN KEY ("fromReservationUnitId") REFERENCES "ReservationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_toReservationUnitId_fkey" FOREIGN KEY ("toReservationUnitId") REFERENCES "ReservationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
