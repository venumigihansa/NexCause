-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "RcaRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "RcaRunSource" AS ENUM ('manual', 'automatic');

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'warning',
    "source" "IncidentSource" NOT NULL,
    "ruleKey" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "latestHealthSampleId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcaRun" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "evidenceSnapshotId" TEXT,
    "status" "RcaRunStatus" NOT NULL DEFAULT 'pending',
    "source" "RcaRunSource" NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcaRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_appId_idx" ON "Incident"("appId");

-- CreateIndex
CREATE INDEX "Incident_deploymentId_status_idx" ON "Incident"("deploymentId", "status");

-- CreateIndex
CREATE INDEX "Incident_latestHealthSampleId_idx" ON "Incident"("latestHealthSampleId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "RcaRun_incidentId_idx" ON "RcaRun"("incidentId");

-- CreateIndex
CREATE INDEX "RcaRun_deploymentId_idx" ON "RcaRun"("deploymentId");

-- CreateIndex
CREATE INDEX "RcaRun_evidenceSnapshotId_idx" ON "RcaRun"("evidenceSnapshotId");

-- CreateIndex
CREATE INDEX "RcaRun_status_idx" ON "RcaRun"("status");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_latestHealthSampleId_fkey" FOREIGN KEY ("latestHealthSampleId") REFERENCES "DeploymentHealthSample"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_evidenceSnapshotId_fkey" FOREIGN KEY ("evidenceSnapshotId") REFERENCES "EvidenceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
