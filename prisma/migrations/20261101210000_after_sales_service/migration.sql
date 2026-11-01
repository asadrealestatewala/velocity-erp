-- CreateEnum
CREATE TYPE "ServiceBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryReason" ADD VALUE 'SERVICE_USE';
ALTER TYPE "InventoryReason" ADD VALUE 'SERVICE_RETURN';

-- CreateTable
CREATE TABLE "ServiceBooking" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "contactId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "vehicleLabel" TEXT,
    "plateNumber" TEXT,
    "chassisNo" TEXT,
    "serviceType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ServiceBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "assignedUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCard" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "bookingId" TEXT,
    "contactId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "vehicleLabel" TEXT,
    "plateNumber" TEXT,
    "chassisNo" TEXT,
    "odometerKm" INTEGER,
    "complaint" TEXT NOT NULL,
    "diagnosis" TEXT,
    "workDone" TEXT,
    "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN',
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
    "technicianId" TEXT,
    "labourCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCardPart" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCardPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "jobCardPartId" TEXT,
    "contactId" TEXT,
    "customerName" TEXT NOT NULL,
    "vehicleLabel" TEXT,
    "plateNumber" TEXT,
    "chassisNo" TEXT,
    "failureDescription" TEXT NOT NULL,
    "claimAmount" DECIMAL(14,2) NOT NULL,
    "approvedAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_number_key" ON "ServiceBooking"("number");

-- CreateIndex
CREATE INDEX "ServiceBooking_dealershipId_status_scheduledAt_idx" ON "ServiceBooking"("dealershipId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_contactId_idx" ON "ServiceBooking"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_number_key" ON "JobCard"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_bookingId_key" ON "JobCard"("bookingId");

-- CreateIndex
CREATE INDEX "JobCard_dealershipId_status_openedAt_idx" ON "JobCard"("dealershipId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "JobCard_contactId_idx" ON "JobCard"("contactId");

-- CreateIndex
CREATE INDEX "JobCard_plateNumber_idx" ON "JobCard"("plateNumber");

-- CreateIndex
CREATE INDEX "JobCardPart_jobCardId_idx" ON "JobCardPart"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_number_key" ON "WarrantyClaim"("number");

-- CreateIndex
CREATE INDEX "WarrantyClaim_dealershipId_status_idx" ON "WarrantyClaim"("dealershipId", "status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_jobCardId_idx" ON "WarrantyClaim"("jobCardId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_submittedAt_idx" ON "WarrantyClaim"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardPart" ADD CONSTRAINT "JobCardPart_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardPart" ADD CONSTRAINT "JobCardPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_jobCardPartId_fkey" FOREIGN KEY ("jobCardPartId") REFERENCES "JobCardPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity checks (mirrors the pattern used by the sales-order tables)
ALTER TABLE "JobCardPart" ADD CONSTRAINT "JobCardPart_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_amounts_nonnegative" CHECK ("labourCharge" >= 0 AND "partsTotal" >= 0 AND "discount" >= 0 AND "total" >= 0);
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_amounts_nonnegative" CHECK ("claimAmount" >= 0 AND ("approvedAmount" IS NULL OR "approvedAmount" >= 0));
