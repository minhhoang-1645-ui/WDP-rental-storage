-- Additive foundation. No scopes are inferred or granted automatically.
ALTER TABLE "Facility"
 ADD COLUMN "bookingEnabled" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "operationalStatus" TEXT NOT NULL DEFAULT 'OPEN',
 ADD COLUMN "officeHours" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "accessHours" TEXT NOT NULL DEFAULT '';
CREATE TABLE "FacilityAccess" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "facilityId" TEXT NOT NULL,
 "activeKey" TEXT, "grantedById" TEXT NOT NULL, "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedById" TEXT, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "FacilityAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FacilityAccess_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FacilityAccess_activeKey_key" ON "FacilityAccess"("activeKey");
CREATE INDEX "FacilityAccess_userId_revokedAt_idx" ON "FacilityAccess"("userId","revokedAt");
CREATE TABLE "BusinessRule" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "facilityId" TEXT, "storageTypeId" TEXT,
 "version" INTEGER NOT NULL, "value" JSONB NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL,
 "effectiveTo" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BusinessRule_key_facilityId_storageTypeId_effectiveFrom_idx"
 ON "BusinessRule"("key","facilityId","storageTypeId","effectiveFrom");
