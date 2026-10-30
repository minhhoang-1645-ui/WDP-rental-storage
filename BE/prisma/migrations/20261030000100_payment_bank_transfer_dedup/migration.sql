-- New BANK_TRANSFER records carry a server-derived receiving-account scope and
-- a reconciled bank transaction reference. Legacy Payments remain untouched.
ALTER TABLE "Payment"
  ADD COLUMN "bankDestinationKey" TEXT,
  ADD COLUMN "bankTransactionReference" TEXT;

CREATE UNIQUE INDEX "Payment_bankDestinationKey_bankTransactionReference_key"
  ON "Payment"("bankDestinationKey", "bankTransactionReference");
