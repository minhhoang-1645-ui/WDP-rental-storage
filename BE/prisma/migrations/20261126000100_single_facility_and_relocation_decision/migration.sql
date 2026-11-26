BEGIN;
LOCK TABLE "FacilityAccess" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "FacilityAccess" a JOIN "User" u ON u.id = a."userId"
    WHERE a."revokedAt" IS NULL AND u.role NOT IN ('FACILITY_STAFF', 'FACILITY_MANAGER')
  ) THEN
    RAISE EXCEPTION 'FacilityAccess contains active grants for roles other than Staff/Manager';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "FacilityAccess" WHERE "revokedAt" IS NULL
    GROUP BY "userId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve multiple active FacilityAccess grants before applying this migration';
  END IF;
END $$;
CREATE UNIQUE INDEX "FacilityAccess_one_active_per_user" ON "FacilityAccess" ("userId") WHERE "revokedAt" IS NULL;
ALTER TABLE "TransferRequest" ADD COLUMN "destinationDecision" JSONB;
COMMIT;
