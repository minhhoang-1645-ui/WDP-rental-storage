BEGIN;
ALTER TABLE "Facility"
  ADD COLUMN "closurePlanId" TEXT,
  ADD COLUMN "closureMode" TEXT,
  ADD COLUMN "closureReason" TEXT,
  ADD COLUMN "closureStartedAt" TIMESTAMP(3),
  ADD COLUMN "closureExpectedAt" DATE,
  ADD COLUMN "closureStartedById" TEXT,
  ADD CONSTRAINT "Facility_closureMode_check" CHECK ("closureMode" IS NULL OR "closureMode" IN ('CONTRACT_EXPIRY', 'REQUIRED_RELOCATION'));
ALTER TABLE "TransferRequest"
  ADD COLUMN "closurePlanId" TEXT,
  ADD COLUMN "receivingStaffId" TEXT,
  ADD COLUMN "consentEvidence" JSONB,
  ADD COLUMN "sourceHandover" JSONB,
  ADD COLUMN "destinationHandover" JSONB,
  ADD COLUMN "relocationException" TEXT,
  ADD COLUMN "safetyEvidence" JSONB;
CREATE INDEX "TransferRequest_closurePlanId_status_idx" ON "TransferRequest" ("closurePlanId", "status");
CREATE INDEX "TransferRequest_receivingStaffId_status_idx" ON "TransferRequest" ("receivingStaffId", "status");
ALTER TABLE "SupportRequest" ADD COLUMN "closurePlanId" TEXT;
CREATE INDEX "SupportRequest_closurePlanId_rentalContractId_idx" ON "SupportRequest" ("closurePlanId", "rentalContractId");
ALTER TABLE "Invoice" ADD COLUMN "facilityIdSnapshot" TEXT REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Invoice_facilityIdSnapshot_idx" ON "Invoice" ("facilityIdSnapshot");
ALTER TABLE "ReservationService" ADD COLUMN "serviceFacilityId" TEXT REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ReservationService_serviceFacilityId_additionalServiceId_idx" ON "ReservationService" ("serviceFacilityId", "additionalServiceId");
ALTER TABLE "TransferRequest" ADD COLUMN "serviceHandling" JSONB;
COMMIT;
