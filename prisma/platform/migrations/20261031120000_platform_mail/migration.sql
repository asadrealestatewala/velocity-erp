-- CreateEnum
CREATE TYPE "MailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MailDelivery" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'NOT_SENT');

-- CreateEnum
CREATE TYPE "MailInboxStatus" AS ENUM ('NEW', 'OPEN', 'RESOLVED', 'SPAM');

-- CreateTable
CREATE TABLE "MailMailbox" (
    "key" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "replyTo" TEXT,
    "signature" TEXT NOT NULL DEFAULT '',
    "receives" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailMailbox_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MailTemplate" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "ctaUrl" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "direction" "MailDirection" NOT NULL,
    "mailboxKey" TEXT NOT NULL,
    "category" TEXT,
    "templateKey" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "providerId" TEXT,
    "messageIdHeader" TEXT,
    "inReplyTo" TEXT,
    "threadKey" TEXT NOT NULL,
    "tenantId" TEXT,
    "delivery" "MailDelivery",
    "deliveryDetail" TEXT,
    "inboxStatus" "MailInboxStatus",
    "readAt" TIMESTAMP(3),
    "sentByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailMailbox_address_key" ON "MailMailbox"("address");

-- CreateIndex
CREATE INDEX "MailMessage_direction_mailboxKey_createdAt_idx" ON "MailMessage"("direction", "mailboxKey", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_threadKey_idx" ON "MailMessage"("threadKey");

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_idx" ON "MailMessage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_direction_providerId_key" ON "MailMessage"("direction", "providerId");

