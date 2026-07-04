-- AlterTable
ALTER TABLE "Deployment"
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "desiredReplicas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastNonZeroReplicas" INTEGER,
ADD COLUMN     "lastRestartedAt" TIMESTAMP(3),
ADD COLUMN     "stoppedAt" TIMESTAMP(3);

-- Backfill desired replica tracking from existing deployment records.
UPDATE "Deployment"
SET
  "desiredReplicas" = "replicas",
  "lastNonZeroReplicas" = CASE WHEN "replicas" > 0 THEN "replicas" ELSE NULL END;

-- CreateTable
CREATE TABLE "EvidenceSnapshot" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceSnapshot_deploymentId_idx" ON "EvidenceSnapshot"("deploymentId");

-- CreateIndex
CREATE INDEX "EvidenceSnapshot_createdAt_idx" ON "EvidenceSnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "EvidenceSnapshot"
ADD CONSTRAINT "EvidenceSnapshot_deploymentId_fkey"
FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
