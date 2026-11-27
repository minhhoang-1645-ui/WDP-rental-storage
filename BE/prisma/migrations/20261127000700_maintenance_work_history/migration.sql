ALTER TABLE "StaffEvidenceSubmission"
  ADD COLUMN "maintenanceSubmissionKey" TEXT,
  ADD COLUMN "maintenanceCostVnd" DECIMAL(18,0),
  ADD COLUMN "maintenanceCostLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "maintenanceRejectedAt" TIMESTAMP(3),
  ADD COLUMN "maintenanceRejectionReason" TEXT,
  ADD CONSTRAINT "StaffEvidenceSubmission_maintenance_fields_check" CHECK (
    ("maintenanceCostVnd" IS NULL OR ("maintenanceCostVnd" >= 0 AND "maintenanceCostVnd" <> 'NaN'::numeric))
    AND ("maintenanceRequestId" IS NOT NULL OR
      ("maintenanceSubmissionKey" IS NULL AND "maintenanceCostVnd" IS NULL AND cardinality("maintenanceCostLinks") = 0 AND "maintenanceRejectedAt" IS NULL))
    AND (("maintenanceRejectedAt" IS NULL AND "maintenanceRejectionReason" IS NULL) OR
      ("maintenanceRejectedAt" IS NOT NULL AND length(trim(coalesce("maintenanceRejectionReason", ''))) >= 3))
  );

CREATE UNIQUE INDEX "StaffEvidenceSubmission_maintenanceSubmissionKey_key"
  ON "StaffEvidenceSubmission" ("maintenanceSubmissionKey");

ALTER TABLE "MaintenanceRequest"
  ADD COLUMN "confirmedCostSubmissionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
