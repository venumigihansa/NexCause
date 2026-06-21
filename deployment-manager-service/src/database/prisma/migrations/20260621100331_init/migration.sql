-- CreateEnum
CREATE TYPE "AppSourceType" AS ENUM ('image', 'git');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('creating', 'running', 'failed', 'stopped', 'deleted');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "RuntimeConfigType" AS ENUM ('env', 'secret', 'file');

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceType" "AppSourceType" NOT NULL DEFAULT 'image',
    "image" TEXT,
    "defaultPort" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "replicas" INTEGER NOT NULL,
    "port" INTEGER NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'creating',
    "kubernetesDeployment" TEXT NOT NULL,
    "kubernetesService" TEXT NOT NULL,
    "kubernetesConfigMap" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeConfig" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "type" "RuntimeConfigType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'pending',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");

-- CreateIndex
CREATE INDEX "Deployment_appId_idx" ON "Deployment"("appId");

-- CreateIndex
CREATE INDEX "Deployment_namespace_idx" ON "Deployment"("namespace");

-- CreateIndex
CREATE INDEX "RuntimeConfig_deploymentId_idx" ON "RuntimeConfig"("deploymentId");

-- CreateIndex
CREATE INDEX "Build_appId_idx" ON "Build"("appId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeConfig" ADD CONSTRAINT "RuntimeConfig_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
