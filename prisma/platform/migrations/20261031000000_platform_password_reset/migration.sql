-- CreateTable
CREATE TABLE "PlatformPasswordReset" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPasswordReset_tokenHash_key" ON "PlatformPasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformPasswordReset_adminId_idx" ON "PlatformPasswordReset"("adminId");

-- AddForeignKey
ALTER TABLE "PlatformPasswordReset" ADD CONSTRAINT "PlatformPasswordReset_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
