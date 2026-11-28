CREATE TABLE "MaintenanceRepairAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL REFERENCES "StaffEvidenceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "MaintenanceRepairAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceRepairAttachment_content_check" CHECK (
      octet_length("bytes") BETWEEN 1 AND 5242880 AND
      (("kind" = 'PHOTO' AND "mimeType" IN ('image/jpeg', 'image/png', 'image/webp') AND "position" BETWEEN 0 AND 2)
       OR ("kind" = 'RECEIPT' AND "mimeType" IN ('image/jpeg', 'image/png', 'application/pdf') AND "position" BETWEEN 0 AND 4))
    )
);

CREATE UNIQUE INDEX "MaintenanceRepairAttachment_submission_kind_position_key"
    ON "MaintenanceRepairAttachment"("submissionId", "kind", "position");
