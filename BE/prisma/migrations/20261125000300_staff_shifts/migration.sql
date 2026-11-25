CREATE TYPE "StaffShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'ON_LEAVE', 'ABSENT');

CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "StaffShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "reason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffShift_valid_range" CHECK ("startsAt" < "endsAt"),
    CONSTRAINT "StaffShift_valid_attendance" CHECK (
        ("checkedInAt" IS NULL OR ("checkedInAt" >= "startsAt" AND "checkedInAt" < "endsAt"))
        AND ("checkedOutAt" IS NULL OR ("checkedInAt" IS NOT NULL AND "checkedOutAt" >= "checkedInAt"))
    ),
    CONSTRAINT "StaffShift_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StaffShift_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StaffShift_facilityId_startsAt_idx" ON "StaffShift"("facilityId", "startsAt");
CREATE INDEX "StaffShift_staffUserId_status_startsAt_idx" ON "StaffShift"("staffUserId", "status", "startsAt");
