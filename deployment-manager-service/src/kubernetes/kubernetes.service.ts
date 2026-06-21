import { Injectable, NotFoundException } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';
import { buildConfigMapManifest } from './builders/configmap-manifest.builder';
import { buildDeploymentManifest } from './builders/deployment-manifest.builder';
import { buildNamespaceManifest } from './builders/namespace-manifest.builder';
import { buildServiceManifest } from './builders/service-manifest.builder';
import { KubernetesResourceNames } from './types/kubernetes-resource-names';

interface DeployImageInput {
  namespace: string;
  names: KubernetesResourceNames;
  image: string;
  port: number;
  replicas: number;
  env: Record<string, string>;
  labels: Record<string, string>;
}

@Injectable()
export class KubernetesService {
  private readonly coreApi: k8s.CoreV1Api;
  private readonly appsApi: k8s.AppsV1Api;

  constructor() {
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromDefault();

    this.coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kubeConfig.makeApiClient(k8s.AppsV1Api);
  }

  buildResourceNames(appName: string, deploymentId: string): KubernetesResourceNames {
    const appSegment = toDnsSafeName(appName).slice(0, 32) || 'app';
    const deploymentSegment = deploymentId.slice(0, 8).toLowerCase();
    const base = `${appSegment}-${deploymentSegment}`;

    return {
      deploymentName: base,
      serviceName: `${base}-svc`,
      configMapName: `${base}-env`,
    };
  }

  buildManagedLabels(appId: string, deploymentId: string): Record<string, string> {
    return {
      'app.kubernetes.io/managed-by': 'deployment-manager-service',
      'rca-platform/app-id': appId,
      'rca-platform/deployment-id': deploymentId,
    };
  }

  async deployImage(input: DeployImageInput): Promise<void> {
    await this.ensureNamespace(input.namespace);
    await this.upsertConfigMap(input);
    await this.upsertDeployment(input);
    await this.upsertService(input);
  }

  async getDeploymentStatus(namespace: string, deploymentName: string) {
    const deployment = await this.appsApi.readNamespacedDeployment(
      deploymentName,
      namespace,
    );

    const status = deployment.body.status;

    return {
      desiredReplicas: deployment.body.spec?.replicas ?? 0,
      readyReplicas: status?.readyReplicas ?? 0,
      availableReplicas: status?.availableReplicas ?? 0,
      updatedReplicas: status?.updatedReplicas ?? 0,
      unavailableReplicas: status?.unavailableReplicas ?? 0,
      conditions: status?.conditions ?? [],
    };
  }

  async getDeploymentLogs(
    namespace: string,
    labels: Record<string, string>,
  ): Promise<Array<{ podName: string; logs: string }>> {
    const pods = await this.coreApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      toLabelSelector(labels),
    );

    return Promise.all(
      pods.body.items.map(async (pod) => {
        const podName = pod.metadata?.name;

        if (!podName) {
          throw new NotFoundException('A matching pod was missing its name');
        }

        const logs = await this.coreApi.readNamespacedPodLog(podName, namespace);

        return {
          podName,
          logs: logs.body,
        };
      }),
    );
  }

  async deleteDeploymentResources(
    namespace: string,
    names: KubernetesResourceNames,
  ): Promise<void> {
    await this.deleteIfExists(() =>
      this.appsApi.deleteNamespacedDeployment(names.deploymentName, namespace),
    );
    await this.deleteIfExists(() =>
      this.coreApi.deleteNamespacedService(names.serviceName, namespace),
    );
    await this.deleteIfExists(() =>
      this.coreApi.deleteNamespacedConfigMap(names.configMapName, namespace),
    );
  }

  private async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this.coreApi.readNamespace(namespace);
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespace(buildNamespaceManifest(namespace));
    }
  }

  private async upsertConfigMap(input: DeployImageInput): Promise<void> {
    const configMap = buildConfigMapManifest({
      name: input.names.configMapName,
      labels: input.labels,
      data: input.env,
    });

    try {
      const existing = await this.coreApi.readNamespacedConfigMap(
        input.names.configMapName,
        input.namespace,
      );
      configMap.metadata = {
        ...configMap.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };

      await this.coreApi.replaceNamespacedConfigMap(
        input.names.configMapName,
        input.namespace,
        configMap,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespacedConfigMap(input.namespace, configMap);
    }
  }

  private async upsertDeployment(input: DeployImageInput): Promise<void> {
    const deployment = buildDeploymentManifest({
      name: input.names.deploymentName,
      image: input.image,
      port: input.port,
      replicas: input.replicas,
      labels: input.labels,
      configMapName: input.names.configMapName,
    });

    try {
      const existing = await this.appsApi.readNamespacedDeployment(
        input.names.deploymentName,
        input.namespace,
      );
      deployment.metadata = {
        ...deployment.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };

      await this.appsApi.replaceNamespacedDeployment(
        input.names.deploymentName,
        input.namespace,
        deployment,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.appsApi.createNamespacedDeployment(input.namespace, deployment);
    }
  }

  private async upsertService(input: DeployImageInput): Promise<void> {
    const service = buildServiceManifest({
      name: input.names.serviceName,
      port: input.port,
      labels: input.labels,
    });

    try {
      const existing = await this.coreApi.readNamespacedService(
        input.names.serviceName,
        input.namespace,
      );
      service.metadata = {
        ...service.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };
      service.spec = {
        ...service.spec,
        clusterIP: existing.body.spec?.clusterIP,
        clusterIPs: existing.body.spec?.clusterIPs,
        ipFamilies: existing.body.spec?.ipFamilies,
        ipFamilyPolicy: existing.body.spec?.ipFamilyPolicy,
      };

      await this.coreApi.replaceNamespacedService(
        input.names.serviceName,
        input.namespace,
        service,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespacedService(input.namespace, service);
    }
  }

  private async deleteIfExists(deleteResource: () => Promise<unknown>): Promise<void> {
    try {
      await deleteResource();
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }
    }
  }
}

function toDnsSafeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 45);
}

function toLabelSelector(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

function isKubernetesNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('response' in error &&
      (error as { response?: { statusCode?: number } }).response?.statusCode ===
        404) ||
      ('statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 404))
  );
}
