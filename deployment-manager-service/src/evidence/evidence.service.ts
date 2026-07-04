import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RuntimeConfigType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kubernetesService: KubernetesService,
  ) {}

  // Collects live Kubernetes and database evidence for one deployment.
  async collectLive(deploymentId: string) {
    const deployment = await this.findDeploymentForEvidence(deploymentId);
    const labels = this.kubernetesService.buildManagedLabels(
      deployment.appId,
      deployment.id,
    );
    const collectedAt = new Date().toISOString();
    const [status, pods, events, logs, healthSamples] = await Promise.all([
      collectOrError(() =>
        this.kubernetesService.getDeploymentStatus(
          deployment.namespace,
          deployment.kubernetesDeployment,
        ),
      ),
      collectOrError(() =>
        this.kubernetesService.listDeploymentPods(deployment.namespace, labels),
      ),
      collectOrError(() =>
        this.kubernetesService.listDeploymentEvents(
          deployment.namespace,
          deployment.kubernetesDeployment,
          labels,
        ),
      ),
      collectOrError(() =>
        this.kubernetesService.getDeploymentEvidenceLogs(
          deployment.namespace,
          labels,
        ),
      ),
      this.prisma.deploymentHealthSample.findMany({
        where: {
          deploymentId: deployment.id,
          collectedAt: {
            gte: minutesAgo(60),
          },
        },
        orderBy: { collectedAt: 'desc' },
        take: 120,
      }),
    ]);

    const evidenceStatus = deriveEvidenceStatus(deployment.status, status);

    return {
      deploymentId: deployment.id,
      status: evidenceStatus,
      summary: buildEvidenceSummary(evidenceStatus, status, pods, events),
      collectedAt,
      app: {
        id: deployment.app.id,
        name: deployment.app.name,
        displayName: deployment.app.displayName,
        sourceType: deployment.app.sourceType,
        defaultPort: deployment.app.defaultPort,
        repoUrl: deployment.app.repoUrl,
        branch: deployment.app.branch,
        buildContext: deployment.app.buildContext,
      },
      deployment: {
        id: deployment.id,
        namespace: deployment.namespace,
        image: deployment.image,
        replicas: deployment.replicas,
        desiredReplicas: deployment.desiredReplicas,
        lastNonZeroReplicas: deployment.lastNonZeroReplicas,
        port: deployment.port,
        status: deployment.status,
        kubernetesDeployment: deployment.kubernetesDeployment,
        kubernetesService: deployment.kubernetesService,
        stoppedAt: deployment.stoppedAt,
        lastRestartedAt: deployment.lastRestartedAt,
        deletedAt: deployment.deletedAt,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
      },
      build: deployment.build
        ? {
            id: deployment.build.id,
            status: deployment.build.status,
            strategy: deployment.build.strategy,
            image: deployment.build.image,
            repoUrl: deployment.build.repoUrl,
            branch: deployment.build.branch,
            buildContext: deployment.build.buildContext,
            dockerfilePath: deployment.build.dockerfilePath,
            kubernetesJob: deployment.build.kubernetesJob,
            errorMessage: deployment.build.errorMessage,
            createdAt: deployment.build.createdAt,
            updatedAt: deployment.build.updatedAt,
          }
        : null,
      runtimeConfigs: deployment.runtimeConfigs.map(sanitizeRuntimeConfig),
      kubernetes: {
        status,
        pods,
        events,
        logs,
      },
      healthSamples,
    };
  }

  // Stores the current live evidence bundle as an RCA-ready snapshot.
  async createSnapshot(deploymentId: string) {
    const evidence = await this.collectLive(deploymentId);

    return this.prisma.evidenceSnapshot.create({
      data: {
        deploymentId,
        status: evidence.status,
        summary: evidence.summary,
        data: toPrismaJson(evidence),
      },
    });
  }

  // Lists snapshot metadata for one deployment without returning large evidence JSON.
  async listSnapshots(deploymentId: string) {
    await this.ensureDeploymentExists(deploymentId);

    return this.prisma.evidenceSnapshot.findMany({
      where: { deploymentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deploymentId: true,
        status: true,
        summary: true,
        createdAt: true,
      },
    });
  }

  // Returns one full stored evidence snapshot.
  async getSnapshot(id: string) {
    const snapshot = await this.prisma.evidenceSnapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      throw new NotFoundException(`Evidence snapshot ${id} was not found`);
    }

    return snapshot;
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

  private async findDeploymentForEvidence(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        app: true,
        build: true,
        runtimeConfigs: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} was not found`);
    }

    return deployment;
  }
}

async function collectOrError<T>(
  collect: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await collect();
  } catch (error) {
    return {
      error: getErrorMessage(error),
    };
  }
}

function deriveEvidenceStatus(
  deploymentStatus: string,
  liveStatus: unknown,
): string {
  if (isCollectionError(liveStatus)) {
    return deploymentStatus;
  }

  if (
    isRecord(liveStatus) &&
    typeof liveStatus.readyReplicas === 'number' &&
    typeof liveStatus.desiredReplicas === 'number' &&
    liveStatus.desiredReplicas > 0 &&
    liveStatus.readyReplicas >= liveStatus.desiredReplicas
  ) {
    return 'running';
  }

  return deploymentStatus;
}

function buildEvidenceSummary(
  status: string,
  liveStatus: unknown,
  pods: unknown,
  events: unknown,
): string {
  if (isCollectionError(liveStatus)) {
    return `Evidence collected with status lookup error: ${liveStatus.error}`;
  }

  const podCount = Array.isArray(pods) ? pods.length : 0;
  const warningEvents = Array.isArray(events)
    ? events.filter((event) => isRecord(event) && event.type === 'Warning').length
    : 0;

  return `Deployment evidence collected with status ${status}, ${podCount} pod(s), and ${warningEvents} warning event(s).`;
}

function sanitizeRuntimeConfig(runtimeConfig: {
  id: string;
  type: RuntimeConfigType;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  if (runtimeConfig.type !== RuntimeConfigType.secret) {
    return runtimeConfig;
  }

  return {
    ...runtimeConfig,
    data: redactSecretRuntimeConfig(runtimeConfig.data),
  };
}

function redactSecretRuntimeConfig(data: unknown): {
  envKeys: string[];
  filePaths: string[];
} {
  if (!isRecord(data)) {
    return {
      envKeys: [],
      filePaths: [],
    };
  }

  return {
    envKeys: Array.isArray(data.envKeys)
      ? data.envKeys.map(String)
      : isRecord(data.env)
        ? Object.keys(data.env)
        : [],
    filePaths: Array.isArray(data.filePaths)
      ? data.filePaths.map(String)
      : isRecord(data.files)
        ? Object.keys(data.files)
        : [],
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function isCollectionError(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}
