ALTER TABLE "StockMovementLine" ADD COLUMN "customerPhotos" JSONB NOT NULL DEFAULT '[]'::jsonb;
