CREATE TABLE "AccountFlowToken" (
 "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "email" TEXT NOT NULL, "bookingCode" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
 "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AccountFlowToken_tokenHash_key" ON "AccountFlowToken"("tokenHash");
CREATE INDEX "AccountFlowToken_email_kind_createdAt_idx" ON "AccountFlowToken"("email", "kind", "createdAt");
CREATE TABLE "AccountFlowLimit" ("key" TEXT NOT NULL PRIMARY KEY, "bucket" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 0);
