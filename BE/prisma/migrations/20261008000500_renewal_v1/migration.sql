ALTER TYPE "InvoiceType" ADD VALUE 'RENEWAL';

CREATE TYPE "RenewalStatus" AS ENUM ('PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED');
CREATE TYPE "RenewalPaymentPlan" AS ENUM ('PAY_MONTHLY', 'PREPAID');

CREATE TABLE "RenewalRequest" (
    "id" TEXT NOT NULL,
    "renewalCode" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'PENDING',
    "previousEndDate" DATE NOT NULL,
    "requestedEndDate" DATE NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "paymentPlan" "RenewalPaymentPlan" NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "activeKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RenewalRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RenewalRequest_term_months_check" CHECK ("termMonths" >= 1),
    CONSTRAINT "RenewalRequest_date_range_check" CHECK ("requestedEndDate" > "previousEndDate")
);

CREATE UNIQUE INDEX "RenewalRequest_renewalCode_key" ON "RenewalRequest"("renewalCode");
CREATE UNIQUE INDEX "RenewalRequest_activeKey_key" ON "RenewalRequest"("activeKey");
CREATE UNIQUE INDEX "RenewalRequest_idempotencyKey_key" ON "RenewalRequest"("idempotencyKey");
CREATE INDEX "RenewalRequest_reservationId_createdAt_idx" ON "RenewalRequest"("reservationId", "createdAt");
CREATE INDEX "RenewalRequest_status_createdAt_idx" ON "RenewalRequest"("status", "createdAt");

ALTER TABLE "Invoice" ALTER COLUMN "billingCycle" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "renewalRequestId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "renewalCycle" INTEGER;

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_billing_cycle_type_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billing_cycle_type_check" CHECK (
  ("type" = 'INITIAL' AND "billingCycle" = 1 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL)
  OR
  ("type" = 'RECURRING' AND "billingCycle" >= 2 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL)
  OR
  ("type" = 'RENEWAL' AND "billingCycle" IS NULL AND "renewalRequestId" IS NOT NULL AND "renewalCycle" >= 1)
);

CREATE UNIQUE INDEX "Invoice_renewalRequestId_renewalCycle_key" ON "Invoice"("renewalRequestId", "renewalCycle");
CREATE INDEX "Invoice_renewalRequestId_status_idx" ON "Invoice"("renewalRequestId", "status");

ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_renewalRequestId_fkey" FOREIGN KEY ("renewalRequestId") REFERENCES "RenewalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
