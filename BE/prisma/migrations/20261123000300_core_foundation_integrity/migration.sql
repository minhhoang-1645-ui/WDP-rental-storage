BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- Additive foundation migration. Never resets records or removes legacy assignment history.
-- Preflight failures require explicit reconciliation; do not delete conflicting records.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "HandoverAppointment" ADD COLUMN "handoverLeadDays" INTEGER;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_lead_days_check"
 CHECK ("handoverLeadDays" IS NULL OR "handoverLeadDays" BETWEEN 0 AND 7) NOT VALID;
ALTER TABLE "AuditEvent" ADD COLUMN "metadata" JSONB;

CREATE UNIQUE INDEX "FacilityAccess_one_active_grant" ON "FacilityAccess" ("userId","facilityId") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "BusinessRule_scope_version" ON "BusinessRule" ("key","facilityId","storageTypeId","version") NULLS NOT DISTINCT;
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_storageTypeId_fkey" FOREIGN KEY ("storageTypeId") REFERENCES "StorageType"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_scope_dates_check"
 CHECK ("version">0 AND ("effectiveTo" IS NULL OR "effectiveTo">"effectiveFrom") AND ("storageTypeId" IS NULL OR "facilityId" IS NOT NULL)) NOT VALID;
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_no_overlapping_versions"
 EXCLUDE USING gist ("key" WITH =, (COALESCE("facilityId",'')) WITH =, (COALESCE("storageTypeId",'')) WITH =, tsrange("effectiveFrom","effectiveTo",'[)') WITH &&);
ALTER TABLE "ReservationUnit" ADD CONSTRAINT "ReservationUnit_valid_period"
 CHECK ("plannedStartDate"<"plannedEndDate") NOT VALID;
ALTER TABLE "ReservationUnit" ADD CONSTRAINT "ReservationUnit_no_overlapping_allocations"
 EXCLUDE USING gist ("storageUnitId" WITH =, daterange("plannedStartDate","plannedEndDate",'[)') WITH &&) WHERE ("releasedAt" IS NULL);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_nonnegative_balances"
 CHECK ("totalAmount">=0 AND "amountPaid">=0 AND "balanceDue">=0 AND (("status"='VOID' AND "balanceDue"=0 AND "amountPaid"<="totalAmount") OR ("status"<>'VOID' AND "amountPaid"+"balanceDue"="totalAmount")) AND ("status"<>'PAID' OR "balanceDue"=0)) NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK ("amount">0) NOT VALID;

ALTER TABLE "AdditionalService" ADD COLUMN "facilityId" TEXT;
ALTER TABLE "AdditionalService" ADD CONSTRAINT "AdditionalService_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT NOT VALID;
CREATE INDEX "AdditionalService_facilityId_idx" ON "AdditionalService"("facilityId");
COMMIT;
