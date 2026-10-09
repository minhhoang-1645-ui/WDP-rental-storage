CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "HandoverAppointment" (
    "id" TEXT NOT NULL,
    "appointmentCode" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "completedByUserId" TEXT,
    "note" TEXT,
    "handoverNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "activeKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HandoverAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HandoverAppointment_appointmentCode_key" ON "HandoverAppointment"("appointmentCode");
CREATE UNIQUE INDEX "HandoverAppointment_activeKey_key" ON "HandoverAppointment"("activeKey");
CREATE UNIQUE INDEX "HandoverAppointment_idempotencyKey_key" ON "HandoverAppointment"("idempotencyKey");
CREATE INDEX "HandoverAppointment_reservationId_createdAt_idx" ON "HandoverAppointment"("reservationId", "createdAt");
CREATE INDEX "HandoverAppointment_status_scheduledAt_idx" ON "HandoverAppointment"("status", "scheduledAt");
CREATE INDEX "HandoverAppointment_scheduledAt_id_idx" ON "HandoverAppointment"("scheduledAt", "id");

ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
