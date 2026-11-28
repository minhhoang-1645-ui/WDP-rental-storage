ALTER TABLE "AdditionalService" ADD COLUMN "minimumRentalMonths" INTEGER;
ALTER TABLE "AdditionalService" ADD CONSTRAINT "AdditionalService_minimumRentalMonths_check" CHECK ("minimumRentalMonths" IS NULL OR ("billingUnit" = 'MONTH' AND "minimumRentalMonths" >= 1));
