-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IN_STOCK', 'SOLD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('NOT_REGISTERED', 'APPLIED', 'REGISTERED');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "bikeModelId" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "engineNumber" TEXT,
    "color" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IN_STOCK',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "salesOrderId" TEXT,
    "ownerContactId" TEXT,
    "soldAt" TIMESTAMP(3),
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "plateNumber" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_chassisNumber_key" ON "Vehicle"("chassisNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_dealershipId_status_idx" ON "Vehicle"("dealershipId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_ownerContactId_idx" ON "Vehicle"("ownerContactId");

-- CreateIndex
CREATE INDEX "Vehicle_salesOrderId_idx" ON "Vehicle"("salesOrderId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_bikeModelId_fkey" FOREIGN KEY ("bikeModelId") REFERENCES "BikeModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
