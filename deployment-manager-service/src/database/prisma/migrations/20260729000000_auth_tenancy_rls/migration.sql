-- Authentication, shared-schema tenancy, and row-level security.
CREATE TYPE "WorkspaceStatus" AS ENUM ('active', 'suspended', 'deleted');

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "asgardeoOrganizationId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "WorkspaceStatus" NOT NULL DEFAULT 'active',
  "kubernetesNamespace" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workspace_asgardeoOrganizationId_key" ON "Workspace"("asgardeoOrganizationId");
CREATE UNIQUE INDEX "Workspace_kubernetesNamespace_key" ON "Workspace"("kubernetesNamespace");

-- Existing pre-tenant data is retained in a bootstrap workspace. The application
-- will attach it to AUTH_BOOTSTRAP_ORGANIZATION_ID on that organization's first login.
INSERT INTO "Workspace" (
  "id", "asgardeoOrganizationId", "displayName", "kubernetesNamespace", "updatedAt"
) VALUES (
  'legacy-workspace', 'legacy-bootstrap-required', 'Legacy workspace',
  'rca-w-legacy', CURRENT_TIMESTAMP
);

CREATE TABLE "IdentityUser" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdentityUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdentityUser_subject_key" ON "IdentityUser"("subject");

CREATE TABLE "WorkspaceMembership" (
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("workspaceId", "userId"),
  CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "IdentityUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

CREATE TABLE "AuthLoginAttempt" (
  "stateHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeVerifierEncrypted" TEXT NOT NULL,
  "returnTo" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthLoginAttempt_pkey" PRIMARY KEY ("stateHash")
);
CREATE INDEX "AuthLoginAttempt_expiresAt_idx" ON "AuthLoginAttempt"("expiresAt");

CREATE TABLE "AuthSession" (
  "idHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "csrfToken" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT,
  "refreshTokenEncrypted" TEXT,
  "idTokenEncrypted" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("idHash"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "IdentityUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuthSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_workspaceId_idx" ON "AuthSession"("workspaceId");
CREATE INDEX "AuthSession_idleExpiresAt_idx" ON "AuthSession"("idleExpiresAt");
CREATE INDEX "AuthSession_absoluteExpiresAt_idx" ON "AuthSession"("absoluteExpiresAt");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "outcome" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "IdentityUser"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

DROP INDEX "App_name_key";

ALTER TABLE "App" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "Deployment" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "DeploymentHealthSample" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "Incident" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "RcaRun" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "RcaAgentThread" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "RcaChatMessage" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "EvidenceSnapshot" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "RuntimeConfig" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';
ALTER TABLE "Build" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy-workspace';

-- Preserve relationship tenant identity during backfill.
UPDATE "Deployment" d SET "workspaceId" = a."workspaceId" FROM "App" a WHERE d."appId" = a."id";
UPDATE "Build" b SET "workspaceId" = a."workspaceId" FROM "App" a WHERE b."appId" = a."id";
UPDATE "DeploymentHealthSample" h SET "workspaceId" = d."workspaceId" FROM "Deployment" d WHERE h."deploymentId" = d."id";
UPDATE "Incident" i SET "workspaceId" = d."workspaceId" FROM "Deployment" d WHERE i."deploymentId" = d."id";
UPDATE "RcaRun" r SET "workspaceId" = d."workspaceId" FROM "Deployment" d WHERE r."deploymentId" = d."id";
UPDATE "RcaAgentThread" t SET "workspaceId" = r."workspaceId" FROM "RcaRun" r WHERE t."rcaRunId" = r."id";
UPDATE "RcaChatMessage" m SET "workspaceId" = t."workspaceId" FROM "RcaAgentThread" t WHERE m."threadId" = t."id";
UPDATE "EvidenceSnapshot" e SET "workspaceId" = d."workspaceId" FROM "Deployment" d WHERE e."deploymentId" = d."id";
UPDATE "RuntimeConfig" c SET "workspaceId" = d."workspaceId" FROM "Deployment" d WHERE c."deploymentId" = d."id";

ALTER TABLE "App" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "Deployment" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "DeploymentHealthSample" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "Incident" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "RcaRun" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "RcaAgentThread" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "RcaChatMessage" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "EvidenceSnapshot" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "RuntimeConfig" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');
ALTER TABLE "Build" ALTER COLUMN "workspaceId" SET DEFAULT current_setting('app.workspace_id');

ALTER TABLE "App" ADD CONSTRAINT "App_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeploymentHealthSample" ADD CONSTRAINT "DeploymentHealthSample_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RcaAgentThread" ADD CONSTRAINT "RcaAgentThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RcaChatMessage" ADD CONSTRAINT "RcaChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceSnapshot" ADD CONSTRAINT "EvidenceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuntimeConfig" ADD CONSTRAINT "RuntimeConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Build" ADD CONSTRAINT "Build_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "App_workspaceId_name_key" ON "App"("workspaceId", "name");
CREATE UNIQUE INDEX "App_id_workspaceId_key" ON "App"("id", "workspaceId");
CREATE UNIQUE INDEX "Deployment_id_workspaceId_key" ON "Deployment"("id", "workspaceId");
CREATE UNIQUE INDEX "DeploymentHealthSample_id_workspaceId_key" ON "DeploymentHealthSample"("id", "workspaceId");
CREATE UNIQUE INDEX "Incident_id_workspaceId_key" ON "Incident"("id", "workspaceId");
CREATE UNIQUE INDEX "RcaRun_id_workspaceId_key" ON "RcaRun"("id", "workspaceId");
CREATE UNIQUE INDEX "RcaAgentThread_id_workspaceId_key" ON "RcaAgentThread"("id", "workspaceId");
CREATE UNIQUE INDEX "RcaChatMessage_id_workspaceId_key" ON "RcaChatMessage"("id", "workspaceId");
CREATE UNIQUE INDEX "EvidenceSnapshot_id_workspaceId_key" ON "EvidenceSnapshot"("id", "workspaceId");
CREATE UNIQUE INDEX "RuntimeConfig_id_workspaceId_key" ON "RuntimeConfig"("id", "workspaceId");
CREATE UNIQUE INDEX "Build_id_workspaceId_key" ON "Build"("id", "workspaceId");

CREATE TABLE "RcaRunEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'),
  "rcaRunId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RcaRunEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RcaRunEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "RcaRunEvent_rcaRunId_fkey" FOREIGN KEY ("rcaRunId") REFERENCES "RcaRun"("id") ON DELETE CASCADE
);
CREATE INDEX "RcaRunEvent_rcaRunId_createdAt_idx" ON "RcaRunEvent"("rcaRunId", "createdAt");
CREATE UNIQUE INDEX "RcaRunEvent_id_workspaceId_key" ON "RcaRunEvent"("id", "workspaceId");
ALTER TABLE "RcaRunEvent" ADD CONSTRAINT "RcaRunEvent_rcaRunId_workspaceId_fkey"
  FOREIGN KEY ("rcaRunId", "workspaceId") REFERENCES "RcaRun"("id", "workspaceId") ON DELETE CASCADE;

-- Composite constraints prevent a row from referencing a parent in another workspace.
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_appId_workspaceId_fkey"
  FOREIGN KEY ("appId", "workspaceId") REFERENCES "App"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "DeploymentHealthSample" ADD CONSTRAINT "DeploymentHealthSample_deploymentId_workspaceId_fkey"
  FOREIGN KEY ("deploymentId", "workspaceId") REFERENCES "Deployment"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_appId_workspaceId_fkey"
  FOREIGN KEY ("appId", "workspaceId") REFERENCES "App"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deploymentId_workspaceId_fkey"
  FOREIGN KEY ("deploymentId", "workspaceId") REFERENCES "Deployment"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_incidentId_workspaceId_fkey"
  FOREIGN KEY ("incidentId", "workspaceId") REFERENCES "Incident"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "RcaRun" ADD CONSTRAINT "RcaRun_deploymentId_workspaceId_fkey"
  FOREIGN KEY ("deploymentId", "workspaceId") REFERENCES "Deployment"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "RcaAgentThread" ADD CONSTRAINT "RcaAgentThread_rcaRunId_workspaceId_fkey"
  FOREIGN KEY ("rcaRunId", "workspaceId") REFERENCES "RcaRun"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "RcaChatMessage" ADD CONSTRAINT "RcaChatMessage_threadId_workspaceId_fkey"
  FOREIGN KEY ("threadId", "workspaceId") REFERENCES "RcaAgentThread"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "EvidenceSnapshot" ADD CONSTRAINT "EvidenceSnapshot_deploymentId_workspaceId_fkey"
  FOREIGN KEY ("deploymentId", "workspaceId") REFERENCES "Deployment"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "RuntimeConfig" ADD CONSTRAINT "RuntimeConfig_deploymentId_workspaceId_fkey"
  FOREIGN KEY ("deploymentId", "workspaceId") REFERENCES "Deployment"("id", "workspaceId") ON DELETE CASCADE;
ALTER TABLE "Build" ADD CONSTRAINT "Build_appId_workspaceId_fkey"
  FOREIGN KEY ("appId", "workspaceId") REFERENCES "App"("id", "workspaceId") ON DELETE CASCADE;

-- RLS is forced even for the table owner. Only a transaction-local workspace
-- context grants access; pooled connections return clean after each transaction.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'App', 'Deployment', 'DeploymentHealthSample', 'Incident', 'RcaRun',
    'RcaRunEvent', 'RcaAgentThread', 'RcaChatMessage', 'EvidenceSnapshot', 'RuntimeConfig', 'Build'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING ("workspaceId" = current_setting(''app.workspace_id'', true)) WITH CHECK ("workspaceId" = current_setting(''app.workspace_id'', true))',
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO deployment_manager;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO deployment_manager;

GRANT SELECT ON "Workspace", "Incident", "Deployment", "EvidenceSnapshot",
  "DeploymentHealthSample", "RuntimeConfig" TO rca_agent;
GRANT SELECT, INSERT, UPDATE ON "RcaRun", "RcaAgentThread", "RcaChatMessage" TO rca_agent;
GRANT SELECT, INSERT ON "RcaRunEvent" TO rca_agent;

GRANT SELECT ON "Workspace", "RcaRun", "Incident", "Deployment",
  "DeploymentHealthSample", "RuntimeConfig" TO rca_mcp;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Workspace', 'IdentityUser', 'WorkspaceMembership', 'AuthLoginAttempt',
    'AuthSession', 'AuditEvent', 'App', 'Deployment',
    'DeploymentHealthSample', 'Incident', 'RcaRun', 'RcaAgentThread',
    'RcaRunEvent', 'RcaChatMessage', 'EvidenceSnapshot', 'RuntimeConfig', 'Build'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO rca_owner', table_name);
  END LOOP;
END $$;
ALTER TYPE "WorkspaceStatus" OWNER TO rca_owner;
