-- Stop writers before rolling back. Never delete bank reconciliation history.
BEGIN;
LOCK TABLE "OnlinePaymentReconciliation" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "OnlinePaymentReconciliation" WHERE "onlinePaymentTransactionId" IS NULL OR "paymentSubmissionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback refused: bank reconciliation history requires the compatible Backend and nullable source';
  END IF;
END $$;
ALTER TABLE "OnlinePaymentReconciliation" ALTER COLUMN "onlinePaymentTransactionId" SET NOT NULL;
-- Retain the additive columns, references and indexes for historical compatibility.
COMMIT;
