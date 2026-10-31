-- CreateTable
CREATE TABLE "StatusIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'minor',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusIncident_startedAt_idx" ON "StatusIncident"("startedAt");
