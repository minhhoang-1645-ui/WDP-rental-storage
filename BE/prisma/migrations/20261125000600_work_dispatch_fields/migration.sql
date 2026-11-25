ALTER TABLE "MaintenanceRequest" ADD COLUMN "dispatchReadyAt" TIMESTAMP(3);
ALTER TABLE "SupportRequest" ADD COLUMN "customerWaitReason" TEXT;
CREATE INDEX "AuditEvent_dispatch_rotation_idx" ON "AuditEvent" (("metadata"->>'facilityId'), ("metadata"->>'assignedStaffUserId'), "createdAt" DESC)
WHERE "action" = 'TASK_ASSIGNMENT' AND "metadata"->>'source' = 'AUTO';
