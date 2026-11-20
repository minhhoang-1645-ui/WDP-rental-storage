ALTER TABLE "ReturnRequest" ADD COLUMN "assignedStaffUserId" TEXT;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ReturnRequest_assignedStaffUserId_status_idx" ON "ReturnRequest"("assignedStaffUserId", "status");
UPDATE "ReturnRequest" AS task
SET "assignedStaffUserId" = actor."id"
FROM "User" AS actor
WHERE actor."role" = 'STAFF' AND actor."id" = COALESCE(task."physicallyReturnedById", task."inspectionStartedById");

ALTER TABLE "HandoverAppointment" ADD COLUMN "assignedStaffUserId" TEXT;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "HandoverAppointment_assignedStaffUserId_status_idx" ON "HandoverAppointment"("assignedStaffUserId", "status");
UPDATE "HandoverAppointment" AS task
SET "assignedStaffUserId" = actor."id"
FROM "User" AS actor
WHERE actor."role" = 'STAFF' AND actor."id" = COALESCE(task."completedByUserId", task."confirmedByUserId");

ALTER TABLE "TransferRequest" ADD COLUMN "assignedStaffUserId" TEXT;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_assignedStaffUserId_fkey" FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TransferRequest_assignedStaffUserId_status_idx" ON "TransferRequest"("assignedStaffUserId", "status");
UPDATE "TransferRequest" AS task
SET "assignedStaffUserId" = actor."id"
FROM "User" AS actor
WHERE actor."role" = 'STAFF' AND actor."id" = task."completedByUserId";
