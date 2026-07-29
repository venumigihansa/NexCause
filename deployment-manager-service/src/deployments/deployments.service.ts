import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BuildStatus,
  Deployment,
  DeploymentStatus,
  Prisma,
  RuntimeConfigType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppsService } from "../apps/apps.service";
import { AuthorizationService } from "../auth/authorization.service";
import { PrismaService } from "../database/prisma.service";
import { TenantContextService } from "../database/tenant-context.service";
import { KubernetesService } from "../kubernetes/kubernetes.service";
import { KubernetesResourceNames } from "../kubernetes/types/kubernetes-resource-names";
import { ObservabilityService } from "../observability/observability.service";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { ScaleDeploymentDto } from "./dto/scale-deployment.dto";
import { StartDeploymentDto } from "./dto/start-deployment.dto";

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly appsService: AppsService,
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
    private readonly observabilityService: ObservabilityService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  // Creates a deployment record, then creates the matching Kubernetes resources.
  async create(appId: string, createDeploymentDto: CreateDeploymentDto) {
    if (
      Object.keys(createDeploymentDto.secrets ?? {}).length > 0 ||
      Object.keys(createDeploymentDto.secretFiles ?? {}).length > 0
    ) {
      this.authorization.requirePermissions("secrets:write");
    }
    const app = await this.appsService.findOneOrThrow(appId);
    const deploymentId = randomUUID();
    const image = await this.resolveDeploymentImage(appId, createDeploymentDto);
    const port = createDeploymentDto.port ?? app.defaultPort;
    const workspaceId = this.tenantContext.requireWorkspaceId();
    const namespace = await this.workspaceNamespace(workspaceId);
    const replicas = createDeploymentDto.replicas ?? 1;
    const secrets = normalizeEnv(createDeploymentDto.secrets ?? {});
    const files = normalizeFileConfig(createDeploymentDto.files ?? {});
    const secretFiles = normalizeFileConfig(
      createDeploymentDto.secretFiles ?? {},
    );
    const names = this.kubernetesService.buildResourceNames(
      app.name,
      deploymentId,
    );
    const labels = this.kubernetesService.buildManagedLabels(
      workspaceId,
      app.id,
      deploymentId,
    );
    const env = {
      ...normalizeEnv(createDeploymentDto.env ?? {}),
      ...this.observabilityService.buildTelemetryEnv({
        appId: app.id,
        appName: app.name,
        deploymentId,
        deploymentName: names.deploymentName,
        namespace,
      }),
    };
    const runtimeConfigRecords = buildRuntimeConfigRecords(
      env,
      secrets,
      files.raw,
      secretFiles.raw,
    );

    if (!port) {
      throw new BadRequestException(
        "Deployment port is required when the app has no default port",
      );
    }

    const deployment = await this.prisma.deployment.create({
      data: {
        id: deploymentId,
        appId: app.id,
        buildId: createDeploymentDto.buildId,
        namespace,
        image,
        replicas,
        desiredReplicas: replicas,
        lastNonZeroReplicas: replicas > 0 ? replicas : undefined,
        port,
        status: DeploymentStatus.creating,
        kubernetesDeployment: names.deploymentName,
        kubernetesService: names.serviceName,
        kubernetesConfigMap: names.configMapName,
        kubernetesFileConfigMap: names.fileConfigMapName,
        kubernetesSecret: names.secretName,
        kubernetesSecretFiles: names.secretFileSecretName,
        ...(runtimeConfigRecords.length > 0
          ? {
              runtimeConfigs: {
                create: runtimeConfigRecords,
              },
            }
          : {}),
      },
      include: {
        runtimeConfigs: true,
      },
    });

    try {
      await this.kubernetesService.deployImage({
        namespace,
        names,
        image,
        port,
        replicas,
        env,
        secrets,
        files,
        secretFiles,
        labels,
      });
    } catch (error) {
      await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: DeploymentStatus.failed },
      });

      throw error;
    }

    return sanitizeDeployment(deployment);
  }

  // Returns all deployments for an app after confirming the app exists.
  async findByApp(appId: string) {
    await this.appsService.findOneOrThrow(appId);

    const deployments = await this.prisma.deployment.findMany({
      where: { appId },
      orderBy: { createdAt: "desc" },
      include: {
        runtimeConfigs: true,
      },
    });

    return deployments.map(sanitizeDeployment);
  }

  // Reads live Kubernetes status and updates the stored status when ready.
  async getStatus(id: string) {
    const deployment = await this.findOneOrThrow(id);

    if (deployment.status === DeploymentStatus.deleted) {
      return {
        deploymentId: deployment.id,
        status: DeploymentStatus.deleted,
        desiredReplicas: deployment.desiredReplicas,
        readyReplicas: 0,
      };
    }

    const liveStatus = await this.kubernetesService.getDeploymentStatus(
      deployment.namespace,
      deployment.kubernetesDeployment,
    );
    const nextStatus =
      liveStatus.readyReplicas >= liveStatus.desiredReplicas &&
      liveStatus.desiredReplicas > 0
        ? DeploymentStatus.running
        : deployment.status;

    if (nextStatus !== deployment.status) {
      await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: nextStatus },
      });
    }

    return {
      deploymentId: deployment.id,
      status: nextStatus,
      ...liveStatus,
    };
  }

  // Finds pods for a deployment by labels and returns their logs.
  async getLogs(id: string) {
    const deployment = await this.findOneOrThrow(id);
    const labels = this.getManagedLabels(deployment);

    return this.kubernetesService.getDeploymentLogs(
      deployment.namespace,
      labels,
    );
  }

  // Lists pods currently selected by this deployment's managed labels.
  async getPods(id: string) {
    const deployment = await this.findOneOrThrow(id);

    return this.kubernetesService.listDeploymentPods(
      deployment.namespace,
      this.getManagedLabels(deployment),
    );
  }

  // Lists Kubernetes events related to the Deployment and its pods.
  async getEvents(id: string) {
    const deployment = await this.findOneOrThrow(id);

    return this.kubernetesService.listDeploymentEvents(
      deployment.namespace,
      deployment.kubernetesDeployment,
      this.getManagedLabels(deployment),
    );
  }

  // Changes the desired replica count for a running Kubernetes Deployment.
  async scale(id: string, scaleDeploymentDto: ScaleDeploymentDto) {
    const deployment = await this.findOneOrThrow(id);
    const replicas = scaleDeploymentDto.replicas;

    await this.kubernetesService.scaleDeployment(
      deployment.namespace,
      deployment.kubernetesDeployment,
      replicas,
    );

    return this.prisma.deployment.update({
      where: { id },
      data: {
        replicas,
        desiredReplicas: replicas,
        lastNonZeroReplicas:
          replicas > 0 ? replicas : deployment.lastNonZeroReplicas,
        status:
          replicas === 0 ? DeploymentStatus.stopped : DeploymentStatus.creating,
        stoppedAt: replicas === 0 ? new Date() : null,
      },
    });
  }

  // Stops a deployment without deleting Kubernetes resources by scaling to zero.
  async stop(id: string) {
    const deployment = await this.findOneOrThrow(id);

    await this.kubernetesService.scaleDeployment(
      deployment.namespace,
      deployment.kubernetesDeployment,
      0,
    );

    return this.prisma.deployment.update({
      where: { id },
      data: {
        replicas: 0,
        desiredReplicas: 0,
        lastNonZeroReplicas:
          deployment.replicas > 0
            ? deployment.replicas
            : deployment.lastNonZeroReplicas,
        status: DeploymentStatus.stopped,
        stoppedAt: new Date(),
      },
    });
  }

  // Starts a stopped deployment by restoring the last non-zero replica count.
  async start(id: string, startDeploymentDto: StartDeploymentDto = {}) {
    const deployment = await this.findOneOrThrow(id);
    const replicas =
      startDeploymentDto.replicas ??
      deployment.lastNonZeroReplicas ??
      (deployment.desiredReplicas > 0 ? deployment.desiredReplicas : 1);

    await this.kubernetesService.scaleDeployment(
      deployment.namespace,
      deployment.kubernetesDeployment,
      replicas,
    );

    return this.prisma.deployment.update({
      where: { id },
      data: {
        replicas,
        desiredReplicas: replicas,
        lastNonZeroReplicas: replicas,
        status: DeploymentStatus.creating,
        stoppedAt: null,
      },
    });
  }

  // Triggers a Kubernetes rollout restart for the existing Deployment.
  async restart(id: string) {
    const deployment = await this.findOneOrThrow(id);
    const restartedAt = await this.kubernetesService.restartDeployment(
      deployment.namespace,
      deployment.kubernetesDeployment,
    );

    return this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.creating,
        lastRestartedAt: new Date(restartedAt),
      },
    });
  }

  // Removes Kubernetes resources and keeps the DB record as deleted history.
  async delete(id: string) {
    const deployment = await this.findOneOrThrow(id);
    const names = deploymentToResourceNames(deployment);

    await this.kubernetesService.deleteDeploymentResources(
      deployment.namespace,
      names,
    );

    return this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.deleted,
        deletedAt: new Date(),
      },
    });
  }

  private getManagedLabels(deployment: Deployment): Record<string, string> {
    return this.kubernetesService.buildManagedLabels(
      deployment.workspaceId,
      deployment.appId,
      deployment.id,
    );
  }

  private async workspaceNamespace(workspaceId: string): Promise<string> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { kubernetesNamespace: true },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace was not found");
    }
    return workspace.kubernetesNamespace;
  }

  private async resolveDeploymentImage(
    appId: string,
    createDeploymentDto: CreateDeploymentDto,
  ): Promise<string> {
    if (createDeploymentDto.image && createDeploymentDto.buildId) {
      throw new BadRequestException(
        "Provide either image or buildId, not both",
      );
    }

    if (!createDeploymentDto.image && !createDeploymentDto.buildId) {
      throw new BadRequestException("Either image or buildId is required");
    }

    if (createDeploymentDto.image) {
      return createDeploymentDto.image;
    }

    const build = await this.prisma.build.findUnique({
      where: { id: createDeploymentDto.buildId },
    });

    if (!build) {
      throw new NotFoundException(
        `Build ${createDeploymentDto.buildId} was not found`,
      );
    }

    if (build.appId !== appId) {
      throw new BadRequestException("Build does not belong to this app");
    }

    if (build.status !== BuildStatus.succeeded) {
      throw new BadRequestException(
        "Build must be succeeded before deployment",
      );
    }

    if (!build.image) {
      throw new BadRequestException("Build has no deployable image");
    }

    return build.image;
  }

  // Loads one deployment from Postgres or throws a 404 for API callers.
  private async findOneOrThrow(id: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        runtimeConfigs: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${id} was not found`);
    }

    return deployment;
  }
}

function normalizeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, String(value)]),
  );
}

function normalizeFileConfig(files: Record<string, string>): {
  raw: Record<string, string>;
  data: Record<string, string>;
  items: Array<{ key: string; path: string }>;
} {
  const entries = Object.entries(files);
  const raw = Object.fromEntries(
    entries.map(([path, value]) => {
      validateRelativeFilePath(path);
      return [path, String(value)];
    }),
  );

  return {
    raw,
    data: Object.fromEntries(
      entries.map(([path, value], index) => [`file-${index}`, String(value)]),
    ),
    items: entries.map(([path], index) => ({
      key: `file-${index}`,
      path,
    })),
  };
}

function validateRelativeFilePath(path: string): void {
  if (path.startsWith("/") || path.includes("..")) {
    throw new BadRequestException(
      "File config paths must be relative and cannot contain ..",
    );
  }

  if (!path.trim()) {
    throw new BadRequestException("File config paths cannot be empty");
  }
}

function buildRuntimeConfigRecords(
  env: Record<string, string>,
  secrets: Record<string, string>,
  files: Record<string, string>,
  secretFiles: Record<string, string>,
): Array<{ type: RuntimeConfigType; data: Prisma.InputJsonObject }> {
  const records: Array<{
    type: RuntimeConfigType;
    data: Prisma.InputJsonObject;
  }> = [];

  if (Object.keys(env).length > 0) {
    records.push({
      type: RuntimeConfigType.env,
      data: env as Prisma.InputJsonObject,
    });
  }

  if (Object.keys(secrets).length > 0 || Object.keys(secretFiles).length > 0) {
    records.push({
      type: RuntimeConfigType.secret,
      data: {
        envKeys: Object.keys(secrets),
        filePaths: Object.keys(secretFiles),
      } as Prisma.InputJsonObject,
    });
  }

  if (Object.keys(files).length > 0) {
    records.push({
      type: RuntimeConfigType.file,
      data: files as Prisma.InputJsonObject,
    });
  }

  return records;
}

function sanitizeDeployment<
  T extends {
    runtimeConfigs?: Array<{ type: RuntimeConfigType; data: unknown }>;
  },
>(deployment: T): T {
  if (!deployment.runtimeConfigs) {
    return deployment;
  }

  return {
    ...deployment,
    runtimeConfigs: deployment.runtimeConfigs.map((runtimeConfig) => {
      if (runtimeConfig.type !== RuntimeConfigType.secret) {
        return runtimeConfig;
      }

      return {
        ...runtimeConfig,
        data: redactSecretRuntimeConfig(runtimeConfig.data),
      };
    }),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deploymentToResourceNames(
  deployment: Deployment,
): KubernetesResourceNames {
  if (!deployment.kubernetesConfigMap) {
    throw new BadRequestException(
      "Deployment has no Kubernetes ConfigMap name",
    );
  }

  return {
    deploymentName: deployment.kubernetesDeployment,
    serviceName: deployment.kubernetesService,
    configMapName: deployment.kubernetesConfigMap,
    fileConfigMapName: deployment.kubernetesFileConfigMap ?? undefined,
    secretName: deployment.kubernetesSecret ?? undefined,
    secretFileSecretName: deployment.kubernetesSecretFiles ?? undefined,
  };
}
