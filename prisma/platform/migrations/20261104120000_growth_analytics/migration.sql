-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "marketingOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DemoRequest" ADD COLUMN "handledAt" TIMESTAMP(3),
ADD COLUMN "handledBy" TEXT;

-- CreateTable
CREATE TABLE "TenantActivity" (
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "TenantActivity_pkey" PRIMARY KEY ("tenantId","day")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantActivity_day_idx" ON "TenantActivity"("day");

-- AddForeignKey
ALTER TABLE "TenantActivity" ADD CONSTRAINT "TenantActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
