import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IncidentSeverity,
  IncidentSource,
  Prisma,
  RcaRunSource,
  RcaRunStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';

@Injectable()
export class RcaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly evidenceService: EvidenceService,
    private readonly prisma: PrismaService,
  ) {}

  // Starts an RCA run for an existing incident and stores a placeholder result.
  async startForIncident(
    incidentId: string,
    source: keyof typeof RcaRunSource | RcaRunSource = RcaRunSource.manual,
  ) {
    const incident = await this.findIncidentForRun(incidentId);
    const run = await this.prisma.rcaRun.create({
      data: {
        incidentId: incident.id,
        deploymentId: incident.deploymentId,
        source: normalizeRcaRunSource(source),
        status: RcaRunStatus.running,
        startedAt: new Date(),
      },
    });

    try {
      const evidenceSnapshot = await this.evidenceService.createSnapshot(
        incident.deploymentId,
      );
      const recentHealthSamples = await this.prisma.deploymentHealthSample.findMany({
        where: {
          deploymentId: incident.deploymentId,
          collectedAt: {
            gte: minutesAgo(60),
          },
        },
        orderBy: { collectedAt: 'desc' },
        take: 120,
      });
      const result = buildRcaResult({
        incident,
        evidenceSnapshot,
        recentHealthSamples,
      });

      return this.prisma.rcaRun.update({
        where: { id: run.id },
        data: {
          status: RcaRunStatus.completed,
          evidenceSnapshotId: evidenceSnapshot.id,
          result: result as Prisma.InputJsonObject,
          completedAt: new Date(),
        },
        include: {
          incident: true,
          evidenceSnapshot: true,
        },
      });
    } catch (error) {
      await this.prisma.rcaRun.update({
        where: { id: run.id },
        data: {
          status: RcaRunStatus.failed,
          errorMessage: getErrorMessage(error),
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  // Creates a manual incident for a deployment, then runs RCA for it.
  async startForDeployment(deploymentId: string) {
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

    const incident = await this.prisma.incident.create({
      data: {
        appId: deployment.appId,
        deploymentId: deployment.id,
        source: IncidentSource.manual,
        severity: IncidentSeverity.warning,
        title: `Manual RCA requested for ${deployment.kubernetesDeployment}`,
        summary: 'Manual RCA run was requested without a pre-existing incident.',
        metadata: {
          deploymentName: deployment.kubernetesDeployment,
          createdBy: 'manual-rca-api',
        },
      },
    });

    return this.startForIncident(incident.id, RcaRunSource.manual);
  }

  // Lists RCA runs for one incident.
  async findByIncident(incidentId: string) {
    await this.ensureIncidentExists(incidentId);

    return this.prisma.rcaRun.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
      include: {
        evidenceSnapshot: true,
      },
    });
  }

  // Returns one RCA run with incident and evidence context.
  async findOne(id: string) {
    const run = await this.prisma.rcaRun.findUnique({
      where: { id },
      include: {
        incident: true,
        deployment: true,
        evidenceSnapshot: true,
      },
    });

    if (!run) {
      throw new NotFoundException(`RCA run ${id} was not found`);
    }

    return run;
  }

  getConfig() {
    return {
      incidentDetectionEnabled:
        this.configService.get<boolean>('incidentDetectionEnabled') ?? true,
      incidentDetectionIntervalSeconds:
        this.configService.get<number>('incidentDetectionIntervalSeconds') ?? 60,
      autoRcaEnabled: this.configService.get<boolean>('autoRcaEnabled') ?? true,
      placeholderEngine: true,
    };
  }

  private async ensureIncidentExists(incidentId: string): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} was not found`);
    }
  }

  private async findIncidentForRun(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        app: true,
        deployment: true,
        latestHealthSample: true,
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} was not found`);
    }

    return incident;
  }
}

