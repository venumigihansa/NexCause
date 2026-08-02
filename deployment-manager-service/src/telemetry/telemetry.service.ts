import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Deployment, DeploymentStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { TenantContextService } from "../database/tenant-context.service";
import { KubernetesService } from "../kubernetes/kubernetes.service";
import {
  LokiTelemetryClient,
  LogLevel,
  TelemetryLogRow,
} from "./clients/loki-telemetry.client";
import {
  MetricSeries,
  PrometheusTelemetryClient,
} from "./clients/prometheus-telemetry.client";
import {
  TelemetryTraceSummary,
  TempoTelemetryClient,
} from "./clients/tempo-telemetry.client";

type SourceStatus = "available" | "empty" | "error";

interface TelemetryWindow {
  start: string;
  end: string;
  sinceMinutes: number;
}

type DeploymentForTelemetry = Deployment & {
  app: {
    id: string;
    name: string;
    displayName: string;
  };
};

@Injectable()
export class TelemetryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly kubernetesService: KubernetesService,
    private readonly prometheus: PrometheusTelemetryClient,
    private readonly loki: LokiTelemetryClient,
    private readonly tempo: TempoTelemetryClient,
  ) {}

  async getOverview(appId: string, deploymentId: string) {
    const deployment = await this.findDeployment(appId, deploymentId);
    const labels = this.labels(deployment);
    const [status, latestHealthSample, recentHealthSamples] = await Promise.all(
      [
        collectSource(() =>
          deployment.status === DeploymentStatus.deleted
            ? Promise.resolve({
                desiredReplicas: deployment.desiredReplicas,
                readyReplicas: 0,
                availableReplicas: 0,
                updatedReplicas: 0,
                unavailableReplicas: 0,
                conditions: [],
              })
            : this.kubernetesService.getDeploymentStatus(
                deployment.namespace,
                deployment.kubernetesDeployment,
              ),
        ),
        this.prisma.deploymentHealthSample.findFirst({
          where: { deploymentId: deployment.id },
          orderBy: { collectedAt: "desc" },
        }),
        this.prisma.deploymentHealthSample.findMany({
          where: {
            deploymentId: deployment.id,
            collectedAt: { gte: minutesAgo(60) },
          },
          orderBy: { collectedAt: "desc" },
          take: 120,
        }),
      ],
    );

    return {
      ...this.baseResponse(deployment, windowFor(60)),
      app: appSummary(deployment),
      deployment: deploymentSummary(deployment),
      labels,
      status,
      latestHealthSample,
      recent: {
        healthSampleCount: recentHealthSamples.length,
        warningEventCount: recentHealthSamples.reduce(
          (total, sample) => total + sample.warningEventCount,
          0,
        ),
        restartCount: latestHealthSample?.restartCount ?? 0,
      },
      sourceStatus: {
        kubernetes: status.status,
        healthSamples: latestHealthSample ? "available" : "empty",
        prometheus: configuredStatus(
          this.configService.get<string>("prometheusUrl"),
        ),
        loki: configuredStatus(this.configService.get<string>("lokiUrl")),
        tempo: configuredStatus(this.configService.get<string>("tempoUrl")),
      },
    };
  }

  async getMetrics(
    appId: string,
    deploymentId: string,
    input: { sinceMinutes?: number; stepSeconds?: number },
  ) {
    const deployment = await this.findDeployment(appId, deploymentId);
    const window = windowFor(input.sinceMinutes ?? 60);
    const result = await collectSource<MetricSeries[]>(() =>
      this.prometheus.queryDeploymentMetrics({
        namespace: deployment.namespace,
        deploymentName: deployment.kubernetesDeployment,
        deploymentId: deployment.id,
        start: new Date(window.start),
        end: new Date(window.end),
        stepSeconds: input.stepSeconds ?? 30,
      }),
    );

    return {
      ...this.baseResponse(deployment, window),
      sourceStatus: { prometheus: result.status },
      series: result.data ?? [],
      errors: result.error
        ? [{ source: "prometheus", message: result.error }]
        : [],
    };
  }

  async getLogs(
    appId: string,
    deploymentId: string,
    input: { sinceMinutes?: number; limit?: number; level?: LogLevel },
  ) {
    const deployment = await this.findDeployment(appId, deploymentId);
    const window = windowFor(input.sinceMinutes ?? 30);
    const result = await collectSource<TelemetryLogRow[]>(() =>
      this.loki.queryDeploymentLogs({
        namespace: deployment.namespace,
        deploymentName: deployment.kubernetesDeployment,
        start: new Date(window.start),
        end: new Date(window.end),
        limit: input.limit ?? 200,
        level: input.level,
      }),
    );

    return {
      ...this.baseResponse(deployment, window),
      sourceStatus: { loki: result.status },
      logs: result.data ?? [],
      errors: result.error ? [{ source: "loki", message: result.error }] : [],
    };
  }

  async getTraces(
    appId: string,
    deploymentId: string,
    input: { sinceMinutes?: number; limit?: number },
  ) {
    const deployment = await this.findDeployment(appId, deploymentId);
    const window = windowFor(input.sinceMinutes ?? 30);
    const result = await collectSource<TelemetryTraceSummary[]>(() =>
      this.tempo.queryDeploymentTraces({
        appName: deployment.app.name,
        deploymentId: deployment.id,
        start: new Date(window.start),
        end: new Date(window.end),
        limit: input.limit ?? 100,
      }),
    );

    return {
      ...this.baseResponse(deployment, window),
      sourceStatus: { tempo: result.status },
      traces: result.data ?? [],
      errors: result.error ? [{ source: "tempo", message: result.error }] : [],
    };
  }

  async getKubernetes(
    appId: string,
    deploymentId: string,
    input: { sinceMinutes?: number },
  ) {
    const deployment = await this.findDeployment(appId, deploymentId);
    const labels = this.labels(deployment);
    const window = windowFor(input.sinceMinutes ?? 60);
    const [status, pods, events, healthSamples] = await Promise.all([
      collectSource(() =>
        this.kubernetesService.getDeploymentStatus(
          deployment.namespace,
          deployment.kubernetesDeployment,
        ),
      ),
      collectSource(() =>
        this.kubernetesService.listDeploymentPods(deployment.namespace, labels),
      ),
      collectSource(() =>
        this.kubernetesService.listDeploymentEvents(
          deployment.namespace,
          deployment.kubernetesDeployment,
          labels,
        ),
      ),
      this.prisma.deploymentHealthSample.findMany({
        where: {
          deploymentId: deployment.id,
          collectedAt: { gte: new Date(window.start) },
        },
        orderBy: { collectedAt: "desc" },
        take: 120,
      }),
    ]);

    return {
      ...this.baseResponse(deployment, window),
      sourceStatus: {
        kubernetes:
          status.status === "error" ||
          pods.status === "error" ||
          events.status === "error"
            ? "error"
            : "available",
        healthSamples: healthSamples.length > 0 ? "available" : "empty",
      },
      status,
      pods,
      events,
      healthSamples,
      errors: [
        ...sourceError("kubernetes.status", status.error),
        ...sourceError("kubernetes.pods", pods.error),
        ...sourceError("kubernetes.events", events.error),
      ],
    };
  }

  private async findDeployment(
    appId: string,
    deploymentId: string,
  ): Promise<DeploymentForTelemetry> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    if (!deployment || deployment.appId !== appId) {
      throw new NotFoundException(
        `Deployment ${deploymentId} was not found for app ${appId}`,
      );
    }

    return deployment;
  }

  private labels(deployment: DeploymentForTelemetry): Record<string, string> {
    return this.kubernetesService.buildManagedLabels(
      deployment.workspaceId,
      deployment.appId,
      deployment.id,
    );
  }

  private baseResponse(
    deployment: DeploymentForTelemetry,
    window: TelemetryWindow,
  ) {
    return {
      workspaceId: this.tenantContext.requireWorkspaceId(),
      appId: deployment.appId,
      deploymentId: deployment.id,
      window,
    };
  }
}

