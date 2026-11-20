CREATE TYPE "InvoiceType" AS ENUM ('INITIAL');
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH');

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceCode" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'INITIAL',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "rentalAmount" BIGINT NOT NULL,
    "depositAmount" BIGINT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "balanceDue" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceCode_key" ON "Invoice"("invoiceCode");
CREATE UNIQUE INDEX "Invoice_reservationId_type_key" ON "Invoice"("reservationId", "type");
CREATE INDEX "Invoice_status_issuedAt_idx" ON "Invoice"("status", "issuedAt");
CREATE UNIQUE INDEX "Payment_paymentCode_key" ON "Payment"("paymentCode");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_invoiceId_receivedAt_idx" ON "Payment"("invoiceId", "receivedAt");
CREATE INDEX "Payment_recordedByUserId_receivedAt_idx" ON "Payment"("recordedByUserId", "receivedAt");
CREATE INDEX "Payment_method_receivedAt_idx" ON "Payment"("method", "receivedAt");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
