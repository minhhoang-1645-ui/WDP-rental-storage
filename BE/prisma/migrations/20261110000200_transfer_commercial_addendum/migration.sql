-- Preserve signed evidence and old invoice amounts; revisions get new rows.
ALTER TABLE "RentalContract" ADD COLUMN "currentMonthlyRate" BIGINT, ADD COLUMN "rateEffectiveFrom" DATE;
ALTER TABLE "TransferRequest"
 ADD COLUMN "commercialSnapshot" JSONB,
 ADD COLUMN "commercialSignedSnapshot" JSONB,
 ADD COLUMN "customerAcceptedAt" TIMESTAMP(3),
 ADD COLUMN "customerAcceptanceName" TEXT,
 ADD COLUMN "customerSignatureImage" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "storageTypeIdSnapshot" TEXT, ADD COLUMN "replacesInvoiceId" TEXT, ADD COLUMN "pricingSnapshot" JSONB;
CREATE UNIQUE INDEX "Invoice_replacesInvoiceId_key" ON "Invoice"("replacesInvoiceId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_replacesInvoiceId_fkey" FOREIGN KEY ("replacesInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
