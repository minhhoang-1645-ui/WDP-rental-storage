BEGIN;

CREATE TYPE "IncidentRentalImpact" AS ENUM ('NO_IMPACT', 'AFFECTED', 'UNKNOWN');
ALTER TABLE "MaintenanceRequest" ADD COLUMN "rentalImpact" "IncidentRentalImpact",
  ADD COLUMN "reportedAffectedUnitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StorageUnit" ADD COLUMN "bookingSafetyVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "IncidentUnitBlock" (
  "id" TEXT PRIMARY KEY,
  "maintenanceRequestId" TEXT NOT NULL REFERENCES "MaintenanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storageUnitId" TEXT NOT NULL REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3)
);
CREATE INDEX "IncidentUnitBlock_storageUnitId_releasedAt_idx" ON "IncidentUnitBlock"("storageUnitId", "releasedAt");
CREATE INDEX "IncidentUnitBlock_maintenanceRequestId_releasedAt_idx" ON "IncidentUnitBlock"("maintenanceRequestId", "releasedAt");
CREATE UNIQUE INDEX "IncidentUnitBlock_one_live_block_per_incident_unit"
  ON "IncidentUnitBlock"("maintenanceRequestId", "storageUnitId") WHERE "releasedAt" IS NULL;

-- Prevent any allocation writer from bypassing a new incident hold. Existing allocations
-- may still be released or amended in place as part of the existing rental lifecycle.
CREATE FUNCTION reject_incident_blocked_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."releasedAt" IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."storageUnitId" = OLD."storageUnitId" AND OLD."releasedAt" IS NULL THEN RETURN NEW; END IF;
  END IF;
  PERFORM 1 FROM "StorageUnit" WHERE "id" = NEW."storageUnitId" FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "IncidentUnitBlock" WHERE "storageUnitId" = NEW."storageUnitId" AND "releasedAt" IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ReservationUnit_incident_booking_hold',
      MESSAGE = 'The storage unit is temporarily unavailable for booking.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReservationUnit_incident_booking_hold"
BEFORE INSERT OR UPDATE OF "storageUnitId", "releasedAt" ON "ReservationUnit"
FOR EACH ROW EXECUTE FUNCTION reject_incident_blocked_allocation();

COMMIT;
