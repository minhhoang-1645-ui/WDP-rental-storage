CREATE TYPE "AdditionalServiceFulfillmentStatus" AS ENUM ('RESERVED', 'FULFILLED', 'RELEASED');

CREATE TABLE "AdditionalServiceInventory" (
  "id" TEXT NOT NULL,
  "additionalServiceId" TEXT NOT NULL,
  "stockOnHand" INTEGER,
  "rentalCapacity" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdditionalServiceInventory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalServiceInventory_additionalServiceId_key" UNIQUE ("additionalServiceId"),
  CONSTRAINT "AdditionalServiceInventory_additionalServiceId_fkey" FOREIGN KEY ("additionalServiceId") REFERENCES "AdditionalService"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdditionalServiceInventory_shape_check" CHECK (("stockOnHand" IS NOT NULL AND "stockOnHand" >= 0 AND "rentalCapacity" IS NULL) OR ("rentalCapacity" IS NOT NULL AND "rentalCapacity" >= 0 AND "stockOnHand" IS NULL))
);

ALTER TABLE "ReservationService" ADD COLUMN "fulfillmentStatus" "AdditionalServiceFulfillmentStatus";

UPDATE "ReservationService"
SET "fulfillmentStatus" = 'RESERVED'::"AdditionalServiceFulfillmentStatus"
WHERE "serviceKindSnapshot" = 'PURCHASE' AND "reservationId" IN (SELECT "id" FROM "Reservation" WHERE "status" = 'CONFIRMED');
