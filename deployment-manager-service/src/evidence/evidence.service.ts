import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RuntimeConfigType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface EvidenceWindowOptions {
  triggeredAt?: Date;
  windowStart?: Date;
  windowEnd?: Date;
  lookbackMinutes?: number;
  lookaheadMinutes?: number;
  reason?: string;
}

interface EvidenceWindow {
  triggeredAt: Date;
  start: Date;
  end: Date;
  lookbackMinutes: number;
  lookaheadMinutes: number;
  reason: string;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kubernetesService: KubernetesService,
  ) {}

  // Collects live Kubernetes and database evidence for one deployment.
  async collectLive(
    deploymentId: string,
    windowOptions: EvidenceWindowOptions = {},
  ) {
    const deployment = await this.findDeploymentForEvidence(deploymentId);
    const labels = this.kubernetesService.buildManagedLabels(
      deployment.appId,
      deployment.id,
    );
    const collectedAt = new Date();
    const window = buildEvidenceWindow(windowOptions, collectedAt);
    const sinceSeconds = secondsBetween(window.start, collectedAt);
    const [status, pods, rawEvents, rawLogs, healthSamples] = await Promise.all([
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
          500,
          sinceSeconds,
        ),
      ),
      this.prisma.deploymentHealthSample.findMany({
        where: {
          deploymentId: deployment.id,
          collectedAt: {
            gte: window.start,
            lte: window.end,
          },
        },
        orderBy: { collectedAt: 'desc' },
        take: 120,
      }),
    ]);
    const events = filterEventsByWindow(rawEvents, window);
    const logs = filterLogsByWindow(rawLogs, window);

    const evidenceStatus = deriveEvidenceStatus(deployment.status, status);

    return {
      deploymentId: deployment.id,
      status: evidenceStatus,
      summary: buildEvidenceSummary(evidenceStatus, status, pods, events),
      collectedAt: collectedAt.toISOString(),
      incidentWindow: {
        triggeredAt: window.triggeredAt.toISOString(),
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        lookbackMinutes: window.lookbackMinutes,
        lookaheadMinutes: window.lookaheadMinutes,
        reason: window.reason,
      },
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
  async createSnapshot(
    deploymentId: string,
    windowOptions: EvidenceWindowOptions = {},
  ) {
    const evidence = await this.collectLive(deploymentId, windowOptions);

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

function buildEvidenceWindow(
  options: EvidenceWindowOptions,
  collectedAt: Date,
): EvidenceWindow {
  const lookbackMinutes = options.lookbackMinutes ?? 10;
  const lookaheadMinutes = options.lookaheadMinutes ?? 2;
  const triggeredAt = options.triggeredAt ?? collectedAt;
  const start =
    options.windowStart ??
    new Date(triggeredAt.getTime() - lookbackMinutes * 60 * 1000);
  const requestedEnd =
    options.windowEnd ??
    new Date(triggeredAt.getTime() + lookaheadMinutes * 60 * 1000);
  const end =
    requestedEnd.getTime() > collectedAt.getTime() ? collectedAt : requestedEnd;

  return {
    triggeredAt,
    start,
    end,
    lookbackMinutes,
    lookaheadMinutes,
    reason: options.reason ?? 'manual-or-current-evidence',
  };
}

function secondsBetween(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 1000));
}

function filterEventsByWindow<T>(
  events: T | { error: string },
  window: EvidenceWindow,
): T | { error: string } {
  if (!Array.isArray(events)) {
    return events;
  }

  return events.filter((event) => {
    if (!isRecord(event)) {
      return false;
    }

    const eventTime =
      parseDateValue(event.eventTime) ??
      parseDateValue(event.lastTimestamp) ??
      parseDateValue(event.firstTimestamp);

    return !eventTime || isWithinWindow(eventTime, window);
  }) as T;
}

function filterLogsByWindow<T>(
  podLogs: T | { error: string },
  window: EvidenceWindow,
): T | { error: string } {
  if (!Array.isArray(podLogs)) {
    return podLogs;
  }

  return podLogs.map((podLog) => {
    if (!isRecord(podLog) || typeof podLog.logs !== 'string') {
      return podLog;
    }

    return {
      ...podLog,
      logs: filterTimestampedLogLines(podLog.logs, window),
    };
  }) as T;
}

function filterTimestampedLogLines(logs: string, window: EvidenceWindow): string {
  return logs
    .split('\n')
    .filter((line) => {
      const timestamp = parseDateValue(line.split(/\s+/, 1)[0]);

      return !timestamp || isWithinWindow(timestamp, window);
    })
    .join('\n');
}

function isWithinWindow(value: Date, window: EvidenceWindow): boolean {
  return (
    value.getTime() >= window.start.getTime() &&
    value.getTime() <= window.end.getTime()
  );
}

function parseDateValue(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
