ALTER TYPE "ReturnStatus" ADD VALUE 'PENDING_SETTLEMENT';
ALTER TYPE "InvoiceType" ADD VALUE 'SETTLEMENT';

CREATE TYPE "InspectionIssueType" AS ENUM ('NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER');
CREATE TYPE "DepositSettlementStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'AWAITING_OUTSTANDING_PAYMENT', 'SETTLED');

ALTER TABLE "ReturnRequest"
  ADD COLUMN "physicallyReturnedAt" TIMESTAMP(3),
  ADD COLUMN "physicallyReturnedById" TEXT;

ALTER TABLE "ReturnInspection" ADD COLUMN "issueType" "InspectionIssueType";

CREATE TABLE "DepositSettlement" (
    "id" TEXT NOT NULL,
    "settlementCode" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "status" "DepositSettlementStatus" NOT NULL,
    "depositAmount" BIGINT NOT NULL,
    "totalApprovedCharges" BIGINT NOT NULL DEFAULT 0,
    "deductionAmount" BIGINT NOT NULL DEFAULT 0,
    "refundAmount" BIGINT NOT NULL DEFAULT 0,
    "outstandingAmount" BIGINT NOT NULL DEFAULT 0,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewIdempotencyKey" TEXT,
    "refundMethod" "PaymentMethod",
    "refundReference" TEXT,
    "refundNote" TEXT,
    "refundIdempotencyKey" TEXT,
    "refundedAt" TIMESTAMP(3),
    "settledByUserId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepositSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepositSettlement_amounts_check" CHECK ("depositAmount" >= 0 AND "totalApprovedCharges" >= 0 AND "deductionAmount" >= 0 AND "refundAmount" >= 0 AND "outstandingAmount" >= 0),
    CONSTRAINT "DepositSettlement_formula_check" CHECK (
      ("status" = 'PENDING_REVIEW' AND "totalApprovedCharges" = 0 AND "deductionAmount" = 0 AND "refundAmount" = 0 AND "outstandingAmount" = 0)
      OR
      ("status" <> 'PENDING_REVIEW' AND "deductionAmount" <= "depositAmount" AND "refundAmount" = "depositAmount" - "deductionAmount" AND "outstandingAmount" = GREATEST("totalApprovedCharges" - "depositAmount", 0))
    )
);

CREATE TABLE "DepositSettlementIssue" (
    "id" TEXT NOT NULL,
    "depositSettlementId" TEXT NOT NULL,
    "returnInspectionId" TEXT NOT NULL,
    "issueType" "InspectionIssueType" NOT NULL,
    "approvedChargeAmount" BIGINT NOT NULL,
    "reason" TEXT,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepositSettlementIssue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepositSettlementIssue_amount_check" CHECK ("approvedChargeAmount" >= 0),
    CONSTRAINT "DepositSettlementIssue_zero_charge_check" CHECK ("issueType" NOT IN ('NORMAL_WEAR', 'FACILITY_FAULT') OR "approvedChargeAmount" = 0),
    CONSTRAINT "DepositSettlementIssue_lost_key_check" CHECK ("issueType" <> 'LOST_KEY_OR_ACCESS_ITEM' OR "approvedChargeAmount" = 200000),
    CONSTRAINT "DepositSettlementIssue_other_reason_check" CHECK ("issueType" <> 'OTHER' OR LENGTH(TRIM("reason")) >= 3)
);

CREATE UNIQUE INDEX "DepositSettlement_settlementCode_key" ON "DepositSettlement"("settlementCode");
CREATE UNIQUE INDEX "DepositSettlement_returnRequestId_key" ON "DepositSettlement"("returnRequestId");
CREATE UNIQUE INDEX "DepositSettlement_reviewIdempotencyKey_key" ON "DepositSettlement"("reviewIdempotencyKey");
CREATE UNIQUE INDEX "DepositSettlement_refundIdempotencyKey_key" ON "DepositSettlement"("refundIdempotencyKey");
CREATE INDEX "DepositSettlement_status_createdAt_idx" ON "DepositSettlement"("status", "createdAt");
CREATE UNIQUE INDEX "DepositSettlementIssue_returnInspectionId_key" ON "DepositSettlementIssue"("returnInspectionId");
CREATE UNIQUE INDEX "DepositSettlementIssue_depositSettlementId_returnInspectionId_key" ON "DepositSettlementIssue"("depositSettlementId", "returnInspectionId");
CREATE INDEX "DepositSettlementIssue_depositSettlementId_issueType_idx" ON "DepositSettlementIssue"("depositSettlementId", "issueType");

ALTER TABLE "Invoice"
  ADD COLUMN "depositSettlementId" TEXT,
  ADD COLUMN "chargeAmount" BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Invoice_depositSettlementId_key" ON "Invoice"("depositSettlementId");
CREATE INDEX "Invoice_depositSettlementId_status_idx" ON "Invoice"("depositSettlementId", "status");

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_billing_cycle_type_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billing_cycle_type_check" CHECK (
  ("type" = 'INITIAL' AND "billingCycle" = 1 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'RECURRING' AND "billingCycle" >= 2 AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'RENEWAL' AND "billingCycle" IS NULL AND "renewalRequestId" IS NOT NULL AND "renewalCycle" >= 1 AND "depositSettlementId" IS NULL AND "chargeAmount" = 0)
  OR
  ("type" = 'SETTLEMENT' AND "billingCycle" IS NULL AND "renewalRequestId" IS NULL AND "renewalCycle" IS NULL AND "depositSettlementId" IS NOT NULL AND "rentalAmount" = 0 AND "depositAmount" = 0 AND "chargeAmount" > 0 AND "totalAmount" = "chargeAmount")
);

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_physicallyReturnedById_fkey" FOREIGN KEY ("physicallyReturnedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositSettlement" ADD CONSTRAINT "DepositSettlement_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositSettlement" ADD CONSTRAINT "DepositSettlement_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositSettlement" ADD CONSTRAINT "DepositSettlement_settledByUserId_fkey" FOREIGN KEY ("settledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositSettlementIssue" ADD CONSTRAINT "DepositSettlementIssue_depositSettlementId_fkey" FOREIGN KEY ("depositSettlementId") REFERENCES "DepositSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepositSettlementIssue" ADD CONSTRAINT "DepositSettlementIssue_returnInspectionId_fkey" FOREIGN KEY ("returnInspectionId") REFERENCES "ReturnInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositSettlementIssue" ADD CONSTRAINT "DepositSettlementIssue_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_depositSettlementId_fkey" FOREIGN KEY ("depositSettlementId") REFERENCES "DepositSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
