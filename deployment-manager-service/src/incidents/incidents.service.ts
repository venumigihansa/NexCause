import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeploymentHealthSample,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RcaService } from '../rca/rca.service';
import { CreateIncidentDto } from './dto/create-incident.dto';

interface IncidentSignal {
  ruleKey: string;
  severity: IncidentSeverity;
  title: string;
  summary: string;
}

@Injectable()
export class IncidentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentsService.name);
  private detectionTimer?: NodeJS.Timeout;
  private isDetecting = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rcaService: RcaService,
  ) {}

  onModuleInit() {
    if (!this.isDetectionEnabled()) {
      return;
    }

    const intervalSeconds = this.getDetectionIntervalSeconds();

    if (intervalSeconds <= 0) {
      return;
    }

    this.detectionTimer = setInterval(() => {
      void this.detectIncidents();
    }, intervalSeconds * 1000);

    void this.detectIncidents();
  }

  onModuleDestroy() {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
    }
  }

  // Lists incidents, optionally filtered by status.
  async findAll(status?: IncidentStatus) {
    return this.prisma.incident.findMany({
      where: status ? { status } : undefined,
      orderBy: { openedAt: 'desc' },
      include: {
        app: true,
        deployment: true,
        latestHealthSample: true,
        rcaRuns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  // Returns one incident and its RCA run history.
  async findOne(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        app: true,
        deployment: true,
        latestHealthSample: true,
        rcaRuns: {
          orderBy: { createdAt: 'desc' },
          include: {
            evidenceSnapshot: true,
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${id} was not found`);
    }

    return incident;
  }

  // Manually creates an incident for one deployment.
  async createManualIncident(
    deploymentId: string,
    createIncidentDto: CreateIncidentDto,
  ) {
    const deployment = await this.findDeployment(deploymentId);
    const incident = await this.prisma.incident.create({
      data: {
        appId: deployment.appId,
        deploymentId: deployment.id,
        source: IncidentSource.manual,
        severity: createIncidentDto.severity ?? IncidentSeverity.warning,
        title:
          createIncidentDto.title ??
          `Manual incident for ${deployment.kubernetesDeployment}`,
        summary: createIncidentDto.summary,
        metadata: {
          deploymentName: deployment.kubernetesDeployment,
          createdBy: 'manual-api',
        },
      },
    });

    return incident;
  }

  // Resolves an open incident.
  async resolve(id: string) {
    await this.findOne(id);

    return this.prisma.incident.update({
      where: { id },
      data: {
        status: IncidentStatus.resolved,
        resolvedAt: new Date(),
      },
    });
  }

  // Creates an automatic incident when the newest health sample shows a problem.
  async detectIncidents() {
    if (this.isDetecting) {
      return;
    }

    this.isDetecting = true;

    try {
      const deploymentIds = await this.getDeploymentIdsWithRecentSamples();

      await Promise.all(
        deploymentIds.map((deploymentId) =>
          this.detectDeploymentIncidents(deploymentId).catch((error) => {
            this.logger.warn(
              `Failed to detect incidents for deployment ${deploymentId}: ${getErrorMessage(error)}`,
            );
          }),
        ),
      );
    } finally {
      this.isDetecting = false;
    }
  }

  private async detectDeploymentIncidents(deploymentId: string) {
    const samples = await this.prisma.deploymentHealthSample.findMany({
      where: { deploymentId },
      orderBy: { collectedAt: 'desc' },
      take: 2,
      include: {
        deployment: true,
      },
    });

    const latest = samples[0];

    if (!latest) {
      return;
    }

    const previous = samples[1];
    const signals = buildSignals(latest, previous);

    await Promise.all(
      signals.map((signal) => this.openAutomaticIncident(latest, signal)),
    );
  }

  private async openAutomaticIncident(
    sample: DeploymentHealthSample & {
      deployment: { appId: string; kubernetesDeployment: string };
    },
    signal: IncidentSignal,
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: {
        deploymentId: sample.deploymentId,
        status: IncidentStatus.open,
        ruleKey: signal.ruleKey,
      },
    });

    if (existing) {
      await this.prisma.incident.update({
        where: { id: existing.id },
        data: {
          severity: signal.severity,
          summary: signal.summary,
          latestHealthSampleId: sample.id,
          metadata: buildIncidentMetadata(sample, signal),
        },
      });
      return;
    }

    const incident = await this.prisma.incident.create({
      data: {
        appId: sample.deployment.appId,
        deploymentId: sample.deploymentId,
        source: IncidentSource.automatic,
        severity: signal.severity,
        ruleKey: signal.ruleKey,
        title: signal.title,
        summary: signal.summary,
        latestHealthSampleId: sample.id,
        metadata: buildIncidentMetadata(sample, signal),
      },
    });

    if (this.isAutoRcaEnabled()) {
      await this.rcaService.startForIncident(incident.id, 'automatic');
    }
  }

  private async getDeploymentIdsWithRecentSamples(): Promise<string[]> {
    const samples = await this.prisma.deploymentHealthSample.findMany({
      where: {
        collectedAt: {
          gte: minutesAgo(10),
        },
      },
      distinct: ['deploymentId'],
      select: { deploymentId: true },
      orderBy: { deploymentId: 'asc' },
    });

    return samples.map((sample) => sample.deploymentId);
  }

  private async findDeployment(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        appId: true,
        kubernetesDeployment: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} was not found`);
    }

    return deployment;
  }

  private isDetectionEnabled(): boolean {
    return this.configService.get<boolean>('incidentDetectionEnabled') ?? true;
  }

  private isAutoRcaEnabled(): boolean {
    return this.configService.get<boolean>('autoRcaEnabled') ?? true;
  }

  private getDetectionIntervalSeconds(): number {
    return this.configService.get<number>('incidentDetectionIntervalSeconds') ?? 60;
  }
}

function buildSignals(
  latest: DeploymentHealthSample,
  previous?: DeploymentHealthSample,
): IncidentSignal[] {
  const signals: IncidentSignal[] = [];

  if (
    latest.desiredReplicas > 0 &&
    latest.readyReplicas < latest.desiredReplicas
  ) {
    signals.push({
      ruleKey: 'ready-replicas-below-desired',
      severity: IncidentSeverity.critical,
      title: 'Deployment has unavailable replicas',
      summary: `Ready replicas ${latest.readyReplicas}/${latest.desiredReplicas}.`,
    });
  }

  if (latest.warningEventCount > 0) {
    signals.push({
      ruleKey: 'kubernetes-warning-events',
      severity: IncidentSeverity.warning,
      title: 'Deployment has Kubernetes warning events',
      summary: `${latest.warningEventCount} warning event(s) were observed in the latest health sample.`,
    });
  }

  if (previous && latest.restartCount > previous.restartCount) {
    signals.push({
      ruleKey: 'container-restarts-increased',
      severity: IncidentSeverity.warning,
      title: 'Container restart count increased',
      summary: `Container restarts increased from ${previous.restartCount} to ${latest.restartCount}.`,
    });
  }

  if (latest.status === 'failed' || latest.status === 'warning') {
    signals.push({
      ruleKey: `health-status-${latest.status}`,
      severity:
        latest.status === 'failed'
          ? IncidentSeverity.critical
          : IncidentSeverity.warning,
      title: `Deployment health status is ${latest.status}`,
      summary: `Latest health sample status is ${latest.status}.`,
    });
  }

  return signals;
}

function buildIncidentMetadata(
  sample: DeploymentHealthSample & {
    deployment: { kubernetesDeployment: string };
  },
  signal: IncidentSignal,
): Prisma.InputJsonObject {
  return {
    ruleKey: signal.ruleKey,
    deploymentName: sample.deployment.kubernetesDeployment,
    healthSampleId: sample.id,
    sampleStatus: sample.status,
    desiredReplicas: sample.desiredReplicas,
    readyReplicas: sample.readyReplicas,
    availableReplicas: sample.availableReplicas,
    podCount: sample.podCount,
    warningEventCount: sample.warningEventCount,
    restartCount: sample.restartCount,
    collectedAt: sample.collectedAt.toISOString(),
  };
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
