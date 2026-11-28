BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- Reviewed legacy record: TAPE (Băng keo đóng gói).
-- Confirmed ReservationService, three invoice snapshots and a signed contract
-- identify NESTBOX-DEMO. The other nine services have no ownership evidence.
-- Keep every service ID, stock quantity, price, snapshot and historical reference.
DO $ownership$
DECLARE
 service_id CONSTANT TEXT := 'cmwo3z9gp00075o95ec9etcci';
 expected_facility CONSTANT TEXT := 'cmwo3z97300005o95f54xsuor';
 current_facility TEXT;
 source RECORD;
 conflicting BOOLEAN;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "AdditionalService" WHERE id=service_id) THEN RETURN; END IF;
 SELECT "facilityId" INTO current_facility FROM "AdditionalService" WHERE id=service_id AND code='TAPE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Legacy service identity changed; ownership requires review'; END IF;
 IF current_facility IS NOT NULL AND current_facility<>expected_facility THEN
  RAISE EXCEPTION 'Legacy TAPE already belongs to another facility; do not overwrite ownership';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "Facility" WHERE id=expected_facility AND code='NESTBOX-DEMO') THEN
  RAISE EXCEPTION 'Expected facility identity changed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "ReservationService" rs JOIN "Reservation" r ON r.id=rs."reservationId"
  WHERE rs."additionalServiceId"=service_id AND r."facilityId"=expected_facility AND r.status='CONFIRMED') THEN
  RAISE EXCEPTION 'Confirmed usage evidence is no longer present';
 END IF;
 IF EXISTS (SELECT 1 FROM "ReservationService" rs JOIN "Reservation" r ON r.id=rs."reservationId"
  WHERE rs."additionalServiceId"=service_id AND r."facilityId"<>expected_facility)
 OR EXISTS (SELECT 1 FROM "GuestBookingService" gs JOIN "GuestBookingRequest" g ON g.id=gs."guestBookingRequestId"
  WHERE gs."additionalServiceId"=service_id AND g."facilityId"<>expected_facility) THEN
  RAISE EXCEPTION 'Cross-facility service usage found; shared ownership needs an explicit policy';
 END IF;
 -- Check historical snapshots, including references without a live service join row.
 FOR source IN
  SELECT table_name,column_name FROM information_schema.columns
  WHERE table_schema='public' AND data_type IN ('json','jsonb')
   AND table_name IN ('Reservation','GuestBookingRequest','Invoice','RentalContract','RenewalRequest','TransferRequest')
 LOOP
  IF source.table_name IN ('Reservation','GuestBookingRequest') THEN
   EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM %I owner WHERE owner."facilityId"<>$1 AND jsonb_path_exists(owner.%I::jsonb,''$.** ? (@ == $id || @ == $code)'',jsonb_build_object(''id'',$2,''code'',''TAPE''),true))',
    source.table_name,source.column_name)
   INTO conflicting USING expected_facility,service_id;
  ELSE
   EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM %I owner JOIN "Reservation" r ON r.id=owner."reservationId" WHERE r."facilityId"<>$1 AND jsonb_path_exists(owner.%I::jsonb,''$.** ? (@ == $id || @ == $code)'',jsonb_build_object(''id'',$2,''code'',''TAPE''),true))',
    source.table_name,source.column_name)
   INTO conflicting USING expected_facility,service_id;
  END IF;
  IF conflicting THEN RAISE EXCEPTION 'Cross-facility snapshot reference found in %.%',source.table_name,source.column_name; END IF;
 END LOOP;
 UPDATE "AdditionalService" SET "facilityId"=expected_facility
 WHERE id=service_id AND "facilityId" IS NULL;
END
$ownership$;
COMMIT;
