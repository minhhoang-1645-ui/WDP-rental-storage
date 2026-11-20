ALTER TYPE "InvoiceType" ADD VALUE 'RECURRING';

ALTER TABLE "Invoice"
ADD COLUMN "billingCycle" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "billingPeriodStart" DATE,
ADD COLUMN "billingPeriodEnd" DATE,
ADD COLUMN "dueAt" DATE;

DROP INDEX "Invoice_reservationId_type_key";

CREATE UNIQUE INDEX "Invoice_reservationId_billingCycle_key" ON "Invoice"("reservationId", "billingCycle");
CREATE INDEX "Invoice_type_dueAt_idx" ON "Invoice"("type", "dueAt");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_billing_cycle_type_check"
CHECK (
  ("type" = 'INITIAL' AND "billingCycle" = 1)
  OR
  ("type" = 'RECURRING' AND "billingCycle" >= 2)
);
