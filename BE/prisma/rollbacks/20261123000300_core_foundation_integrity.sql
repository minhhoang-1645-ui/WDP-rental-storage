-- Manual rollback of added guards only. Preserve all rows and both new history/snapshot columns.
BEGIN;
ALTER TABLE "BusinessRule" DROP CONSTRAINT IF EXISTS "BusinessRule_no_overlapping_versions", DROP CONSTRAINT IF EXISTS "BusinessRule_scope_dates_check", DROP CONSTRAINT IF EXISTS "BusinessRule_facilityId_fkey", DROP CONSTRAINT IF EXISTS "BusinessRule_storageTypeId_fkey";
ALTER TABLE "ReservationUnit" DROP CONSTRAINT IF EXISTS "ReservationUnit_no_overlapping_allocations", DROP CONSTRAINT IF EXISTS "ReservationUnit_valid_period";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_nonnegative_balances";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_positive_amount";
ALTER TABLE "HandoverAppointment" DROP CONSTRAINT IF EXISTS "HandoverAppointment_lead_days_check";
DROP INDEX IF EXISTS "FacilityAccess_one_active_grant";
DROP INDEX IF EXISTS "BusinessRule_scope_version";
COMMIT;
