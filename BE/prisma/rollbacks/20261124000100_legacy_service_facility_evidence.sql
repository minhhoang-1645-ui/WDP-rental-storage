BEGIN;
-- For a coordinated rollback only; never delete dependent rows or snapshots.
DO $rollback$
DECLARE applied TIMESTAMPTZ;
BEGIN
 SELECT finished_at INTO applied FROM "_prisma_migrations"
 WHERE migration_name='20261124000100_legacy_service_facility_evidence' AND rolled_back_at IS NULL;
 IF applied IS NULL THEN RAISE EXCEPTION 'Cannot establish ownership backfill boundary'; END IF;
 IF EXISTS (SELECT 1 FROM "ReservationService" WHERE "additionalServiceId"='cmwo3z9gp00075o95ec9etcci' AND "createdAt" AT TIME ZONE 'UTC'>=applied)
 OR EXISTS (SELECT 1 FROM "GuestBookingService" WHERE "additionalServiceId"='cmwo3z9gp00075o95ec9etcci' AND "createdAt" AT TIME ZONE 'UTC'>=applied) THEN
  RAISE EXCEPTION 'New service usage exists; rollback requires a separate business review';
 END IF;
 UPDATE "AdditionalService" SET "facilityId"=NULL
 WHERE id='cmwo3z9gp00075o95ec9etcci' AND code='TAPE' AND "facilityId"='cmwo3z97300005o95f54xsuor';
END
$rollback$;
COMMIT;
