CREATE TYPE "AuditCategory" AS ENUM ('LOGIN', 'ACTIVITY');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "actorId" VARCHAR(120),
    "actorName" VARCHAR(120),
    "actorEmail" VARCHAR(254),
    "actorRole" "UserRole",
    "resource" VARCHAR(60) NOT NULL,
    "resourceId" VARCHAR(120),
    "method" VARCHAR(10) NOT NULL,
    "route" VARCHAR(250) NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditEvent_category_createdAt_id_idx" ON "AuditEvent"("category", "createdAt", "id");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_resource_createdAt_idx" ON "AuditEvent"("resource", "createdAt");
