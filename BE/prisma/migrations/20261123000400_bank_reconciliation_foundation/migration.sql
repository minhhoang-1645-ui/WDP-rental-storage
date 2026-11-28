BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- Reuse the existing reconciliation ledger for verified late bank receipts; no financial history is replaced.
ALTER TABLE "OnlinePaymentReconciliation" ALTER COLUMN "onlinePaymentTransactionId" DROP NOT NULL;
ALTER TABLE "OnlinePaymentReconciliation" ADD COLUMN "paymentSubmissionId" TEXT, ADD COLUMN "externalReferenceKey" TEXT;
CREATE UNIQUE INDEX "OnlinePaymentReconciliation_paymentSubmissionId_key" ON "OnlinePaymentReconciliation"("paymentSubmissionId");
CREATE UNIQUE INDEX "OnlinePaymentReconciliation_externalReferenceKey_key" ON "OnlinePaymentReconciliation"("externalReferenceKey");
ALTER TABLE "OnlinePaymentReconciliation" ADD CONSTRAINT "OnlinePaymentReconciliation_paymentSubmissionId_fkey" FOREIGN KEY ("paymentSubmissionId") REFERENCES "PaymentSubmission"("id") ON DELETE RESTRICT;
ALTER TABLE "OnlinePaymentReconciliation" ADD CONSTRAINT "OnlinePaymentReconciliation_one_source" CHECK (num_nonnulls("onlinePaymentTransactionId","paymentSubmissionId")=1) NOT VALID;
COMMIT;
