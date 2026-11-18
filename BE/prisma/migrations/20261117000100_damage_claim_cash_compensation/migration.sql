CREATE TABLE "DamageClaimCompensation" (
  "damageClaimId" TEXT PRIMARY KEY REFERENCES "DamageClaim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approvedCompensationAmount" BIGINT NOT NULL CHECK ("approvedCompensationAmount" > 0),
  "approvalReason" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'CASH' CHECK ("method" = 'CASH'),
  "paidCompensationAmount" BIGINT,
  "deliveredBy" TEXT,
  "receivedBy" TEXT,
  "handedOverAt" TIMESTAMP(3),
  "handoverNote" TEXT,
  "recordedById" TEXT REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recordedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DamageClaimCompensation_handover_complete" CHECK (
    ("paidCompensationAmount" IS NULL AND "deliveredBy" IS NULL AND "receivedBy" IS NULL
      AND "handedOverAt" IS NULL AND "handoverNote" IS NULL AND "recordedById" IS NULL AND "recordedAt" IS NULL)
    OR ("paidCompensationAmount" IS NOT NULL AND "paidCompensationAmount" = "approvedCompensationAmount"
      AND "deliveredBy" IS NOT NULL AND "receivedBy" IS NOT NULL AND "handedOverAt" IS NOT NULL
      AND "recordedById" IS NOT NULL AND "recordedAt" IS NOT NULL
      AND "handedOverAt" >= "approvedAt" AND "handedOverAt" <= "recordedAt")
  )
);
