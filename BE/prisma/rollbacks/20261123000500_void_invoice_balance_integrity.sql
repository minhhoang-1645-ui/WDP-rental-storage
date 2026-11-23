BEGIN;
LOCK TABLE "Invoice" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Invoice" WHERE "amountPaid"+"balanceDue"<>"totalAmount") THEN
  RAISE EXCEPTION 'Rollback refused: retain the VOID-compatible Backend and constraint; do not rewrite invoice or payment history';
 END IF;
END $$;
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_nonnegative_balances";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_nonnegative_balances"
 CHECK ("totalAmount">=0 AND "amountPaid">=0 AND "balanceDue">=0 AND "amountPaid"+"balanceDue"="totalAmount" AND ("status"<>'PAID' OR "balanceDue"=0)) NOT VALID;
COMMIT;
