CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');
CREATE TYPE "PaymentSubmissionMethod" AS ENUM ('BANK_TRANSFER');

CREATE TABLE "PaymentSubmission" (
  "id" TEXT NOT NULL,
  "submissionCode" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "method" "PaymentSubmissionMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "transferReference" TEXT,
  "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "customerNote" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "verifiedPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentSubmission_submissionCode_key" ON "PaymentSubmission"("submissionCode");
CREATE UNIQUE INDEX "PaymentSubmission_idempotencyKey_key" ON "PaymentSubmission"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentSubmission_verifiedPaymentId_key" ON "PaymentSubmission"("verifiedPaymentId");
CREATE INDEX "PaymentSubmission_invoiceId_status_submittedAt_idx" ON "PaymentSubmission"("invoiceId", "status", "submittedAt");
CREATE INDEX "PaymentSubmission_customerUserId_submittedAt_idx" ON "PaymentSubmission"("customerUserId", "submittedAt");
CREATE INDEX "PaymentSubmission_status_submittedAt_idx" ON "PaymentSubmission"("status", "submittedAt");

ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_verifiedPaymentId_fkey" FOREIGN KEY ("verifiedPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;