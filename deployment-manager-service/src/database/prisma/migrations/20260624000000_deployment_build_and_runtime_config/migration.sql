-- AlterTable
ALTER TABLE "Deployment"
ADD COLUMN     "buildId" TEXT,
ADD COLUMN     "kubernetesFileConfigMap" TEXT,
ADD COLUMN     "kubernetesSecret" TEXT,
ADD COLUMN     "kubernetesSecretFiles" TEXT;

-- CreateIndex
CREATE INDEX "Deployment_buildId_idx" ON "Deployment"("buildId");

-- AddForeignKey
ALTER TABLE "Deployment"
ADD CONSTRAINT "Deployment_buildId_fkey"
FOREIGN KEY ("buildId") REFERENCES "Build"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
