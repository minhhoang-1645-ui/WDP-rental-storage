CREATE TYPE "GuestBookingStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'CLAIMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentProvider" AS ENUM ('VNPAY');
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED');
ALTER TYPE "PaymentMethod" ADD VALUE 'VNPAY';

CREATE TABLE "GuestBookingRequest" (
  "id" TEXT NOT NULL,
  "bookingCode" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "storageTypeId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "paymentPlan" "RenewalPaymentPlan" NOT NULL,
  "quoteSnapshot" JSONB NOT NULL,
  "availabilitySnapshot" JSONB NOT NULL,
  "status" "GuestBookingStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "emailVerifiedAt" TIMESTAMP(3),
  "claimedByUserId" TEXT,
  "reservationId" TEXT,
  "claimTokenHash" TEXT,
  "claimTokenExpiresAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestBookingRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnlinePaymentTransaction" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'VNPAY',
  "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" BIGINT NOT NULL,
  "merchantOrderRef" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "responseCode" TEXT,
  "bankCode" TEXT,
  "paidAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlinePaymentTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ALTER COLUMN "recordedByUserId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "onlinePaymentTransactionId" TEXT;

CREATE UNIQUE INDEX "GuestBookingRequest_bookingCode_key" ON "GuestBookingRequest"("bookingCode");
CREATE UNIQUE INDEX "GuestBookingRequest_reservationId_key" ON "GuestBookingRequest"("reservationId");
CREATE UNIQUE INDEX "GuestBookingRequest_claimTokenHash_key" ON "GuestBookingRequest"("claimTokenHash");
CREATE UNIQUE INDEX "GuestBookingRequest_idempotencyKey_key" ON "GuestBookingRequest"("idempotencyKey");
CREATE INDEX "GuestBookingRequest_email_status_idx" ON "GuestBookingRequest"("email", "status");
CREATE INDEX "GuestBookingRequest_status_createdAt_idx" ON "GuestBookingRequest"("status", "createdAt");
CREATE INDEX "GuestBookingRequest_storageTypeId_startDate_endDate_idx" ON "GuestBookingRequest"("storageTypeId", "startDate", "endDate");

CREATE UNIQUE INDEX "OnlinePaymentTransaction_merchantOrderRef_key" ON "OnlinePaymentTransaction"("merchantOrderRef");
CREATE UNIQUE INDEX "OnlinePaymentTransaction_providerTransactionId_key" ON "OnlinePaymentTransaction"("providerTransactionId");
CREATE UNIQUE INDEX "OnlinePaymentTransaction_idempotencyKey_key" ON "OnlinePaymentTransaction"("idempotencyKey");
CREATE INDEX "OnlinePaymentTransaction_invoiceId_status_createdAt_idx" ON "OnlinePaymentTransaction"("invoiceId", "status", "createdAt");
CREATE INDEX "OnlinePaymentTransaction_customerUserId_createdAt_idx" ON "OnlinePaymentTransaction"("customerUserId", "createdAt");
CREATE INDEX "OnlinePaymentTransaction_provider_status_createdAt_idx" ON "OnlinePaymentTransaction"("provider", "status", "createdAt");
CREATE UNIQUE INDEX "Payment_onlinePaymentTransactionId_key" ON "Payment"("onlinePaymentTransactionId");

ALTER TABLE "GuestBookingRequest" ADD CONSTRAINT "GuestBookingRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBookingRequest" ADD CONSTRAINT "GuestBookingRequest_storageTypeId_fkey" FOREIGN KEY ("storageTypeId") REFERENCES "StorageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBookingRequest" ADD CONSTRAINT "GuestBookingRequest_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBookingRequest" ADD CONSTRAINT "GuestBookingRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlinePaymentTransaction" ADD CONSTRAINT "OnlinePaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlinePaymentTransaction" ADD CONSTRAINT "OnlinePaymentTransaction_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_onlinePaymentTransactionId_fkey" FOREIGN KEY ("onlinePaymentTransactionId") REFERENCES "OnlinePaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
