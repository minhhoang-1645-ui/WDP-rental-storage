ALTER TYPE "MaintenanceCategory" ADD VALUE 'ACCESS_CREDENTIAL';
ALTER TYPE "MaintenanceCategory" ADD VALUE 'UTILITIES';
ALTER TYPE "MaintenanceCategory" ADD VALUE 'SECURITY';
ALTER TYPE "MaintenancePriority" ADD VALUE 'URGENT';

ALTER TABLE "MaintenanceRequest"
  DROP CONSTRAINT "MaintenanceRequest_active_state_check",
  DROP CONSTRAINT "MaintenanceRequest_source_link_check",
  ALTER COLUMN "storageUnitId" DROP NOT NULL,
  ADD COLUMN "commonAreaFacilityId" TEXT,
  ADD COLUMN "commonArea" TEXT,
  ADD COLUMN "locationNote" TEXT,
  ADD CONSTRAINT "MaintenanceRequest_commonAreaFacilityId_fkey"
    FOREIGN KEY ("commonAreaFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MaintenanceRequest_active_state_check" CHECK (
    ("status" = 'COMPLETED' AND "activeKey" IS NULL)
    OR ("status" <> 'COMPLETED' AND ("source" = 'MANUAL' OR "activeKey" IS NOT NULL))
  ),
  ADD CONSTRAINT "MaintenanceRequest_source_link_check" CHECK (
    ("source" = 'RETURN_INSPECTION' AND "returnInspectionId" IS NOT NULL AND "storageUnitId" IS NOT NULL)
    OR ("source" = 'MANUAL' AND ("returnInspectionId" IS NULL OR "storageUnitId" IS NOT NULL))
  ),
  ADD CONSTRAINT "MaintenanceRequest_location_check" CHECK (
    ("storageUnitId" IS NOT NULL AND "commonAreaFacilityId" IS NULL AND "commonArea" IS NULL AND "locationNote" IS NULL)
    OR ("storageUnitId" IS NULL AND "commonAreaFacilityId" IS NOT NULL AND "commonArea" IS NOT NULL
      AND "commonArea" IN ('CORRIDOR', 'ENTRANCE', 'SECURITY', 'UTILITIES', 'OTHER')
      AND "source" = 'MANUAL' AND "activeKey" IS NULL)
  );

CREATE INDEX "MaintenanceRequest_commonAreaFacilityId_createdAt_idx" ON "MaintenanceRequest"("commonAreaFacilityId", "createdAt");

CREATE TABLE "MaintenancePhoto" (
  "id" TEXT PRIMARY KEY,
  "maintenanceRequestId" TEXT NOT NULL REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "mimeType" TEXT NOT NULL CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
  "bytes" BYTEA NOT NULL CHECK (octet_length("bytes") BETWEEN 1 AND 5242880),
  "digest" TEXT NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 4)
);
CREATE UNIQUE INDEX "MaintenancePhoto_maintenanceRequestId_position_key" ON "MaintenancePhoto"("maintenanceRequestId", "position");
