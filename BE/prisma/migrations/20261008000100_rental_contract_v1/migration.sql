CREATE TYPE "ContractStatus" AS ENUM ('PENDING_PAYMENT', 'READY_FOR_HANDOVER', 'ACTIVE', 'COMPLETED');

CREATE TABLE "RentalContract" (
    "id" TEXT NOT NULL,
    "contractCode" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "reservationUnitId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RentalContract_contractCode_key" ON "RentalContract"("contractCode");
CREATE UNIQUE INDEX "RentalContract_reservationUnitId_key" ON "RentalContract"("reservationUnitId");
CREATE INDEX "RentalContract_reservationId_status_idx" ON "RentalContract"("reservationId", "status");
CREATE INDEX "RentalContract_status_createdAt_idx" ON "RentalContract"("status", "createdAt");

ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_reservationUnitId_fkey" FOREIGN KEY ("reservationUnitId") REFERENCES "ReservationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
