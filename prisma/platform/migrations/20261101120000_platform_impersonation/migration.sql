-- CreateTable
CREATE TABLE "PlatformImpersonation" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformImpersonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformImpersonation_adminId_idx" ON "PlatformImpersonation"("adminId");

-- CreateIndex
CREATE INDEX "PlatformImpersonation_tenantId_startedAt_idx" ON "PlatformImpersonation"("tenantId", "startedAt");
