-- Existing NULL contract IDs continue to represent original whole-reservation renewals.
ALTER TABLE "RenewalRequest" ADD COLUMN "rentalContractId" TEXT;

CREATE UNIQUE INDEX "RentalContract_id_reservationId_key" ON "RentalContract"("id", "reservationId");
CREATE INDEX "RenewalRequest_rentalContractId_status_idx" ON "RenewalRequest"("rentalContractId", "status");

ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_rentalContractId_reservationId_fkey"
  FOREIGN KEY ("rentalContractId", "reservationId") REFERENCES "RentalContract"("id", "reservationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
