-- Retain the historical estimate and explanation values. Runtime cost rules
-- depend only on actual cost, confirmation author and confirmation time.
ALTER TABLE "MaintenanceRequest"
  DROP CONSTRAINT "MaintenanceRequest_cost_valid",
  ADD CONSTRAINT "MaintenanceRequest_cost_valid" CHECK (
    ("repairMethod" IS NULL OR "repairMethod" IN ('INTERNAL', 'EXTERNAL'))
    AND ("actualCostVnd" IS NULL OR ("actualCostVnd" >= 0 AND "actualCostVnd" <> 'NaN'::numeric))
    AND (("costConfirmedAt" IS NULL AND "costConfirmedByUserId" IS NULL) OR
      ("costConfirmedAt" IS NOT NULL AND "costConfirmedByUserId" IS NOT NULL AND "actualCostVnd" IS NOT NULL))
  );
