CREATE TYPE "AdditionalServiceBillingUnit" AS ENUM ('ONE_TIME', 'DAY', 'MONTH');

ALTER TABLE "AdditionalService"
ADD COLUMN "billingUnit" "AdditionalServiceBillingUnit";

UPDATE "AdditionalService"
SET "billingUnit" = CASE
  WHEN "kind" = 'PURCHASE' THEN 'ONE_TIME'::"AdditionalServiceBillingUnit"
  ELSE 'MONTH'::"AdditionalServiceBillingUnit"
END;

ALTER TABLE "AdditionalService"
ALTER COLUMN "billingUnit" SET NOT NULL;

ALTER TABLE "AdditionalService"
ADD CONSTRAINT "AdditionalService_kind_billingUnit_check"
CHECK (
  ("kind" = 'PURCHASE' AND "billingUnit" = 'ONE_TIME')
  OR ("kind" = 'RENTAL' AND "billingUnit" IN ('DAY', 'MONTH'))
);

ALTER TABLE "ReservationService"
ADD COLUMN "billingUnitSnapshot" "AdditionalServiceBillingUnit";

UPDATE "ReservationService"
SET "billingUnitSnapshot" = CASE
  WHEN "serviceKindSnapshot" = 'PURCHASE' THEN 'ONE_TIME'::"AdditionalServiceBillingUnit"
  ELSE 'MONTH'::"AdditionalServiceBillingUnit"
END;

ALTER TABLE "ReservationService"
ALTER COLUMN "billingUnitSnapshot" SET NOT NULL;
