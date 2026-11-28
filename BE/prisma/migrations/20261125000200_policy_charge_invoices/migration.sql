BEGIN;

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_billing_cycle_type_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billing_cycle_type_check" CHECK (
  ("type" = 'INITIAL' AND "billingCycle" = 1 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'RECURRING' AND "billingCycle" >= 2 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'RENEWAL' AND "billingCycle" IS NULL AND "renewalRequestId" IS NOT NULL AND "renewalCycle" >= 1 AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'SETTLEMENT' AND "billingCycle" IS NULL AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL
    AND "rentalAmount" = 0 AND "depositAmount" = 0 AND "chargeAmount" > 0 AND "totalAmount" = "chargeAmount"
    AND ("depositSettlementId" IS NOT NULL OR COALESCE(
      "serviceAmount" = 0 AND (
        ("pricingSnapshot"->>'adjustment' = 'PAYMENT_OVERDUE' AND length("pricingSnapshot"->>'sourceInvoiceId') > 0)
        OR ("pricingSnapshot"->>'adjustment' = 'PERIOD_CLOSEOUT_V1' AND length("pricingSnapshot"->>'returnRequestId') > 0
          AND length("pricingSnapshot"->>'rentalContractId') > 0)
      ), FALSE)))
);

CREATE UNIQUE INDEX "Invoice_overdue_source_key" ON "Invoice" (("pricingSnapshot"->>'sourceInvoiceId'))
  WHERE "type" = 'SETTLEMENT' AND "depositSettlementId" IS NULL AND "pricingSnapshot"->>'adjustment' = 'PAYMENT_OVERDUE';
CREATE UNIQUE INDEX "Invoice_early_return_source_key" ON "Invoice" (("pricingSnapshot"->>'returnRequestId'))
  WHERE "type" = 'SETTLEMENT' AND "depositSettlementId" IS NULL AND "pricingSnapshot"->>'adjustment' = 'PERIOD_CLOSEOUT_V1';

COMMIT;
