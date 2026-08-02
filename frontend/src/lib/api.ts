import { z } from "zod";
import { runtimeConfig } from "../config";
import {
  appSchema,
  authMeSchema,
  buildSchema,
  deploymentSchema,
  incidentSchema,
  type AppRecord,
  type AuthMe,
  type BuildRecord,
  type DeploymentRecord,
  type IncidentRecord,
  type RcaRunRecord,
  type TelemetryKubernetes,
  type TelemetryLogs,
  type TelemetryMetrics,
  type TelemetryOverview,
  type TelemetryTraces,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let csrfToken = "";

export function setCsrfToken(next: string) {
  csrfToken = next;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || response.statusText, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return schema ? schema.parse(payload) : (payload as T);
}

export const api = {
  async me(): Promise<AuthMe> {
    const result = await request("/auth/me", {}, authMeSchema);
    setCsrfToken(result.csrfToken);
    return result;
  },
  apps: {
    list: () => request("/apps", {}, z.array(appSchema)),
    get: (appId: string) => request(`/apps/${appId}`, {}, appSchema),
    create: (body: unknown) =>
      request<AppRecord>(
        "/apps",
        { method: "POST", body: JSON.stringify(body) },
        appSchema,
      ),
  },
  builds: {
    list: (appId: string) =>
      request(`/apps/${appId}/builds`, {}, z.array(buildSchema)),
    get: (buildId: string) => request(`/builds/${buildId}`, {}, buildSchema),
    status: (buildId: string) => request<unknown>(`/builds/${buildId}/status`),
    logs: (buildId: string) =>
      request<Array<{ podName: string; logs: string }>>(`/builds/${buildId}/logs`),
    create: (appId: string, body: unknown) =>
      request<BuildRecord>(
        `/apps/${appId}/builds`,
        { method: "POST", body: JSON.stringify(body) },
        buildSchema,
      ),
  },
  deployments: {
    list: (appId: string) =>
      request(`/apps/${appId}/deployments`, {}, z.array(deploymentSchema)),
    create: (appId: string, body: unknown) =>
      request<DeploymentRecord>(
        `/apps/${appId}/deployments`,
        { method: "POST", body: JSON.stringify(body) },
        deploymentSchema,
      ),
    status: (deploymentId: string) =>
      request<unknown>(`/deployments/${deploymentId}/status`),
    scale: (deploymentId: string, replicas: number) =>
      request(`/deployments/${deploymentId}/scale`, {
        method: "POST",
        body: JSON.stringify({ replicas }),
      }),
    restart: (deploymentId: string) =>
      request(`/deployments/${deploymentId}/restart`, { method: "POST" }),
    stop: (deploymentId: string) =>
      request(`/deployments/${deploymentId}/stop`, { method: "POST" }),
    start: (deploymentId: string, replicas?: number) =>
      request(`/deployments/${deploymentId}/start`, {
        method: "POST",
        body: JSON.stringify(replicas ? { replicas } : {}),
      }),
    delete: (deploymentId: string) =>
      request(`/deployments/${deploymentId}`, { method: "DELETE" }),
  },
  telemetry: {
    overview: (appId: string, deploymentId: string) =>
      request<TelemetryOverview>(
        `/apps/${appId}/deployments/${deploymentId}/telemetry/overview`,
      ),
    metrics: (appId: string, deploymentId: string, sinceMinutes = 60) =>
      request<TelemetryMetrics>(
        `/apps/${appId}/deployments/${deploymentId}/telemetry/metrics?sinceMinutes=${sinceMinutes}`,
      ),
    logs: (
      appId: string,
      deploymentId: string,
      sinceMinutes = 30,
      level?: string,
    ) =>
      request<TelemetryLogs>(
        `/apps/${appId}/deployments/${deploymentId}/telemetry/logs?sinceMinutes=${sinceMinutes}${level ? `&level=${level}` : ""}`,
      ),
    traces: (appId: string, deploymentId: string, sinceMinutes = 30) =>
      request<TelemetryTraces>(
        `/apps/${appId}/deployments/${deploymentId}/telemetry/traces?sinceMinutes=${sinceMinutes}`,
      ),
    kubernetes: (appId: string, deploymentId: string, sinceMinutes = 60) =>
      request<TelemetryKubernetes>(
        `/apps/${appId}/deployments/${deploymentId}/telemetry/kubernetes?sinceMinutes=${sinceMinutes}`,
      ),
  },
  incidents: {
    list: (status?: string) =>
      request(
        `/incidents${status ? `?status=${status}` : ""}`,
        {},
        z.array(incidentSchema),
      ),
    get: (incidentId: string) =>
      request(`/incidents/${incidentId}`, {}, incidentSchema),
    resolve: (incidentId: string) =>
      request(`/incidents/${incidentId}/resolve`, { method: "POST" }),
    createForDeployment: (deploymentId: string, body: unknown) =>
      request<IncidentRecord>(
        `/deployments/${deploymentId}/incidents`,
        { method: "POST", body: JSON.stringify(body) },
        incidentSchema,
      ),
  },
  rca: {
    startForDeployment: (deploymentId: string) =>
      request<RcaRunRecord>(`/deployments/${deploymentId}/rca-runs`, {
        method: "POST",
      }),
    startForIncident: (incidentId: string) =>
      request<RcaRunRecord>(`/incidents/${incidentId}/rca-runs`, {
        method: "POST",
      }),
    get: (runId: string) => request<RcaRunRecord>(`/rca-runs/${runId}`),
    chat: {
      list: (runId: string) =>
        request<Array<{ role: string; content: string; createdAt?: string }>>(
          `/rca-runs/${runId}/chat`,
        ),
      send: (runId: string, message: string) =>
        request(`/rca-runs/${runId}/chat`, {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
    },
  },
  auth: {
    metrics: () => request<unknown>("/auth/metrics"),
    logout: () =>
      fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
      }),
  },
};
