ALTER TABLE "ReturnRequest" ADD COLUMN "inspectionScheduledAt" TIMESTAMP(3);
CREATE INDEX "ReturnRequest_inspectionScheduledAt_idx" ON "ReturnRequest"("inspectionScheduledAt");
