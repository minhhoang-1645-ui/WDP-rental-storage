ALTER TABLE "StorageType"
ADD COLUMN "minRentalDays" INTEGER,
ADD COLUMN "allowDailyRental" BOOLEAN NOT NULL DEFAULT false;

UPDATE "StorageType"
SET "monthlyRate" = CASE "code"
  WHEN 'LK-A01' THEN 650000
  WHEN 'SM-B12' THEN 1500000
  WHEN 'SM-C08' THEN 1900000
  WHEN 'MD-D04' THEN 2900000
  WHEN 'MD-E06' THEN 3600000
  WHEN 'LG-F02' THEN 5500000
  ELSE "monthlyRate"
END,
"minRentalDays" = CASE "code"
  WHEN 'LK-A01' THEN 1
  WHEN 'SM-B12' THEN 7
  WHEN 'SM-C08' THEN 7
  ELSE NULL
END,
"allowDailyRental" = CASE "code"
  WHEN 'LK-A01' THEN true
  WHEN 'SM-B12' THEN true
  WHEN 'SM-C08' THEN true
  ELSE false
END
WHERE "code" IN ('LK-A01', 'SM-B12', 'SM-C08', 'MD-D04', 'MD-E06', 'LG-F02');

ALTER TABLE "StorageType"
ADD CONSTRAINT "StorageType_minRentalDays_check"
CHECK ("minRentalDays" IS NULL OR "minRentalDays" >= 1);
