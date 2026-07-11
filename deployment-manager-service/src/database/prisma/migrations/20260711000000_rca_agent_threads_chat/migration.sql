-- CreateTable
CREATE TABLE "RcaAgentThread" (
    "id" TEXT NOT NULL,
    "rcaRunId" TEXT NOT NULL,
    "checkpointThreadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcaAgentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcaChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RcaChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RcaAgentThread_rcaRunId_key" ON "RcaAgentThread"("rcaRunId");

-- CreateIndex
CREATE INDEX "RcaAgentThread_checkpointThreadId_idx" ON "RcaAgentThread"("checkpointThreadId");

-- CreateIndex
CREATE INDEX "RcaAgentThread_status_idx" ON "RcaAgentThread"("status");

-- CreateIndex
CREATE INDEX "RcaChatMessage_threadId_createdAt_idx" ON "RcaChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "RcaChatMessage_role_idx" ON "RcaChatMessage"("role");

-- AddForeignKey
ALTER TABLE "RcaAgentThread" ADD CONSTRAINT "RcaAgentThread_rcaRunId_fkey" FOREIGN KEY ("rcaRunId") REFERENCES "RcaRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcaChatMessage" ADD CONSTRAINT "RcaChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "RcaAgentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
