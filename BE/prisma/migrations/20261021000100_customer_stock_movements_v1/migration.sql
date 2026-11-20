CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT');
CREATE TYPE "StockMovementStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "StoredItem" (
  "id" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "rentalContractId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoredItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredItem_balance_check" CHECK ("balance" >= 0)
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "movementCode" TEXT NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "status" "StockMovementStatus" NOT NULL DEFAULT 'REQUESTED',
  "customerUserId" TEXT NOT NULL,
  "rentalContractId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "note" TEXT,
  "assignedStaffUserId" TEXT,
  "assignedByUserId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "completionNote" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovementLine" (
  "id" TEXT NOT NULL,
  "stockMovementId" TEXT NOT NULL,
  "storedItemId" TEXT NOT NULL,
  "requestedQty" INTEGER NOT NULL,
  "actualQty" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockMovementLine_requestedQty_check" CHECK ("requestedQty" > 0),
  CONSTRAINT "StockMovementLine_actualQty_check" CHECK ("actualQty" IS NULL OR "actualQty" > 0)
);

CREATE UNIQUE INDEX "StoredItem_itemCode_key" ON "StoredItem"("itemCode");
CREATE INDEX "StoredItem_customerUserId_rentalContractId_name_idx" ON "StoredItem"("customerUserId", "rentalContractId", "name");
CREATE INDEX "StoredItem_rentalContractId_balance_idx" ON "StoredItem"("rentalContractId", "balance");
CREATE UNIQUE INDEX "StockMovement_movementCode_key" ON "StockMovement"("movementCode");
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");
CREATE INDEX "StockMovement_customerUserId_createdAt_idx" ON "StockMovement"("customerUserId", "createdAt");
CREATE INDEX "StockMovement_rentalContractId_createdAt_idx" ON "StockMovement"("rentalContractId", "createdAt");
CREATE INDEX "StockMovement_assignedStaffUserId_status_scheduledAt_idx" ON "StockMovement"("assignedStaffUserId", "status", "scheduledAt");
CREATE INDEX "StockMovement_status_scheduledAt_id_idx" ON "StockMovement"("status", "scheduledAt", "id");
CREATE UNIQUE INDEX "StockMovementLine_stockMovementId_storedItemId_key" ON "StockMovementLine"("stockMovementId", "storedItemId");
CREATE INDEX "StockMovementLine_storedItemId_createdAt_idx" ON "StockMovementLine"("storedItemId", "createdAt");

ALTER TABLE "StoredItem" ADD CONSTRAINT "StoredItem_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredItem" ADD CONSTRAINT "StoredItem_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "RentalContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_storedItemId_fkey" FOREIGN KEY ("storedItemId") REFERENCES "StoredItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
