CREATE TYPE "AdditionalServiceKind" AS ENUM ('PURCHASE', 'RENTAL');
CREATE TABLE "AdditionalService" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "kind" "AdditionalServiceKind" NOT NULL, "unitPrice" BIGINT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdditionalService_pkey" PRIMARY KEY ("id"), CONSTRAINT "AdditionalService_unitPrice_positive" CHECK ("unitPrice" > 0)
);
CREATE TABLE "GuestBookingService" (
  "id" TEXT NOT NULL, "guestBookingRequestId" TEXT NOT NULL, "additionalServiceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL, "serviceStartDate" DATE, "serviceEndDate" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestBookingService_pkey" PRIMARY KEY ("id"), CONSTRAINT "GuestBookingService_quantity_positive" CHECK ("quantity" > 0)
);
CREATE TABLE "ReservationService" (
  "id" TEXT NOT NULL, "reservationId" TEXT NOT NULL, "additionalServiceId" TEXT NOT NULL,
  "serviceCodeSnapshot" TEXT NOT NULL, "serviceNameSnapshot" TEXT NOT NULL, "serviceKindSnapshot" "AdditionalServiceKind" NOT NULL,
  "unitPriceSnapshot" BIGINT NOT NULL, "quantity" INTEGER NOT NULL, "serviceStartDate" DATE, "serviceEndDate" DATE,
  "amountSnapshot" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservationService_pkey" PRIMARY KEY ("id"), CONSTRAINT "ReservationService_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "ReservationService_unitPrice_nonnegative" CHECK ("unitPriceSnapshot" >= 0), CONSTRAINT "ReservationService_amount_nonnegative" CHECK ("amountSnapshot" >= 0)
);
ALTER TABLE "Invoice" ADD COLUMN "serviceAmount" BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "AdditionalService_code_key" ON "AdditionalService"("code");
CREATE INDEX "AdditionalService_isActive_name_idx" ON "AdditionalService"("isActive", "name");
CREATE UNIQUE INDEX "GuestBookingService_guestBookingRequestId_additionalServiceId_key" ON "GuestBookingService"("guestBookingRequestId", "additionalServiceId");
CREATE INDEX "GuestBookingService_additionalServiceId_idx" ON "GuestBookingService"("additionalServiceId");
CREATE UNIQUE INDEX "ReservationService_reservationId_additionalServiceId_key" ON "ReservationService"("reservationId", "additionalServiceId");
CREATE INDEX "ReservationService_reservationId_createdAt_idx" ON "ReservationService"("reservationId", "createdAt");
CREATE INDEX "ReservationService_additionalServiceId_idx" ON "ReservationService"("additionalServiceId");
ALTER TABLE "GuestBookingService" ADD CONSTRAINT "GuestBookingService_guestBookingRequestId_fkey" FOREIGN KEY ("guestBookingRequestId") REFERENCES "GuestBookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestBookingService" ADD CONSTRAINT "GuestBookingService_additionalServiceId_fkey" FOREIGN KEY ("additionalServiceId") REFERENCES "AdditionalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationService" ADD CONSTRAINT "ReservationService_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationService" ADD CONSTRAINT "ReservationService_additionalServiceId_fkey" FOREIGN KEY ("additionalServiceId") REFERENCES "AdditionalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
