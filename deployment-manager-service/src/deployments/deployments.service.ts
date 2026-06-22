import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Deployment,
  DeploymentStatus,
  Prisma,
  RuntimeConfigType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppsService } from '../apps/apps.service';
import { PrismaService } from '../database/prisma.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { KubernetesResourceNames } from '../kubernetes/types/kubernetes-resource-names';
import { CreateDeploymentDto } from './dto/create-deployment.dto';

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly appsService: AppsService,
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
    private readonly prisma: PrismaService,
  ) {}

  // Creates a deployment record, then creates the matching Kubernetes resources.
  async create(appId: string, createDeploymentDto: CreateDeploymentDto) {
    const app = await this.appsService.findOneOrThrow(appId);
    const deploymentId = randomUUID();
    const image = createDeploymentDto.image ?? app.image;
    const port = createDeploymentDto.port ?? app.defaultPort;
    const namespace =
      createDeploymentDto.namespace ??
      this.configService.get<string>('defaultNamespace') ??
      'apps';
    const replicas = createDeploymentDto.replicas ?? 1;
    const env = normalizeEnv(createDeploymentDto.env ?? {});

    if (!image) {
      throw new BadRequestException(
        'Deployment image is required when the app has no default image',
      );
    }

    if (!port) {
      throw new BadRequestException(
        'Deployment port is required when the app has no default port',
      );
    }

    const names = this.kubernetesService.buildResourceNames(app.name, deploymentId);
    const labels = this.kubernetesService.buildManagedLabels(app.id, deploymentId);

    const deployment = await this.prisma.deployment.create({
      data: {
        id: deploymentId,
        appId: app.id,
        namespace,
        image,
        replicas,
        port,
        status: DeploymentStatus.creating,
        kubernetesDeployment: names.deploymentName,
        kubernetesService: names.serviceName,
        kubernetesConfigMap: names.configMapName,
        runtimeConfigs: {
          create: {
            type: RuntimeConfigType.env,
            data: env as Prisma.InputJsonObject,
          },
        },
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
        labels,
      });
    } catch (error) {
      await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: DeploymentStatus.failed },
      });

      throw error;
    }

    return deployment;
  }

  // Returns all deployments for an app after confirming the app exists.
  async findByApp(appId: string) {
    await this.appsService.findOneOrThrow(appId);

    return this.prisma.deployment.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
      include: {
        runtimeConfigs: true,
      },
    });
  }

  // Reads live Kubernetes status and updates the stored status when ready.
  async getStatus(id: string) {
    const deployment = await this.findOneOrThrow(id);

    if (deployment.status === DeploymentStatus.deleted) {
      return {
        deploymentId: deployment.id,
        status: DeploymentStatus.deleted,
        desiredReplicas: deployment.replicas,
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
    const labels = this.kubernetesService.buildManagedLabels(
      deployment.appId,
      deployment.id,
    );

    return this.kubernetesService.getDeploymentLogs(deployment.namespace, labels);
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
      data: { status: DeploymentStatus.deleted },
    });
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

function deploymentToResourceNames(deployment: Deployment): KubernetesResourceNames {
  if (!deployment.kubernetesConfigMap) {
    throw new BadRequestException('Deployment has no Kubernetes ConfigMap name');
  }

  return {
    deploymentName: deployment.kubernetesDeployment,
    serviceName: deployment.kubernetesService,
    configMapName: deployment.kubernetesConfigMap,
  };
}
