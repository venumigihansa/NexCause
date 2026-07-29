import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IncidentSeverity,
  IncidentSource,
  RcaRunSource,
  RcaRunStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { InternalTokenService } from "../auth/internal-token.service";

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly internalTokens: InternalTokenService,
  ) {}

  // Starts an RCA run. Phase 10 stores run metadata only; context/evidence stay ephemeral in the MCP server.
  async startForIncident(
    incidentId: string,
    source: keyof typeof RcaRunSource | RcaRunSource = RcaRunSource.manual,
  ) {
    const run = await this.prisma.withTenantTransaction(async (tx) => {
      const incident = await tx.incident.findUnique({
        where: { id: incidentId },
        select: { id: true, deploymentId: true },
      });
      if (!incident) {
        throw new NotFoundException(`Incident ${incidentId} was not found`);
      }

      const created = await tx.rcaRun.create({
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
      await tx.rcaRunEvent.create({
        data: {
          rcaRunId: created.id,
          type: "run.created",
          data: { source: created.source },
        },
      });
      return created;
    });

    this.triggerAgentRun(run.workspaceId, run.id, run.incidentId).catch(
      (error) => {
        this.logger.warn(
          `Failed to trigger RCA agent for run ${run.id}: ${getErrorMessage(error)}`,
        );
      },
    );

    return run;
  }

  // Creates a manual incident for a deployment, then creates an RCA run for it.
  async startForDeployment(deploymentId: string) {
    const run = await this.prisma.withTenantTransaction(async (tx) => {
      const deployment = await tx.deployment.findUnique({
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

      const incident = await tx.incident.create({
        data: {
          appId: deployment.appId,
          deploymentId: deployment.id,
          source: IncidentSource.manual,
          severity: IncidentSeverity.warning,
          title: `Manual RCA requested for ${deployment.kubernetesDeployment}`,
          summary:
            "Manual RCA run was requested without a pre-existing incident.",
          metadata: {
            deploymentName: deployment.kubernetesDeployment,
            createdBy: "manual-rca-api",
          },
        },
      });
      const created = await tx.rcaRun.create({
        data: {
          incidentId: incident.id,
          deploymentId: deployment.id,
          source: RcaRunSource.manual,
          status: RcaRunStatus.pending,
        },
        include: {
          incident: true,
          deployment: true,
        },
      });
      await tx.rcaRunEvent.create({
        data: {
          rcaRunId: created.id,
          type: "run.created",
          data: { source: created.source },
        },
      });
      return created;
    });

    this.triggerAgentRun(run.workspaceId, run.id, run.incidentId).catch(
      (error) => {
        this.logger.warn(
          `Failed to trigger RCA agent for run ${run.id}: ${getErrorMessage(error)}`,
        );
      },
    );
    return run;
  }

  // Lists RCA runs for one incident.
  async findByIncident(incidentId: string) {
    await this.ensureIncidentExists(incidentId);

    return this.prisma.rcaRun.findMany({
      where: { incidentId },
      orderBy: { createdAt: "desc" },
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
        this.configService.get<boolean>("incidentDetectionEnabled") ?? true,
      incidentDetectionIntervalSeconds:
        this.configService.get<number>("incidentDetectionIntervalSeconds") ??
        60,
      autoRcaEnabled: this.configService.get<boolean>("autoRcaEnabled") ?? true,
      rcaEvidenceLookbackMinutes:
        this.configService.get<number>("rcaEvidenceLookbackMinutes") ?? 10,
      rcaEvidenceLookaheadMinutes:
        this.configService.get<number>("rcaEvidenceLookaheadMinutes") ?? 2,
      rcaMcpServerUrl: this.configService.get<string>("rcaMcpServerUrl"),
      rcaAgentServiceUrl: this.configService.get<string>("rcaAgentServiceUrl"),
      rcaAgentEnabled:
        this.configService.get<boolean>("rcaAgentEnabled") ?? true,
      rcaAgentTriggerMode:
        this.configService.get<string>("rcaAgentTriggerMode") ?? "async",
      placeholderEngine: false,
      evidenceContextPersistence: "none",
    };
  }

  async listChat(runId: string) {
    const run = await this.findOne(runId);
    return this.callAgent(
      run.workspaceId,
      run.id,
      run.incidentId,
      `/rca-agent/runs/${run.id}/chat`,
      { method: "GET" },
    );
  }

  async chat(runId: string, message: string) {
    const run = await this.findOne(runId);
    return this.callAgent(
      run.workspaceId,
      run.id,
      run.incidentId,
      `/rca-agent/runs/${run.id}/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      },
    );
  }

  private async triggerAgentRun(
    workspaceId: string,
    runId: string,
    incidentId: string,
  ): Promise<void> {
    const enabled = this.configService.get<boolean>("rcaAgentEnabled") ?? true;
    const triggerMode =
      this.configService.get<string>("rcaAgentTriggerMode") ?? "async";

    if (!enabled || triggerMode !== "async") {
      return;
    }

    const baseUrl = this.configService.get<string>("rcaAgentServiceUrl");
    if (!baseUrl) {
      this.logger.warn("RCA agent service URL is not configured");
      return;
    }

    const token = await this.internalTokens.sign("rca-agent", {
      workspaceId,
      runId,
      incidentId,
    });
    const response = await fetch(`${baseUrl}/rca-agent/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workspaceId, runId, incidentId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `RCA agent returned ${response.status} ${response.statusText}: ${body}`,
      );
    }
  }

  private async callAgent(
    workspaceId: string,
    runId: string,
    incidentId: string,
    path: string,
    init: RequestInit,
  ) {
    const baseUrl = this.configService.get<string>("rcaAgentServiceUrl");
    if (!baseUrl) {
      throw new Error("RCA agent service URL is not configured");
    }
    const token = await this.internalTokens.sign("rca-agent", {
      workspaceId,
      runId,
      incidentId,
    });
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`RCA agent returned ${response.status}`);
    }
    return response.json();
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
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeRcaRunSource(
  source: keyof typeof RcaRunSource | RcaRunSource,
): RcaRunSource {
  return source === "automatic" ? RcaRunSource.automatic : RcaRunSource.manual;
}
