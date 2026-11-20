ALTER TABLE "ReturnRequest"
  ADD COLUMN "earlyReturnCloseout" JSONB,
  ADD COLUMN "rentRefundApprovedAt" TIMESTAMP(3),
  ADD COLUMN "rentRefundApprovedById" TEXT,
  ADD COLUMN "rentRefundedAt" TIMESTAMP(3),
  ADD COLUMN "rentRefundedById" TEXT,
  ADD COLUMN "rentRefundReference" TEXT;

CREATE UNIQUE INDEX "ReturnRequest_rentRefundReference_key" ON "ReturnRequest"("rentRefundReference");
