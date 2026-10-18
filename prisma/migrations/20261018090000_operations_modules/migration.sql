-- CreateEnum
CREATE TYPE "InventoryReason" AS ENUM ('OPENING_STOCK', 'SALE', 'SALE_CANCELLED', 'PROCUREMENT_RECEIPT', 'ADJUSTMENT', 'RETURN', 'DAMAGE');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('NOT_DISPATCHED', 'PACKING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('POSTED', 'PENDING_VERIFICATION', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('EXPENSE', 'PAYMENT_TO_YADEA');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoucherDocKind" AS ENUM ('PROOF_OF_PAYMENT', 'PROOF_OF_INVOICE', 'INVOICE', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "DealerDocCategory" AS ENUM ('REGISTRATION_CERTIFICATE', 'BUSINESS_LICENSE', 'TAX_REGISTRATION', 'AGREEMENT', 'ACHIEVEMENT_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocSource" AS ENUM ('DEALERSHIP', 'YADEA');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'LOGGED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "AssistantActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'ORDER_CONFIRMED';
ALTER TYPE "ActivityType" ADD VALUE 'ORDER_CANCELLED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "dealershipId" TEXT;

-- AlterTable
ALTER TABLE "BikeModel" ADD COLUMN     "dealerPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNormalized" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "price" DECIMAL(12,2),
    "dealerPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "imageFileId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSeedExample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "bikeModelId" TEXT,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" "InventoryReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "customerName" TEXT,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bikeModelId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "dispatchStatus" "DispatchStatus" NOT NULL DEFAULT 'NOT_DISPATCHED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dealerNotes" TEXT,
    "internalNotes" TEXT,
    "expectedDeliveryDate" DATE,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "courier" TEXT,
    "trackingNumber" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "rejectionReason" TEXT,
    "invoiceEntryId" TEXT,
    "requestedById" TEXT NOT NULL,
    "handledById" TEXT,
    "receivedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bikeModelId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProcurementOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "ProcurementStatus",
    "toStatus" "ProcurementStatus" NOT NULL,
    "dispatchStatus" "DispatchStatus",
    "note" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "method" "PaymentMethod",
    "orderId" TEXT,
    "voucherId" TEXT,
    "rejectionReason" TEXT,
    "recordedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseVoucher" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "kind" "VoucherKind" NOT NULL DEFAULT 'EXPENSE',
    "voucherDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "payee" TEXT,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "method" "PaymentMethod",
    "reference" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherAttachment" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "VoucherDocKind" NOT NULL,
    "label" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealershipDocument" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "category" "DealerDocCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileId" TEXT NOT NULL,
    "source" "DocSource" NOT NULL,
    "expiresAt" DATE,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealershipDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "leadId" TEXT,
    "dealershipId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "address" TEXT,
    "externalId" TEXT,
    "error" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "AssistantActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_isActive_category_idx" ON "Product"("isActive", "category");

-- CreateIndex
CREATE INDEX "InventoryItem_dealershipId_idx" ON "InventoryItem"("dealershipId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_dealershipId_bikeModelId_key" ON "InventoryItem"("dealershipId", "bikeModelId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_dealershipId_productId_key" ON "InventoryItem"("dealershipId", "productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_dealershipId_createdAt_idx" ON "InventoryMovement"("dealershipId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_refType_refId_idx" ON "InventoryMovement"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_number_key" ON "SalesOrder"("number");

-- CreateIndex
CREATE INDEX "SalesOrder_dealershipId_status_orderDate_idx" ON "SalesOrder"("dealershipId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_contactId_idx" ON "SalesOrder"("contactId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_orderId_idx" ON "SalesOrderLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementOrder_number_key" ON "ProcurementOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementOrder_invoiceEntryId_key" ON "ProcurementOrder"("invoiceEntryId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_dealershipId_status_idx" ON "ProcurementOrder"("dealershipId", "status");

-- CreateIndex
CREATE INDEX "ProcurementOrder_status_submittedAt_idx" ON "ProcurementOrder"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ProcurementOrder_dispatchStatus_idx" ON "ProcurementOrder"("dispatchStatus");

-- CreateIndex
CREATE INDEX "ProcurementOrderLine_orderId_idx" ON "ProcurementOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ProcurementStatusHistory_orderId_createdAt_idx" ON "ProcurementStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_number_key" ON "LedgerEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_voucherId_key" ON "LedgerEntry"("voucherId");

-- CreateIndex
CREATE INDEX "LedgerEntry_dealershipId_entryDate_idx" ON "LedgerEntry"("dealershipId", "entryDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_status_idx" ON "LedgerEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseVoucher_number_key" ON "ExpenseVoucher"("number");

-- CreateIndex
CREATE INDEX "ExpenseVoucher_dealershipId_voucherDate_idx" ON "ExpenseVoucher"("dealershipId", "voucherDate");

-- CreateIndex
CREATE INDEX "ExpenseVoucher_status_idx" ON "ExpenseVoucher"("status");

-- CreateIndex
CREATE INDEX "VoucherAttachment_voucherId_idx" ON "VoucherAttachment"("voucherId");

-- CreateIndex
CREATE INDEX "DealershipDocument_dealershipId_category_idx" ON "DealershipDocument"("dealershipId", "category");

-- CreateIndex
CREATE INDEX "Message_contactId_createdAt_idx" ON "Message"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_externalId_key" ON "Message"("channel", "externalId");

-- CreateIndex
CREATE INDEX "AssistantAction_userId_status_idx" ON "AssistantAction"("userId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_dealershipId_createdAt_idx" ON "AuditLog"("dealershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNormalized_key" ON "User"("phoneNormalized");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_bikeModelId_fkey" FOREIGN KEY ("bikeModelId") REFERENCES "BikeModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_bikeModelId_fkey" FOREIGN KEY ("bikeModelId") REFERENCES "BikeModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_invoiceEntryId_fkey" FOREIGN KEY ("invoiceEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_bikeModelId_fkey" FOREIGN KEY ("bikeModelId") REFERENCES "BikeModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementStatusHistory" ADD CONSTRAINT "ProcurementStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementStatusHistory" ADD CONSTRAINT "ProcurementStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "ExpenseVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherAttachment" ADD CONSTRAINT "VoucherAttachment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "ExpenseVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherAttachment" ADD CONSTRAINT "VoucherAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherAttachment" ADD CONSTRAINT "VoucherAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealershipDocument" ADD CONSTRAINT "DealershipDocument_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealershipDocument" ADD CONSTRAINT "DealershipDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealershipDocument" ADD CONSTRAINT "DealershipDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAction" ADD CONSTRAINT "AssistantAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────────────────────── Hand-written additions ─────────────────────────────
-- Integrity rules Prisma cannot express. They back up the application-level checks, so a bug can never
-- produce negative stock or a malformed ledger row.

-- A stock row is for exactly one thing (a bike model OR a spare part) and can never be negative.
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_exactly_one_item" CHECK (("bikeModelId" IS NULL) <> ("productId" IS NULL));
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_reorder_nonnegative" CHECK ("reorderLevel" >= 0);

-- Order lines reference exactly one bike model or spare part, with a positive quantity.
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_exactly_one_item" CHECK (("bikeModelId" IS NULL) <> ("productId" IS NULL));
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_exactly_one_item" CHECK (("bikeModelId" IS NULL) <> ("productId" IS NULL));
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_received_within_ordered" CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantity");

-- A ledger entry is either a debit or a credit — never both, never negative.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amounts_valid" CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0));

-- Backfill the dealership on existing audit entries so each dealership's audit log is complete:
-- 1) actions performed by a dealership user belong to that user's dealership
UPDATE "AuditLog" a
SET "dealershipId" = m."dealershipId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "dealershipId"
  FROM "DealershipMembership"
  WHERE "isActive" = true
  ORDER BY "userId", "createdAt"
) m
WHERE a."userId" = m."userId" AND a."dealershipId" IS NULL;

-- 2) actions on a Dealership record (by anyone) belong to that dealership
UPDATE "AuditLog" a
SET "dealershipId" = a."entityId"
WHERE a."entityType" = 'Dealership'
  AND a."dealershipId" IS NULL
  AND EXISTS (SELECT 1 FROM "Dealership" d WHERE d."id" = a."entityId");
