import { z } from "zod";

export const authMeSchema = z.object({
  user: z.object({
    id: z.string(),
    subject: z.string(),
    email: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
  }),
  workspace: z.object({
    id: z.string(),
    organizationId: z.string(),
  }),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  csrfToken: z.string(),
});

export type AuthMe = z.infer<typeof authMeSchema>;

export const appSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  sourceType: z.enum(["image", "git"]),
  image: z.string().nullable().optional(),
  defaultPort: z.number().nullable().optional(),
  repoUrl: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  buildContext: z.string().nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type AppRecord = z.infer<typeof appSchema>;

export const buildSchema = z.object({
  id: z.string(),
  appId: z.string(),
  status: z.string(),
  strategy: z.string(),
  repoUrl: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  buildContext: z.string().optional().nullable(),
  dockerfilePath: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  kubernetesJob: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type BuildRecord = z.infer<typeof buildSchema>;

export const deploymentSchema = z.object({
  id: z.string(),
  appId: z.string(),
  buildId: z.string().nullable().optional(),
  namespace: z.string(),
  image: z.string(),
  replicas: z.number(),
  desiredReplicas: z.number().optional(),
  port: z.number(),
  status: z.string(),
  kubernetesDeployment: z.string(),
  kubernetesService: z.string(),
  publicHostname: z.string().nullable().optional(),
  publicUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type DeploymentRecord = z.infer<typeof deploymentSchema>;

export const incidentSchema = z.object({
  id: z.string(),
  appId: z.string().optional(),
  deploymentId: z.string().optional(),
  status: z.string(),
  severity: z.string(),
  source: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  openedAt: z.string().optional(),
  resolvedAt: z.string().nullable().optional(),
  app: appSchema.optional(),
  deployment: deploymentSchema.optional(),
  rcaRuns: z.array(z.unknown()).optional(),
});

export type IncidentRecord = z.infer<typeof incidentSchema>;

export type RcaRunRecord = {
  id: string;
  incidentId: string;
  deploymentId: string;
  status: string;
  source: string;
  result?: unknown;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  incident?: IncidentRecord;
  deployment?: DeploymentRecord;
  evidenceSnapshot?: unknown;
};

export type TelemetryOverview = {
  appId: string;
  deploymentId: string;
  deployment?: DeploymentRecord;
  status?: { status: string; data?: unknown; error?: string };
  sourceStatus?: Record<string, string>;
  latestHealthSample?: unknown;
  recent?: Record<string, number>;
};

export type TelemetryMetrics = {
  series: Array<{
    name: string;
    labels: Record<string, string>;
    values: Array<{ timestamp: string; value: number }>;
  }>;
  sourceStatus?: Record<string, string>;
  errors?: Array<{ source: string; message: string }>;
};

export type TelemetryLogs = {
  logs: Array<{
    timestamp: string;
    podName: string;
    line: string;
    level: string;
  }>;
  sourceStatus?: Record<string, string>;
};

export type TelemetryTraces = {
  traces: Array<{
    traceId: string;
    rootService?: string;
    rootOperation?: string;
    durationMs?: number;
    status?: string;
  }>;
  sourceStatus?: Record<string, string>;
};

export type TelemetryKubernetes = {
  status?: unknown;
  pods?: { data?: unknown[]; status?: string };
  events?: { data?: unknown[]; status?: string };
  healthSamples?: unknown[];
  sourceStatus?: Record<string, string>;
};
