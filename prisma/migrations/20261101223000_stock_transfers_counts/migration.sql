-- Stock transfers between outlets and physical stock counts (audits).

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryReason" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "InventoryReason" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "InventoryReason" ADD VALUE 'COUNT_VARIANCE';

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "fromDealershipId" TEXT NOT NULL,
    "toDealershipId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "note" TEXT,
    "resolutionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "receivedById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bikeModelId" TEXT,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "title" TEXT,
    "note" TEXT,
    "startedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER,
    "note" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_number_key" ON "StockTransfer"("number");

-- CreateIndex
CREATE INDEX "StockTransfer_fromDealershipId_status_idx" ON "StockTransfer"("fromDealershipId", "status");

-- CreateIndex
CREATE INDEX "StockTransfer_toDealershipId_status_idx" ON "StockTransfer"("toDealershipId", "status");

-- CreateIndex
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_number_key" ON "StockCount"("number");

-- CreateIndex
CREATE INDEX "StockCount_dealershipId_status_idx" ON "StockCount"("dealershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_itemId_key" ON "StockCountLine"("countId", "itemId");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromDealershipId_fkey" FOREIGN KEY ("fromDealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toDealershipId_fkey" FOREIGN KEY ("toDealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A transfer line always moves a positive quantity.
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_quantity_positive" CHECK ("quantity" > 0);
