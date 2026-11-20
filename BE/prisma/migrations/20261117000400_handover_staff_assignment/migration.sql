ALTER TABLE "HandoverAppointment"
  ADD COLUMN IF NOT EXISTS "assignedStaffUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "handoverReport" JSONB;

-- Some shared databases already have the assignee column from the older
-- operational_task_assignees migration. Preserve that column and its FK.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"HandoverAppointment"'::regclass AND conname = 'HandoverAppointment_assignedStaffUserId_fkey') THEN
    ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_assignedStaffUserId_fkey"
      FOREIGN KEY ("assignedStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "HandoverAppointment" ADD CONSTRAINT "HandoverAppointment_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "HandoverAppointment_assignedStaffUserId_status_scheduledAt_idx"
  ON "HandoverAppointment"("assignedStaffUserId", "status", "scheduledAt");
