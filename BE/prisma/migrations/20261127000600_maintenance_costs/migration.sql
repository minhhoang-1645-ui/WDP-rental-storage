ALTER TABLE "MaintenanceRequest"
  ADD COLUMN "surveyResult" TEXT,
  ADD COLUMN "repairMethod" TEXT,
  ADD COLUMN "repairPlan" TEXT,
  ADD COLUMN "estimatedCostVnd" DECIMAL(18,0),
  ADD COLUMN "actualCostVnd" DECIMAL(18,0),
  ADD COLUMN "costEvidenceLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "costVarianceReason" TEXT,
  ADD COLUMN "costConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "costConfirmedByUserId" TEXT,
  ADD CONSTRAINT "MaintenanceRequest_cost_confirmer_fkey" FOREIGN KEY ("costConfirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MaintenanceRequest_cost_valid" CHECK (
    ("repairMethod" IS NULL OR "repairMethod" IN ('INTERNAL', 'EXTERNAL'))
    AND ("estimatedCostVnd" IS NULL OR "estimatedCostVnd" >= 0)
    AND ("actualCostVnd" IS NULL OR "actualCostVnd" >= 0)
    AND (("costConfirmedAt" IS NULL AND "costConfirmedByUserId" IS NULL) OR
      ("costConfirmedAt" IS NOT NULL AND "costConfirmedByUserId" IS NOT NULL AND "actualCostVnd" IS NOT NULL AND
       ("estimatedCostVnd" IS NULL OR "actualCostVnd" <= "estimatedCostVnd" OR length(trim(coalesce("costVarianceReason", ''))) > 0)))
  );