async function collectSource<T>(
  collect: () => Promise<T>,
): Promise<{ status: SourceStatus; data?: T; error?: string }> {
  try {
    const data = await collect();
    const empty = Array.isArray(data) && data.length === 0;

    return { status: empty ? "empty" : "available", data };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function appSummary(deployment: DeploymentForTelemetry) {
  return {
    id: deployment.app.id,
    name: deployment.app.name,
    displayName: deployment.app.displayName,
  };
}

function deploymentSummary(deployment: DeploymentForTelemetry) {
  return {
    id: deployment.id,
    namespace: deployment.namespace,
    image: deployment.image,
    replicas: deployment.replicas,
    desiredReplicas: deployment.desiredReplicas,
    port: deployment.port,
    status: deployment.status,
    kubernetesDeployment: deployment.kubernetesDeployment,
    kubernetesService: deployment.kubernetesService,
    publicHostname: deployment.publicHostname,
    publicUrl: deployment.publicHostname
      ? `https://${deployment.publicHostname}`
      : null,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
  };
}

function windowFor(sinceMinutes: number): TelemetryWindow {
  const end = new Date();
  const start = new Date(end.getTime() - sinceMinutes * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    sinceMinutes,
  };
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function configuredStatus(value: string | undefined): SourceStatus {
  return value ? "available" : "error";
}

function sourceError(source: string, message?: string) {
  return message ? [{ source, message }] : [];
}
