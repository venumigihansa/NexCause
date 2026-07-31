import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeploymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { TenantContextService } from "../database/tenant-context.service";
import {
  DeploymentEventSummary,
  DeploymentPodSummary,
  KubernetesService,
} from "../kubernetes/kubernetes.service";

interface TelemetryEnvInput {
  appId: string;
  appName: string;
  deploymentId: string;
  deploymentName: string;
  namespace: string;
}

@Injectable()
export class ObservabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ObservabilityService.name);
  private healthSampleTimer?: NodeJS.Timeout;
  private isCollecting = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      return;
    }

    const intervalSeconds = this.getHealthSampleIntervalSeconds();

    if (intervalSeconds <= 0) {
      return;
    }

    this.healthSampleTimer = setInterval(() => {
      this.startHealthSampleCollection();
    }, intervalSeconds * 1000);

    this.startHealthSampleCollection();
  }

  private startHealthSampleCollection() {
    void this.collectAllHealthSamples().catch((error) => {
      this.logger.warn(
        `Health sample collection failed: ${getErrorMessage(error)}`,
      );
    });
  }

  onModuleDestroy() {
    if (this.healthSampleTimer) {
      clearInterval(this.healthSampleTimer);
    }
  }

  // Builds the OTEL environment variables injected into managed app containers.
  buildTelemetryEnv(input: TelemetryEnvInput): Record<string, string> {
    if (!this.isEnabled()) {
      return {};
    }

    return {
      OTEL_SERVICE_NAME: input.appName,
      OTEL_EXPORTER_OTLP_ENDPOINT:
        this.configService.get<string>("otelExporterOtlpEndpoint") ??
        "http://otel-collector-opentelemetry-collector.observability.svc.cluster.local:4318",
      OTEL_EXPORTER_OTLP_PROTOCOL:
        this.configService.get<string>("otelExporterOtlpProtocol") ??
        "http/protobuf",
      OTEL_RESOURCE_ATTRIBUTES: [
        `service.namespace=${input.namespace}`,
        `app.id=${input.appId}`,
        `deployment.id=${input.deploymentId}`,
        `deployment.name=${input.deploymentName}`,
        "app.kubernetes.io/managed-by=deployment-manager-service",
      ].join(","),
    };
  }

  // Returns non-secret observability settings for debugging and UI display.
  getPublicConfig() {
    return {
      enabled: this.isEnabled(),
      otelExporterOtlpEndpoint: this.configService.get<string>(
        "otelExporterOtlpEndpoint",
      ),
      otelExporterOtlpProtocol: this.configService.get<string>(
        "otelExporterOtlpProtocol",
      ),
      healthSampleIntervalSeconds: this.getHealthSampleIntervalSeconds(),
      healthSampleRetentionMinutes: this.getHealthSampleRetentionMinutes(),
    };
  }

  // Collects compact Kubernetes health samples for all active deployments.
  async collectAllHealthSamples() {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;

    try {
      const workspaces = await this.prisma.workspace.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      for (const workspace of workspaces) {
        await this.tenantContext.run(
          { workspaceId: workspace.id },
          async () => {
            const deployments = await this.prisma.deployment.findMany({
              where: {
                deletedAt: null,
                status: { not: DeploymentStatus.deleted },
              },
              select: { id: true },
            });
            await Promise.all(
              deployments.map((deployment) =>
                this.collectDeploymentHealthSample(deployment.id).catch(
                  (error) => {
                    this.logger.warn(
                      `Failed to collect health sample for deployment ${deployment.id}: ${getErrorMessage(error)}`,
                    );
                  },
                ),
              ),
            );
            await this.deleteExpiredHealthSamples();
          },
        );
      }
    } finally {
      this.isCollecting = false;
    }
  }

  // Collects and stores one compact Kubernetes health sample.
  async collectDeploymentHealthSample(deploymentId: string) {
    const deployment = await this.findDeploymentForHealthSample(deploymentId);
    const labels = this.kubernetesService.buildManagedLabels(
      deployment.workspaceId,
      deployment.appId,
      deployment.id,
    );
    const collectedAt = new Date();
    const [status, pods, events] = await Promise.all([
      this.kubernetesService.getDeploymentStatus(
        deployment.namespace,
        deployment.kubernetesDeployment,
      ),
      this.kubernetesService.listDeploymentPods(deployment.namespace, labels),
      this.kubernetesService.listDeploymentEvents(
        deployment.namespace,
        deployment.kubernetesDeployment,
        labels,
      ),
    ]);
    const warningEventCount = countWarningEvents(events);
    const restartCount = countRestarts(pods);
    const sampleStatus = deriveSampleStatus(
      deployment.status,
      status.desiredReplicas,
      status.readyReplicas,
      warningEventCount,
    );

    return this.prisma.deploymentHealthSample.create({
      data: {
        deploymentId: deployment.id,
        status: sampleStatus,
        desiredReplicas: status.desiredReplicas,
        readyReplicas: status.readyReplicas,
        availableReplicas: status.availableReplicas,
        podCount: pods.length,
        warningEventCount,
        restartCount,
        data: toPrismaJson({
          collectedAt: collectedAt.toISOString(),
          deployment: {
            id: deployment.id,
            namespace: deployment.namespace,
            status: deployment.status,
            kubernetesDeployment: deployment.kubernetesDeployment,
          },
          kubernetes: {
            status,
            pods,
            events,
          },
        }),
        collectedAt,
      },
    });
  }

  // Lists recent health samples for one deployment.
  async listHealthSamples(deploymentId: string, sinceMinutes?: number) {
    await this.ensureDeploymentExists(deploymentId);

    return this.prisma.deploymentHealthSample.findMany({
      where: {
        deploymentId,
        ...(sinceMinutes
          ? {
              collectedAt: {
                gte: minutesAgo(sinceMinutes),
              },
            }
          : {}),
      },
      orderBy: { collectedAt: "desc" },
    });
  }

  // Returns the latest stored health sample for one deployment.
  async getLatestHealthSample(deploymentId: string) {
    await this.ensureDeploymentExists(deploymentId);

    return this.prisma.deploymentHealthSample.findFirst({
      where: { deploymentId },
      orderBy: { collectedAt: "desc" },
    });
  }

  private isEnabled(): boolean {
    return this.configService.get<boolean>("observabilityEnabled") ?? true;
  }

  private getHealthSampleIntervalSeconds(): number {
    return this.configService.get<number>("healthSampleIntervalSeconds") ?? 60;
  }

  private getHealthSampleRetentionMinutes(): number {
    return this.configService.get<number>("healthSampleRetentionMinutes") ?? 60;
  }

  private async deleteExpiredHealthSamples() {
    await this.prisma.deploymentHealthSample.deleteMany({
      where: {
        collectedAt: {
          lt: minutesAgo(this.getHealthSampleRetentionMinutes()),
        },
      },
    });
  }

  private async ensureDeploymentExists(deploymentId: string): Promise<void> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { id: true },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} was not found`);
    }
  }

  private async findDeploymentForHealthSample(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        workspaceId: true,
        appId: true,
        namespace: true,
        status: true,
        kubernetesDeployment: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} was not found`);
    }

    return deployment;
  }
}

function countWarningEvents(events: DeploymentEventSummary[]): number {
  return events.filter((event) => event.type === "Warning").length;
}

function countRestarts(pods: DeploymentPodSummary[]): number {
  return pods.reduce(
    (total, pod) =>
      total +
      pod.containers.reduce(
        (containerTotal, container) => containerTotal + container.restartCount,
        0,
      ),
    0,
  );
}

function deriveSampleStatus(
  storedStatus: DeploymentStatus,
  desiredReplicas: number,
  readyReplicas: number,
  warningEventCount: number,
): string {
  if (storedStatus === DeploymentStatus.stopped || desiredReplicas === 0) {
    return DeploymentStatus.stopped;
  }

  if (storedStatus === DeploymentStatus.deleted) {
    return DeploymentStatus.deleted;
  }

  if (warningEventCount > 0) {
    return "warning";
  }

  if (desiredReplicas > 0 && readyReplicas >= desiredReplicas) {
    return DeploymentStatus.running;
  }

  return storedStatus;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function toPrismaJson(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
