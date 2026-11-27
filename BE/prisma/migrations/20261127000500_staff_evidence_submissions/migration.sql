CREATE TABLE "StaffEvidenceSubmission" (
  "id" TEXT PRIMARY KEY,
  "returnInspectionId" TEXT REFERENCES "ReturnInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "maintenanceRequestId" TEXT REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "staffUserId" TEXT NOT NULL,
  "staffName" TEXT NOT NULL,
  "note" TEXT,
  "photos" JSONB NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffEvidenceSubmission_one_parent" CHECK (num_nonnulls("returnInspectionId", "maintenanceRequestId") = 1)
);

CREATE INDEX "StaffEvidenceSubmission_returnInspectionId_staffUserId_idx"
  ON "StaffEvidenceSubmission"("returnInspectionId", "staffUserId");
CREATE INDEX "StaffEvidenceSubmission_maintenanceRequestId_staffUserId_idx"
  ON "StaffEvidenceSubmission"("maintenanceRequestId", "staffUserId");

INSERT INTO "StaffEvidenceSubmission" ("id", "returnInspectionId", "staffUserId", "staffName", "note", "photos", "recordedAt")
SELECT 'return-' || inspection."id", inspection."id", staff."id", staff."fullName",
       inspection."conditionNote", COALESCE(inspection."inspectionPhotos", '[]'::jsonb), inspection."inspectedAt"
FROM "ReturnInspection" inspection
JOIN "User" staff ON staff."id" = inspection."inspectedByUserId"
WHERE inspection."inspectedAt" IS NOT NULL
  AND (inspection."inspectionPhotos" <> '[]'::jsonb OR inspection."conditionNote" LIKE '%https://%');

INSERT INTO "StaffEvidenceSubmission" ("id", "maintenanceRequestId", "staffUserId", "staffName", "note", "photos", "recordedAt")
SELECT 'maintenance-' || maintenance."id", maintenance."id", event."actorId", event."actorName",
       maintenance."workNote", COALESCE(maintenance."workPhotos", '[]'::jsonb), maintenance."workCompletedAt"
FROM "MaintenanceRequest" maintenance
JOIN LATERAL (
  SELECT "actorId", "actorName"
  FROM "AuditEvent"
  WHERE "resource" = 'maintenance' AND "resourceId" = maintenance."id"
    AND "action" = 'TASK_STAFF_COMPLETED' AND "actorId" IS NOT NULL AND "actorName" IS NOT NULL
  ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
) event ON true
WHERE maintenance."workCompletedAt" IS NOT NULL
  AND (maintenance."workPhotos" <> '[]'::jsonb OR maintenance."workNote" LIKE '%https://%');
