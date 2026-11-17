ALTER TABLE "TransferRequest" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "SupportRequest" ADD COLUMN "earlyReturnFinancialReview" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "voidReason" TEXT, ADD COLUMN "voidedAt" TIMESTAMP(3);
