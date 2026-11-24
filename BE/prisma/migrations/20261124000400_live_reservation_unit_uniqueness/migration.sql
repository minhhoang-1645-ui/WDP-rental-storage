BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Released allocations remain linked to historical transfers and contracts.
-- Keep same-pair uniqueness for live rows and leave the period exclusion intact.
CREATE UNIQUE INDEX "ReservationUnit_live_reservation_storage_key"
ON "ReservationUnit" ("reservationId", "storageUnitId")
WHERE "releasedAt" IS NULL;

DROP INDEX "ReservationUnit_reservationId_storageUnitId_key";
COMMIT;
