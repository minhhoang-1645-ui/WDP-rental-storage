-- Nullable for historical movements whose original location cannot be proven.
ALTER TABLE "StockMovement" ADD COLUMN "storageUnitSnapshot" JSONB;
