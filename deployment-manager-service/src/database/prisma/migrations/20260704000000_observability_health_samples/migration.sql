-- CreateTable
CREATE TABLE "DeploymentHealthSample" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "desiredReplicas" INTEGER NOT NULL,
    "readyReplicas" INTEGER NOT NULL,
    "availableReplicas" INTEGER NOT NULL,
    "podCount" INTEGER NOT NULL,
    "warningEventCount" INTEGER NOT NULL,
    "restartCount" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentHealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentHealthSample_deploymentId_collectedAt_idx" ON "DeploymentHealthSample"("deploymentId", "collectedAt");

-- CreateIndex
CREATE INDEX "DeploymentHealthSample_collectedAt_idx" ON "DeploymentHealthSample"("collectedAt");

-- AddForeignKey
ALTER TABLE "DeploymentHealthSample" ADD CONSTRAINT "DeploymentHealthSample_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
