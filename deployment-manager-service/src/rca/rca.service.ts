import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IncidentSeverity,
  IncidentSource,
  RcaRunSource,
  RcaRunStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Starts an RCA run. Phase 10 stores run metadata only; context/evidence stay ephemeral in the MCP server.
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
        status: RcaRunStatus.pending,
      },
      include: {
        incident: true,
        deployment: true,
      },
    });

    this.triggerAgentRun(run.id, incident.id).catch((error) => {
      this.logger.warn(
        `Failed to trigger RCA agent for run ${run.id}: ${getErrorMessage(error)}`,
      );
    });

    return run;
  }

  // Creates a manual incident for a deployment, then creates an RCA run for it.
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

  // Returns one RCA run with incident and deployment metadata.
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
      rcaEvidenceLookbackMinutes:
        this.configService.get<number>('rcaEvidenceLookbackMinutes') ?? 10,
      rcaEvidenceLookaheadMinutes:
        this.configService.get<number>('rcaEvidenceLookaheadMinutes') ?? 2,
      rcaMcpServerUrl: this.configService.get<string>('rcaMcpServerUrl'),
      rcaAgentServiceUrl: this.configService.get<string>('rcaAgentServiceUrl'),
      rcaAgentEnabled:
        this.configService.get<boolean>('rcaAgentEnabled') ?? true,
      rcaAgentTriggerMode:
        this.configService.get<string>('rcaAgentTriggerMode') ?? 'async',
      placeholderEngine: false,
      evidenceContextPersistence: 'none',
    };
  }

  private async triggerAgentRun(
    runId: string,
    incidentId: string,
  ): Promise<void> {
    const enabled = this.configService.get<boolean>('rcaAgentEnabled') ?? true;
    const triggerMode =
      this.configService.get<string>('rcaAgentTriggerMode') ?? 'async';

    if (!enabled || triggerMode !== 'async') {
      return;
    }

    const baseUrl = this.configService.get<string>('rcaAgentServiceUrl');
    if (!baseUrl) {
      this.logger.warn('RCA agent service URL is not configured');
      return;
    }

    const response = await fetch(`${baseUrl}/rca-agent/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, incidentId }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `RCA agent returned ${response.status} ${response.statusText}: ${body}`,
      );
    }
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
      select: {
        id: true,
        deploymentId: true,
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} was not found`);
    }

    return incident;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeRcaRunSource(
  source: keyof typeof RcaRunSource | RcaRunSource,
): RcaRunSource {
  return source === 'automatic' ? RcaRunSource.automatic : RcaRunSource.manual;
}
