ALTER TYPE "PaymentMethod" ADD VALUE 'PAYOS';
ALTER TYPE "PaymentProvider" ADD VALUE 'PAYOS';

ALTER TABLE "OnlinePaymentTransaction"
  ADD COLUMN "payosOrderCode" BIGINT,
  ADD COLUMN "payosLinkId" TEXT,
  ADD COLUMN "checkoutUrl" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "providerCheckedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "OnlinePaymentTransaction_payosOrderCode_key" ON "OnlinePaymentTransaction"("payosOrderCode");
CREATE UNIQUE INDEX "OnlinePaymentTransaction_payosLinkId_key" ON "OnlinePaymentTransaction"("payosLinkId");

CREATE TABLE "PayosReceipt" (
  "id" TEXT PRIMARY KEY,
  "orderCode" BIGINT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "transactionId" TEXT REFERENCES "OnlinePaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayosReceipt_reference_key" ON "PayosReceipt"("reference");
CREATE INDEX "PayosReceipt_transactionId_idx" ON "PayosReceipt"("transactionId");
ALTER TABLE "OnlinePaymentReconciliation" ADD COLUMN "payosReceiptId" TEXT REFERENCES "PayosReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "OnlinePaymentReconciliation_payosReceiptId_key" ON "OnlinePaymentReconciliation"("payosReceiptId");
ALTER TABLE "OnlinePaymentReconciliation" DROP CONSTRAINT "OnlinePaymentReconciliation_one_source";
ALTER TABLE "OnlinePaymentReconciliation" ADD CONSTRAINT "OnlinePaymentReconciliation_one_source"
  CHECK (num_nonnulls("onlinePaymentTransactionId", "paymentSubmissionId", "payosReceiptId") = 1);
