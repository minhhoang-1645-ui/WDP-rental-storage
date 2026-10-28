ALTER TABLE "RentalContract" ADD COLUMN "signedSnapshot" JSONB, ADD COLUMN "signatureImage" TEXT;
ALTER TABLE "RenewalRequest" ADD COLUMN "appendixSignatureImage" TEXT;

-- Existing approved renewals need a reviewable draft; never mark it as accepted.
UPDATE "RenewalRequest" r
SET "appendixCode" = r."renewalCode" || '-PL01',
    "appendixVersion" = 'WDP-RENEWAL-APPENDIX-V1',
    "appendixSnapshot" = jsonb_build_object(
      'version', 'WDP-RENEWAL-APPENDIX-V1', 'renewalCode', r."renewalCode",
      'reservationReference', s."reservationCode", 'previousEndDate', to_char(r."previousEndDate", 'YYYY-MM-DD'),
      'requestedEndDate', to_char(r."requestedEndDate", 'YYYY-MM-DD'), 'termMonths', r."termMonths",
      'paymentPlan', r."paymentPlan"::text, 'quote', r."quoteSnapshot",
      'contracts', COALESCE((SELECT jsonb_agg(jsonb_build_object('contractCode', c."contractCode", 'unitCode', u."unitNumber") ORDER BY c."contractCode") FROM "RentalContract" c JOIN "ReservationUnit" ru ON ru."id" = c."reservationUnitId" JOIN "StorageUnit" u ON u."id" = ru."storageUnitId" WHERE c."reservationId" = r."reservationId"), '[]'::jsonb))
FROM "Reservation" s
WHERE s."id" = r."reservationId" AND r."status" = 'APPROVED_PENDING_PAYMENT' AND r."appendixCode" IS NULL;
