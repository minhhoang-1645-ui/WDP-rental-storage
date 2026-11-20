-- No guessed units or quantity conversions for existing services.
ALTER TABLE "AdditionalService" ADD COLUMN "physicalUnit" TEXT;
