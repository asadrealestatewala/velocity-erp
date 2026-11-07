-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "siteDomain" TEXT;
ALTER TABLE "Plan" ADD COLUMN "website" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_siteDomain_key" ON "Tenant"("siteDomain");

-- The Growth and Enterprise plans already advertise "Website and API access".
UPDATE "Plan" SET "website" = true WHERE "key" IN ('growth', 'enterprise');
