-- Additive only. No reset, price rewrite, guessed historical backfill, or credentials.
ALTER TABLE "StockMovement"
 ADD COLUMN "storageUnitId" TEXT,
 ADD COLUMN "unitCodeSnapshot" TEXT,
 ADD COLUMN "floorSnapshot" TEXT,
 ADD COLUMN "zoneSnapshot" TEXT,
 ADD COLUMN "locationRecordedAt" TIMESTAMP(3);

CREATE TABLE "SigningChallenge" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "documentKey" TEXT NOT NULL,
 "binding" TEXT NOT NULL,
 "codeHash" TEXT NOT NULL,
 "recipient" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "deliveredAt" TIMESTAMP(3),
 "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SigningChallenge_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "SigningChallenge_userId_createdAt_idx" ON "SigningChallenge"("userId", "createdAt");
CREATE INDEX "SigningChallenge_documentKey_createdAt_idx" ON "SigningChallenge"("documentKey", "createdAt");
CREATE INDEX "SigningChallenge_expiresAt_idx" ON "SigningChallenge"("expiresAt");

CREATE TABLE "BusinessPolicy" (
 "key" TEXT NOT NULL PRIMARY KEY,
 "value" INTEGER NOT NULL,
 "updatedById" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TYPE "DamageClaimStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'APPROVED', 'REJECTED', 'RESOLVED');
CREATE TABLE "DamageClaim" (
 "id" TEXT PRIMARY KEY,
 "claimCode" TEXT NOT NULL UNIQUE,
 "customerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "rentalContractId" TEXT NOT NULL REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitCodeSnapshot" TEXT NOT NULL,
 "status" "DamageClaimStatus" NOT NULL DEFAULT 'REPORTED',
 "discoveredOn" DATE NOT NULL,
 "description" TEXT NOT NULL,
 "affectedItems" JSONB NOT NULL,
 "evidenceLinks" JSONB NOT NULL,
 "estimatedValue" BIGINT,
 "assignedStaffId" TEXT,
 "staffFacts" TEXT,
 "factsRecordedAt" TIMESTAMP(3),
 "reviewedById" TEXT,
 "decisionReason" TEXT,
 "decision" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "resolutionNote" TEXT,
 "resolvedAt" TIMESTAMP(3),
 "idempotencyKey" TEXT NOT NULL UNIQUE,
 "inputHash" TEXT NOT NULL,
 "history" JSONB NOT NULL DEFAULT '[]',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DamageClaim_estimatedValue_check" CHECK ("estimatedValue" IS NULL OR "estimatedValue" >= 0)
);
CREATE INDEX "DamageClaim_customerId_createdAt_idx" ON "DamageClaim"("customerId", "createdAt");
CREATE INDEX "DamageClaim_status_createdAt_idx" ON "DamageClaim"("status", "createdAt");
CREATE INDEX "DamageClaim_assignedStaffId_status_idx" ON "DamageClaim"("assignedStaffId", "status");
