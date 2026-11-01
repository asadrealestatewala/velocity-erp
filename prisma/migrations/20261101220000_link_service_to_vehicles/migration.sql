-- AlterTable
ALTER TABLE "ServiceBooking" ADD COLUMN "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN "vehicleId" TEXT;

-- Backfill: link existing rows whose chassis number matches a vehicle in the same dealership.
UPDATE "ServiceBooking" b SET "vehicleId" = v."id" FROM "Vehicle" v
  WHERE b."chassisNo" IS NOT NULL AND v."chassisNumber" = upper(regexp_replace(b."chassisNo", '\s', '', 'g')) AND v."dealershipId" = b."dealershipId";
UPDATE "JobCard" j SET "vehicleId" = v."id" FROM "Vehicle" v
  WHERE j."chassisNo" IS NOT NULL AND v."chassisNumber" = upper(regexp_replace(j."chassisNo", '\s', '', 'g')) AND v."dealershipId" = j."dealershipId";

-- CreateIndex
CREATE INDEX "ServiceBooking_vehicleId_idx" ON "ServiceBooking"("vehicleId");
CREATE INDEX "JobCard_vehicleId_idx" ON "JobCard"("vehicleId");

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
