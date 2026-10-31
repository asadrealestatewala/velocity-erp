-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN "deletionReason" TEXT,
ADD COLUMN "dataPurgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Tenant_deletionScheduledFor_idx" ON "Tenant"("deletionScheduledFor");
