-- AlterTable (existing refunds are numbered in the order Postgres returns them; new ones continue the sequence)
ALTER TABLE "Refund" ADD COLUMN "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_number_key" ON "Refund"("number");
