-- Customer contract acceptance, renewal appendices, and late VNPay reconciliation.
CREATE TYPE "OnlinePaymentReconciliationStatus" AS ENUM ('PENDING_REVIEW', 'REFUND_REQUIRED', 'RECONCILED');

ALTER TABLE "RentalContract"
  ADD COLUMN "termsVersion" TEXT NOT NULL DEFAULT 'WDP-STORAGE-V1',
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsAcceptedByUserId" TEXT,
  ADD COLUMN "acceptanceName" TEXT,
  ADD COLUMN "acceptanceNote" TEXT;

ALTER TABLE "RenewalRequest"
  ADD COLUMN "appendixCode" TEXT,
  ADD COLUMN "appendixVersion" TEXT,
  ADD COLUMN "appendixSnapshot" JSONB,
  ADD COLUMN "appendixAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "appendixAcceptedByUserId" TEXT,
  ADD COLUMN "appendixAcceptanceName" TEXT;

CREATE UNIQUE INDEX "RenewalRequest_appendixCode_key" ON "RenewalRequest"("appendixCode");
CREATE INDEX "RentalContract_termsAcceptedByUserId_termsAcceptedAt_idx" ON "RentalContract"("termsAcceptedByUserId", "termsAcceptedAt");
CREATE INDEX "RenewalRequest_appendixAcceptedByUserId_appendixAcceptedAt_idx" ON "RenewalRequest"("appendixAcceptedByUserId", "appendixAcceptedAt");

ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_termsAcceptedByUserId_fkey"
  FOREIGN KEY ("termsAcceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_appendixAcceptedByUserId_fkey"
  FOREIGN KEY ("appendixAcceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OnlinePaymentReconciliation" (
  "id" TEXT NOT NULL,
  "reconciliationCode" TEXT NOT NULL,
  "onlinePaymentTransactionId" TEXT NOT NULL,
  "status" "OnlinePaymentReconciliationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reason" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "amount" BIGINT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlinePaymentReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnlinePaymentReconciliation_reconciliationCode_key" ON "OnlinePaymentReconciliation"("reconciliationCode");
CREATE UNIQUE INDEX "OnlinePaymentReconciliation_onlinePaymentTransactionId_key" ON "OnlinePaymentReconciliation"("onlinePaymentTransactionId");
CREATE INDEX "OnlinePaymentReconciliation_status_createdAt_idx" ON "OnlinePaymentReconciliation"("status", "createdAt");
CREATE INDEX "OnlinePaymentReconciliation_reviewedByUserId_reviewedAt_idx" ON "OnlinePaymentReconciliation"("reviewedByUserId", "reviewedAt");
ALTER TABLE "OnlinePaymentReconciliation" ADD CONSTRAINT "OnlinePaymentReconciliation_onlinePaymentTransactionId_fkey"
  FOREIGN KEY ("onlinePaymentTransactionId") REFERENCES "OnlinePaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlinePaymentReconciliation" ADD CONSTRAINT "OnlinePaymentReconciliation_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
