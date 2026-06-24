-- AlterTable
ALTER TABLE "App"
ADD COLUMN     "repoUrl" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "buildContext" TEXT,
ADD COLUMN     "dockerfilePath" TEXT;

-- AlterTable
ALTER TABLE "Build"
ADD COLUMN     "repoUrl" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "buildContext" TEXT,
ADD COLUMN     "dockerfilePath" TEXT,
ADD COLUMN     "kubernetesJob" TEXT,
ADD COLUMN     "errorMessage" TEXT;

-- Existing scaffold build rows, if any, are marked skipped and given
-- placeholder snapshots so the new required columns can be made NOT NULL.
UPDATE "Build"
SET
  "repoUrl" = COALESCE("repoUrl", ''),
  "branch" = COALESCE("branch", 'main'),
  "buildContext" = COALESCE("buildContext", '.'),
  "dockerfilePath" = COALESCE("dockerfilePath", 'Dockerfile'),
  "status" = 'skipped'
WHERE "repoUrl" IS NULL
   OR "branch" IS NULL
   OR "buildContext" IS NULL
   OR "dockerfilePath" IS NULL;

-- AlterTable
ALTER TABLE "Build"
ALTER COLUMN "repoUrl" SET NOT NULL,
ALTER COLUMN "branch" SET NOT NULL,
ALTER COLUMN "buildContext" SET NOT NULL,
ALTER COLUMN "dockerfilePath" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Build_status_idx" ON "Build"("status");
