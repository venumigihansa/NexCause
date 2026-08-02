import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppSourceType, BuildStatus, BuildStrategy } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppsService } from "../apps/apps.service";
import { PrismaService } from "../database/prisma.service";
import { TenantContextService } from "../database/tenant-context.service";
import { KubernetesService } from "../kubernetes/kubernetes.service";
import { CreateBuildDto } from "./dto/create-build.dto";

@Injectable()
export class BuildsService {
  constructor(
    private readonly appsService: AppsService,
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Creates a build record and starts the matching Kubernetes build Job.
  async create(appId: string, createBuildDto: CreateBuildDto = {}) {
    const app = await this.appsService.findOneOrThrow(appId);

    if (app.sourceType !== AppSourceType.git) {
      throw new BadRequestException("Builds can only be created for git apps");
    }

    if (!app.repoUrl) {
      throw new BadRequestException(
        "Git apps must have a repoUrl before building",
      );
    }

    const buildId = randomUUID();
    const workspaceId = this.tenantContext.requireWorkspaceId();
    const namespace = await this.workspaceNamespace(workspaceId);
    const strategy = createBuildDto.strategy ?? BuildStrategy.dockerfile;
    const branch = createBuildDto.branch ?? app.branch ?? "main";
    const buildContext = createBuildDto.buildContext ?? app.buildContext ?? ".";
    const dockerfilePath =
      strategy === BuildStrategy.dockerfile
        ? (createBuildDto.dockerfilePath ?? app.dockerfilePath ?? "Dockerfile")
        : null;
    const jobName = this.kubernetesService.buildJobName(app.name, buildId);
    const labels = this.kubernetesService.buildJobLabels(
      workspaceId,
      app.id,
      buildId,
    );
    const imageRepository = toImageRepository(app.name);
    const localRegistryHost =
      this.configService.get<string>("localRegistryHost") ?? "localhost:5001";
    const localRegistryCluster =
      this.configService.get<string>("localRegistryCluster") ??
      "kind-registry:5000";
    const buildpackBuilderImage =
      this.configService.get<string>("buildpackBuilderImage") ??
      "gcr.io/buildpacks/builder";
    const buildpackRunnerImage =
      this.configService.get<string>("buildpackRunnerImage") ??
      "ghcr.io/venumigihansa/nexcause-buildpack-runner:0.1.3";
    const hostImage = `${localRegistryHost}/${imageRepository}:${buildId}`;
    const clusterImage = `${localRegistryCluster}/${imageRepository}:${buildId}`;

    const build = await this.prisma.build.create({
      data: {
        id: buildId,
        appId: app.id,
        status: BuildStatus.pending,
        strategy,
        repoUrl: app.repoUrl,
        branch,
        buildContext,
        dockerfilePath,
        image: hostImage,
        kubernetesJob: jobName,
      },
    });

    try {
      if (strategy === BuildStrategy.buildpack) {
        await this.kubernetesService.createBuildpackJob({
          namespace,
          jobName,
          labels,
          repoUrl: app.repoUrl,
          branch,
          buildContext,
          clusterImage,
          builderImage: buildpackBuilderImage,
          runnerImage: buildpackRunnerImage,
          insecureRegistry: localRegistryCluster,
        });
      } else {
        const resolvedDockerfilePath = dockerfilePath ?? "Dockerfile";

        await this.kubernetesService.createBuildJob({
          namespace,
          jobName,
          labels,
          repoUrl: app.repoUrl,
          branch,
          buildContext,
          dockerfilePath: resolvedDockerfilePath,
          clusterImage,
        });
      }
    } catch (error) {
      await this.prisma.build.update({
        where: { id: build.id },
        data: {
          status: BuildStatus.failed,
          errorMessage: getErrorMessage(error),
        },
      });

      throw error;
    }

    return this.prisma.build.update({
      where: { id: build.id },
      data: { status: BuildStatus.running },
    });
  }

  // Returns all builds for an app after confirming the app exists.
  async findByApp(appId: string) {
    await this.appsService.findOneOrThrow(appId);

    return this.prisma.build.findMany({
      where: { appId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Loads one build from Postgres or throws a 404 for API callers.
  async findOneOrThrow(id: string) {
    const build = await this.prisma.build.findUnique({
      where: { id },
    });

    if (!build) {
      throw new NotFoundException(`Build ${id} was not found`);
    }

    return build;
  }

  // Reads live Kubernetes Job status and updates the stored build status.
  async getStatus(id: string) {
    const build = await this.findOneOrThrow(id);

    if (!build.kubernetesJob) {
      return {
        buildId: build.id,
        status: build.status,
        image: build.image,
      };
    }

    const namespace = await this.workspaceNamespace(build.workspaceId);
    const liveStatus = await this.kubernetesService.getBuildJobStatus(
      namespace,
      build.kubernetesJob,
    );
    const nextStatus = getBuildStatusFromJob(build.status, liveStatus);

    if (nextStatus !== build.status) {
      await this.prisma.build.update({
        where: { id: build.id },
        data: {
          status: nextStatus,
          errorMessage:
            nextStatus === BuildStatus.failed
              ? getFailedConditionMessage(liveStatus.conditions)
              : build.errorMessage,
        },
      });
    }

    return {
      buildId: build.id,
      status: nextStatus,
      image: build.image,
      ...liveStatus,
    };
  }

  // Finds pods for a build Job by labels and returns their logs.
  async getLogs(id: string) {
    const build = await this.findOneOrThrow(id);
    const namespace = await this.workspaceNamespace(build.workspaceId);
    const labels = this.kubernetesService.buildJobLabels(
      build.workspaceId,
      build.appId,
      build.id,
    );

    return this.kubernetesService.getBuildJobLogs(namespace, labels);
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
}

function getBuildStatusFromJob(
  currentStatus: BuildStatus,
  liveStatus: { succeeded: number; failed: number; active: number },
): BuildStatus {
  if (liveStatus.succeeded > 0) {
    return BuildStatus.succeeded;
  }

  if (liveStatus.failed > 0) {
    return BuildStatus.failed;
  }

  if (liveStatus.active > 0) {
    return BuildStatus.running;
  }

  return currentStatus;
}

function getFailedConditionMessage(
  conditions: Array<{ type?: string; message?: string }>,
): string | undefined {
  return conditions.find((condition) => condition.type === "Failed")?.message;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown build error";
}

function toImageRepository(appName: string): string {
  return (
    appName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80) || "app"
  );
}
