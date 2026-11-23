-- Data-preserving role rename. Review/backup required. No history tables are dropped.
-- Audit role snapshots become text FIRST, preserving the original evidence.
ALTER TABLE "AuditEvent" ALTER COLUMN "actorRole" TYPE TEXT USING "actorRole"::text;
DO $$
DECLARE item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['CUSTOMER','STORAGE_CUSTOMER'],['STAFF','FACILITY_STAFF'],
    ['MANAGER','FACILITY_MANAGER'],['ADMIN','SYSTEM_ADMINISTRATOR']
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole' AND e.enumlabel=item[1]) THEN
      EXECUTE format('ALTER TYPE "UserRole" RENAME VALUE %L TO %L', item[1], item[2]);
    END IF;
  END LOOP;
END $$;
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUSINESS_OPERATIONS_MANAGER';
