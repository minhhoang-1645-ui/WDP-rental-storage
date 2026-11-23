BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- VOID cancels the collectible balance, not historical receipts or the original invoice amount.
-- Do not rewrite previously applied migrations, Payments, refunds or existing invoice amounts.
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_nonnegative_balances";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_nonnegative_balances"
 CHECK (
  "totalAmount">=0 AND "amountPaid">=0 AND "balanceDue">=0
  AND (
   ("status"='VOID' AND "balanceDue"=0 AND "amountPaid"<="totalAmount")
   OR ("status"<>'VOID' AND "amountPaid"+"balanceDue"="totalAmount")
  )
  AND ("status"<>'PAID' OR "balanceDue"=0)
 ) NOT VALID;
COMMIT;
