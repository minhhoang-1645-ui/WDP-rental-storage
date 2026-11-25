ALTER TABLE "Facility" ADD COLUMN "serviceSchedule" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_service_schedule_array" CHECK (jsonb_typeof("serviceSchedule") = 'array');
