-- CreateEnum
CREATE TYPE "BuildStrategy" AS ENUM ('dockerfile', 'buildpack');

-- AlterTable
ALTER TABLE "Build"
ADD COLUMN     "strategy" "BuildStrategy" NOT NULL DEFAULT 'dockerfile',
ALTER COLUMN   "dockerfilePath" DROP NOT NULL;
