-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "StorageCondition" AS ENUM ('STANDARD', 'AIR_CONDITIONED');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('AVAILABLE', 'LIMITED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "PeriodMode" AS ENUM ('DURATION', 'CUSTOM_DATES');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING_CONTACT', 'CONTACTED', 'IN_REVIEW', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageType" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "sizeName" TEXT NOT NULL,
    "kicker" TEXT NOT NULL,
    "condition" "StorageCondition" NOT NULL,
    "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'AVAILABLE',
    "widthCm" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "roomEquivalent" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "boxCount" TEXT NOT NULL,
    "suitableItems" JSONB NOT NULL,
    "image" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "monthlyRate" DECIMAL(12,2),
    "depositMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUnit" (
    "id" TEXT NOT NULL,
    "storageTypeId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "floor" TEXT,
    "zone" TEXT,
    "row" INTEGER,
    "position" INTEGER,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInquiry" (
    "id" TEXT NOT NULL,
    "inquiryCode" TEXT NOT NULL,
    "lookupTokenHash" TEXT NOT NULL,
    "customerId" TEXT,
    "facilityId" TEXT NOT NULL,
    "storageTypeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "periodMode" "PeriodMode" NOT NULL,
    "durationMonths" INTEGER,
    "adjacentPreference" BOOLEAN NOT NULL DEFAULT false,
    "availabilitySnapshot" JSONB NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING_CONTACT',
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "processedById" TEXT,
    "contactedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "reservationCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "storageTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "periodMode" "PeriodMode" NOT NULL,
    "durationMonths" INTEGER,
    "adjacentPreference" BOOLEAN NOT NULL DEFAULT false,
    "availabilitySnapshot" JSONB NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "quotedAmount" DECIMAL(12,2),
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationUnit" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "storageUnitId" TEXT NOT NULL,
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE NOT NULL,
    "actualVacatedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StorageType_code_key" ON "StorageType"("code");

-- CreateIndex
CREATE INDEX "StorageType_facilityId_sizeId_condition_idx" ON "StorageType"("facilityId", "sizeId", "condition");

-- CreateIndex
CREATE UNIQUE INDEX "StorageUnit_unitNumber_key" ON "StorageUnit"("unitNumber");

-- CreateIndex
CREATE INDEX "StorageUnit_storageTypeId_status_idx" ON "StorageUnit"("storageTypeId", "status");

-- CreateIndex
CREATE INDEX "StorageUnit_storageTypeId_row_position_idx" ON "StorageUnit"("storageTypeId", "row", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ContactInquiry_inquiryCode_key" ON "ContactInquiry"("inquiryCode");

-- CreateIndex
CREATE UNIQUE INDEX "ContactInquiry_idempotencyKey_key" ON "ContactInquiry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ContactInquiry_status_createdAt_idx" ON "ContactInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactInquiry_email_idx" ON "ContactInquiry"("email");

-- CreateIndex
CREATE INDEX "ContactInquiry_customerId_idx" ON "ContactInquiry"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reservationCode_key" ON "Reservation"("reservationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_idempotencyKey_key" ON "Reservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Reservation_customerId_createdAt_idx" ON "Reservation"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_storageTypeId_status_startDate_endDate_idx" ON "Reservation"("storageTypeId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "ReservationUnit_storageUnitId_plannedStartDate_plannedEndDa_idx" ON "ReservationUnit"("storageUnitId", "plannedStartDate", "plannedEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationUnit_reservationId_storageUnitId_key" ON "ReservationUnit"("reservationId", "storageUnitId");

-- AddForeignKey
ALTER TABLE "StorageType" ADD CONSTRAINT "StorageType_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageUnit" ADD CONSTRAINT "StorageUnit_storageTypeId_fkey" FOREIGN KEY ("storageTypeId") REFERENCES "StorageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_storageTypeId_fkey" FOREIGN KEY ("storageTypeId") REFERENCES "StorageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storageTypeId_fkey" FOREIGN KEY ("storageTypeId") REFERENCES "StorageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationUnit" ADD CONSTRAINT "ReservationUnit_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationUnit" ADD CONSTRAINT "ReservationUnit_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
