-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('CONSOLE', 'MAIL', 'APP');

-- CreateEnum
CREATE TYPE "TicketMessageKind" AS ENUM ('CUSTOMER', 'STAFF', 'NOTE');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "tenantId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "source" "TicketSource" NOT NULL DEFAULT 'CONSOLE',
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "mailThreadKey" TEXT,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "TicketMessageKind" NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_createdAt_idx" ON "SupportTicket"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_mailThreadKey_idx" ON "SupportTicket"("mailThreadKey");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_at_idx" ON "TicketMessage"("ticketId", "at");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