function buildRcaResult({
  incident,
  evidenceSnapshot,
  recentHealthSamples,
}: {
  incident: Awaited<ReturnType<RcaService['findIncidentForRun']>>;
  evidenceSnapshot: {
    id: string;
    status: string;
    summary: string | null;
    createdAt: Date;
  };
  recentHealthSamples: Array<{
    id: string;
    status: string;
    desiredReplicas: number;
    readyReplicas: number;
    warningEventCount: number;
    restartCount: number;
    collectedAt: Date;
  }>;
}) {
  const newestSample = recentHealthSamples[0];
  const symptoms = buildSymptoms(incident, newestSample);
  const likelyCause = classifyLikelyCause(incident.ruleKey, newestSample);

  return {
    engine: 'deterministic-placeholder',
    generatedAt: new Date().toISOString(),
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      source: incident.source,
      ruleKey: incident.ruleKey,
      summary: incident.summary,
    },
    deployment: {
      id: incident.deployment.id,
      name: incident.deployment.kubernetesDeployment,
      namespace: incident.deployment.namespace,
      image: incident.deployment.image,
      status: incident.deployment.status,
    },
    evidence: {
      snapshotId: evidenceSnapshot.id,
      snapshotStatus: evidenceSnapshot.status,
      snapshotSummary: evidenceSnapshot.summary,
      snapshotCreatedAt: evidenceSnapshot.createdAt,
      healthSampleCount: recentHealthSamples.length,
      latestHealthSampleId: newestSample?.id ?? null,
    },
    symptoms,
    likelyCause,
    recommendedNextChecks: buildRecommendedNextChecks(likelyCause.category),
  };
}

function buildSymptoms(
  incident: { summary: string | null; ruleKey: string | null },
  newestSample:
    | {
        desiredReplicas: number;
        readyReplicas: number;
        warningEventCount: number;
        restartCount: number;
        status: string;
      }
    | undefined,
): string[] {
  const symptoms: string[] = [];

  if (incident.summary) {
    symptoms.push(incident.summary);
  }

  if (!newestSample) {
    symptoms.push('No recent health samples were available.');
    return symptoms;
  }

  if (newestSample.readyReplicas < newestSample.desiredReplicas) {
    symptoms.push(
      `Ready replicas are ${newestSample.readyReplicas}/${newestSample.desiredReplicas}.`,
    );
  }

  if (newestSample.warningEventCount > 0) {
    symptoms.push(
      `${newestSample.warningEventCount} Kubernetes warning event(s) are present.`,
    );
  }

  if (newestSample.restartCount > 0) {
    symptoms.push(`Current total container restart count is ${newestSample.restartCount}.`);
  }

  symptoms.push(`Latest health sample status is ${newestSample.status}.`);

  return [...new Set(symptoms)];
}

function classifyLikelyCause(
  ruleKey: string | null,
  newestSample:
    | {
        readyReplicas: number;
        desiredReplicas: number;
        warningEventCount: number;
        restartCount: number;
      }
    | undefined,
) {
  if (ruleKey === 'container-restarts-increased' || newestSample?.restartCount) {
    return {
      category: 'container-restarts',
      confidence: 'medium',
      explanation:
        'Container restarts increased or are present, so the app process may be crashing or failing health checks.',
    };
  }

  if (ruleKey === 'kubernetes-warning-events' || newestSample?.warningEventCount) {
    return {
      category: 'kubernetes-warning-events',
      confidence: 'medium',
      explanation:
        'Kubernetes warning events were observed; inspect pod events for scheduling, image pull, or probe failures.',
    };
  }

  if (
    ruleKey === 'ready-replicas-below-desired' ||
    (newestSample && newestSample.readyReplicas < newestSample.desiredReplicas)
  ) {
    return {
      category: 'availability',
      confidence: 'medium',
      explanation:
        'The deployment has fewer ready replicas than desired, indicating availability degradation.',
    };
  }

  return {
    category: 'unknown',
    confidence: 'low',
    explanation:
      'The placeholder RCA engine did not find a strong single cause from health samples.',
  };
}

function buildRecommendedNextChecks(category: string): string[] {
  if (category === 'container-restarts') {
    return [
      'Inspect pod logs around the restart time.',
      'Check container exit state and lastState in pod status.',
      'Verify readiness/liveness probe configuration.',
    ];
  }

  if (category === 'kubernetes-warning-events') {
    return [
      'Inspect Kubernetes events in the evidence snapshot.',
      'Check for image pull, scheduling, probe, or volume mount warnings.',
      'Compare warning timestamps with deployment changes.',
    ];
  }

  if (category === 'availability') {
    return [
      'Check pod readiness conditions.',
      'Inspect service endpoints and replica set state.',
      'Review recent deployment rollout or scaling activity.',
    ];
  }

  return [
    'Review evidence snapshot logs, events, and health samples.',
    'Compare latest health samples with previous healthy periods.',
    'Trigger a deeper RCA engine run once agentic RCA is available.',
  ];
}

function normalizeRcaRunSource(
  source: keyof typeof RcaRunSource | RcaRunSource,
): RcaRunSource {
  return source === 'automatic' ? RcaRunSource.automatic : RcaRunSource.manual;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
