BEGIN;
ALTER TABLE "AuthSession"
  ADD COLUMN "id" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT,
  ADD COLUMN "device" TEXT;

ALTER TABLE "AuthSession" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
UPDATE "AuthSession" SET "id" = gen_random_uuid()::text;
ALTER TABLE "AuthSession"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "AuthSession_id_key" ON "AuthSession"("id");
CREATE INDEX "AuthSession_userId_createdAt_id_idx" ON "AuthSession"("userId", "createdAt", "id");
COMMIT;
