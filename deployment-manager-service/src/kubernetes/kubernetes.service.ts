import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as k8s from "@kubernetes/client-node";
import { buildBuildJobManifest } from "./builders/build-job-manifest.builder";
import { buildBuildpackJobManifest } from "./builders/buildpack-job-manifest.builder";
import {
  buildApplicationRedirectRouteManifest,
  buildApplicationRouteManifest,
} from "./builders/application-route-manifest.builder";
import { buildConfigMapManifest } from "./builders/configmap-manifest.builder";
import { buildDeploymentManifest } from "./builders/deployment-manifest.builder";
import { buildNamespaceManifest } from "./builders/namespace-manifest.builder";
import { buildSecretManifest } from "./builders/secret-manifest.builder";
import { buildServiceManifest } from "./builders/service-manifest.builder";
import {
  buildApplicationPodLabels,
  buildTenantNetworkPolicyManifests,
} from "./builders/tenant-network-policy-manifest.builder";
import { KubernetesResourceNames } from "./types/kubernetes-resource-names";

// Shape of the normalized data KubernetesService needs to create resources.
interface DeployImageInput {
  namespace: string;
  names: KubernetesResourceNames;
  image: string;
  port: number;
  replicas: number;
  env: Record<string, string>;
  secrets: Record<string, string>;
  files: FileConfigMap;
  secretFiles: FileConfigMap;
  labels: Record<string, string>;
  routing?: ApplicationRoutingInput;
}

interface ApplicationRoutingInput {
  hostname: string;
  gatewayName: string;
  gatewayNamespace: string;
  namespaceLabelKey: string;
  namespaceLabelValue: string;
}

interface FileConfigMap {
  data: Record<string, string>;
  items: Array<{
    key: string;
    path: string;
  }>;
}

interface CreateBuildJobInput {
  namespace: string;
  jobName: string;
  labels: Record<string, string>;
  repoUrl: string;
  branch: string;
  buildContext: string;
  dockerfilePath: string;
  clusterImage: string;
}

interface CreateBuildpackJobInput {
  namespace: string;
  jobName: string;
  labels: Record<string, string>;
  repoUrl: string;
  branch: string;
  buildContext: string;
  clusterImage: string;
  builderImage: string;
  runnerImage: string;
  insecureRegistry: string;
}

@Injectable()
export class KubernetesService {
  private readonly coreApi: k8s.CoreV1Api;
  private readonly appsApi: k8s.AppsV1Api;
  private readonly batchApi: k8s.BatchV1Api;
  private readonly customObjectsApi: k8s.CustomObjectsApi;
  private readonly networkingApi: k8s.NetworkingV1Api;

  constructor(private readonly configService: ConfigService) {
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromDefault();

    this.coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.batchApi = kubeConfig.makeApiClient(k8s.BatchV1Api);
    this.customObjectsApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
    this.networkingApi = kubeConfig.makeApiClient(k8s.NetworkingV1Api);
  }

  // Creates deterministic Kubernetes resource names for one app deployment.
  buildResourceNames(
    appName: string,
    deploymentId: string,
  ): KubernetesResourceNames {
    const appSegment = toDnsSafeName(appName).slice(0, 32) || "app";
    const deploymentSegment = deploymentId.slice(0, 8).toLowerCase();
    const base = `${appSegment}-${deploymentSegment}`;

    return {
      deploymentName: base,
      serviceName: `${base}-svc`,
      configMapName: `${base}-env`,
      fileConfigMapName: `${base}-files`,
      secretName: `${base}-secret`,
      secretFileSecretName: `${base}-secret-files`,
      httpRouteName: `${base}-route`,
      httpRedirectRouteName: `${base}-redirect`,
    };
  }

  // Creates labels used to connect Deployments, Pods, Services, and log lookups.
  buildManagedLabels(
    workspaceId: string,
    appId: string,
    deploymentId: string,
  ): Record<string, string> {
    return {
      "app.kubernetes.io/managed-by": "deployment-manager-service",
      "rca-platform/workspace-id": workspaceId,
      "rca-platform/app-id": appId,
      "rca-platform/deployment-id": deploymentId,
    };
  }

  // Creates deterministic names for Kubernetes build Jobs.
  buildJobName(appName: string, buildId: string): string {
    const appSegment = toDnsSafeName(appName).slice(0, 32) || "app";
    const buildSegment = buildId.slice(0, 8).toLowerCase();

    return `${appSegment}-build-${buildSegment}`;
  }

  // Creates labels used to find build Jobs and their pods later.
  buildJobLabels(
    workspaceId: string,
    appId: string,
    buildId: string,
  ): Record<string, string> {
    return {
      "app.kubernetes.io/managed-by": "deployment-manager-service",
      "rca-platform/workspace-id": workspaceId,
      "rca-platform/app-id": appId,
      "rca-platform/build-id": buildId,
    };
  }

  // Creates or updates all Kubernetes resources needed to run an image.
  async deployImage(input: DeployImageInput): Promise<void> {
    await this.ensureNamespace(input.namespace, input.labels);
    await this.upsertConfigMap(input);
    await this.upsertFileConfigMap(input);
    await this.upsertSecret(input);
    await this.upsertSecretFiles(input);
    await this.upsertDeployment(input);
    await this.upsertService(input);
    if (input.routing) {
      await this.enableApplicationRouting(input);
    }
  }

  // Creates a Kubernetes Job that clones a repo, builds a Dockerfile, and pushes the image.
  async createBuildJob(input: CreateBuildJobInput): Promise<void> {
    await this.ensureNamespace(input.namespace, input.labels);

    const job = buildBuildJobManifest({
      name: input.jobName,
      labels: input.labels,
      repoUrl: input.repoUrl,
      branch: input.branch,
      buildContext: input.buildContext,
      dockerfilePath: input.dockerfilePath,
      clusterImage: input.clusterImage,
    });

    await this.batchApi.createNamespacedJob(input.namespace, job);
  }

  // Creates a Kubernetes Job that clones a repo and builds it with Cloud Native Buildpacks.
  async createBuildpackJob(input: CreateBuildpackJobInput): Promise<void> {
    await this.ensureNamespace(input.namespace, input.labels);

    const job = buildBuildpackJobManifest({
      name: input.jobName,
      labels: input.labels,
      repoUrl: input.repoUrl,
      branch: input.branch,
      buildContext: input.buildContext,
      clusterImage: input.clusterImage,
      builderImage: input.builderImage,
      runnerImage: input.runnerImage,
      insecureRegistry: input.insecureRegistry,
    });

    await this.batchApi.createNamespacedJob(input.namespace, job);
  }

  // Reads live Kubernetes Job status for a build.
  async getBuildJobStatus(namespace: string, jobName: string) {
    const job = await this.batchApi.readNamespacedJob(jobName, namespace);
    const status = job.body.status;

    return {
      active: status?.active ?? 0,
      succeeded: status?.succeeded ?? 0,
      failed: status?.failed ?? 0,
      conditions: status?.conditions ?? [],
    };
  }

  // Finds pods for a build Job by labels and returns logs from each matching pod.
  async getBuildJobLogs(
    namespace: string,
    labels: Record<string, string>,
  ): Promise<Array<{ podName: string; logs: string }>> {
    return this.getPodLogsByLabels(namespace, labels);
  }

  // Reads live Kubernetes Deployment readiness and replica counts.
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

  // Updates the number of replicas Kubernetes should run for a Deployment.
  async scaleDeployment(
    namespace: string,
    deploymentName: string,
    replicas: number,
  ): Promise<void> {
    await this.appsApi.patchNamespacedDeployment(
      deploymentName,
      namespace,
      {
        spec: {
          replicas,
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mergePatchOptions(),
    );
  }

  // Triggers a rollout restart by changing the pod template annotation.
  async restartDeployment(
    namespace: string,
    deploymentName: string,
  ): Promise<string> {
    const restartedAt = new Date().toISOString();

    await this.appsApi.patchNamespacedDeployment(
      deploymentName,
      namespace,
      {
        spec: {
          template: {
            metadata: {
              annotations: {
                "kubectl.kubernetes.io/restartedAt": restartedAt,
              },
            },
          },
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mergePatchOptions(),
    );

    return restartedAt;
  }

  // Lists pods selected by a deployment's managed labels.
  async listDeploymentPods(
    namespace: string,
    labels: Record<string, string>,
  ): Promise<DeploymentPodSummary[]> {
    const pods = await this.coreApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      toLabelSelector(labels),
    );

    return pods.body.items.map(toDeploymentPodSummary);
  }

  // Lists Kubernetes events related to a deployment and its managed pods.
  async listDeploymentEvents(
    namespace: string,
    deploymentName: string,
    labels: Record<string, string>,
  ): Promise<DeploymentEventSummary[]> {
    const [allEvents, pods] = await Promise.all([
      this.coreApi.listNamespacedEvent(namespace),
      this.listDeploymentPods(namespace, labels),
    ]);
    const podNames = new Set(pods.map((pod) => pod.name));

    return allEvents.body.items
      .filter((event) => {
        const involvedName = event.involvedObject?.name;

        return (
          involvedName === deploymentName ||
          (involvedName !== undefined && podNames.has(involvedName)) ||
          involvedName?.startsWith(`${deploymentName}-`)
        );
      })
      .sort((a, b) => getEventTime(a).localeCompare(getEventTime(b)))
      .map(toDeploymentEventSummary);
  }

  // Finds pods by deployment labels and returns logs from each matching pod.
  async getDeploymentLogs(
    namespace: string,
    labels: Record<string, string>,
  ): Promise<Array<{ podName: string; logs: string }>> {
    return this.getPodLogsByLabels(namespace, labels);
  }

  // Returns a bounded log tail from each current pod for evidence snapshots.
  async getDeploymentEvidenceLogs(
    namespace: string,
    labels: Record<string, string>,
    tailLines = 200,
    sinceSeconds?: number,
  ): Promise<Array<{ podName: string; logs: string }>> {
    return this.getPodLogsByLabels(namespace, labels, tailLines, sinceSeconds);
  }

  // Deletes the Kubernetes resources that were created for a deployment.
  async deleteDeploymentResources(
    namespace: string,
    names: KubernetesResourceNames,
    deleteRoutes = false,
  ): Promise<void> {
    if (deleteRoutes) {
      await this.deleteHttpRoute(namespace, names.httpRedirectRouteName);
      await this.deleteHttpRoute(namespace, names.httpRouteName);
    }
    await this.deleteIfExists(() =>
      this.appsApi.deleteNamespacedDeployment(names.deploymentName, namespace),
    );
    await this.deleteIfExists(() =>
      this.coreApi.deleteNamespacedService(names.serviceName, namespace),
    );
    await this.deleteIfExists(() =>
      this.coreApi.deleteNamespacedConfigMap(names.configMapName, namespace),
    );
    const fileConfigMapName = names.fileConfigMapName;
    if (fileConfigMapName) {
      await this.deleteIfExists(() =>
        this.coreApi.deleteNamespacedConfigMap(fileConfigMapName, namespace),
      );
    }
    const secretName = names.secretName;
    if (secretName) {
      await this.deleteIfExists(() =>
        this.coreApi.deleteNamespacedSecret(secretName, namespace),
      );
    }
    const secretFileSecretName = names.secretFileSecretName;
    if (secretFileSecretName) {
      await this.deleteIfExists(() =>
        this.coreApi.deleteNamespacedSecret(secretFileSecretName, namespace),
      );
    }
  }

  // Creates the namespace only when it does not already exist.
  private async ensureNamespace(
    namespace: string,
    labels: Record<string, string>,
  ): Promise<void> {
    try {
      await this.coreApi.readNamespace(namespace);
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespace(
        buildNamespaceManifest(namespace, {
          "app.kubernetes.io/managed-by":
            labels["app.kubernetes.io/managed-by"],
          "rca-platform/workspace-id": labels["rca-platform/workspace-id"],
        }),
      );
    }

    if (this.configService.get<boolean>("tenantNetworkPolicyEnabled")) {
      await this.reconcileTenantNetworkPolicies(namespace);
    }
  }

  private async reconcileTenantNetworkPolicies(
    namespace: string,
  ): Promise<void> {
    const gatewayName =
      this.configService.get<string>("applicationGatewayName") ?? "";
    const gatewayNamespace =
      this.configService.get<string>("applicationGatewayNamespace") ?? "";

    if (!gatewayName || !gatewayNamespace) {
      throw new Error(
        "Tenant NetworkPolicy requires an application Gateway name and namespace",
      );
    }

    const policies = buildTenantNetworkPolicyManifests({
      namespace,
      gatewayName,
      gatewayNamespace,
    });

    try {
      for (const policy of policies) {
        await this.upsertNetworkPolicy(namespace, policy);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to reconcile tenant NetworkPolicies in namespace ${namespace}: ${message}`,
      );
    }
  }

  private async upsertNetworkPolicy(
    namespace: string,
    policy: k8s.V1NetworkPolicy,
  ): Promise<void> {
    const name = policy.metadata?.name;
    if (!name) {
      throw new Error("Tenant NetworkPolicy is missing metadata.name");
    }

    try {
      const existing = await this.networkingApi.readNamespacedNetworkPolicy(
        name,
        namespace,
      );
      policy.metadata = {
        ...policy.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };
      await this.networkingApi.replaceNamespacedNetworkPolicy(
        name,
        namespace,
        policy,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }
      await this.networkingApi.createNamespacedNetworkPolicy(namespace, policy);
    }
  }

  private async enableApplicationRouting(
    input: DeployImageInput,
  ): Promise<void> {
    const routing = input.routing;
    if (!routing) {
      return;
    }

    await this.coreApi.patchNamespace(
      input.namespace,
      {
        metadata: {
          labels: {
            [routing.namespaceLabelKey]: routing.namespaceLabelValue,
          },
        },
      },
      undefined,
      undefined,
      "deployment-manager-service",
      undefined,
      undefined,
      mergePatchOptions(),
    );

    const route = buildApplicationRouteManifest({
      name: input.names.httpRouteName,
      namespace: input.namespace,
      hostname: routing.hostname,
      gatewayName: routing.gatewayName,
      gatewayNamespace: routing.gatewayNamespace,
      serviceName: input.names.serviceName,
      servicePort: input.port,
      labels: input.labels,
    });
    const redirectRoute = buildApplicationRedirectRouteManifest({
      name: input.names.httpRedirectRouteName,
      namespace: input.namespace,
      hostname: routing.hostname,
      gatewayName: routing.gatewayName,
      gatewayNamespace: routing.gatewayNamespace,
      labels: input.labels,
    });

    try {
      await this.createHttpRoute(input.namespace, route);
      await this.createHttpRoute(input.namespace, redirectRoute);
    } catch (error) {
      await this.deleteHttpRoute(
        input.namespace,
        input.names.httpRedirectRouteName,
      );
      await this.deleteHttpRoute(input.namespace, input.names.httpRouteName);
      throw error;
    }
  }

  private async createHttpRoute(
    namespace: string,
    route: Record<string, unknown>,
  ): Promise<void> {
    await this.customObjectsApi.createNamespacedCustomObject(
      "gateway.networking.k8s.io",
      "v1",
      namespace,
      "httproutes",
      route,
      undefined,
      undefined,
      "deployment-manager-service",
    );
  }

  private async deleteHttpRoute(
    namespace: string,
    name: string,
  ): Promise<void> {
    await this.deleteIfExists(() =>
      this.customObjectsApi.deleteNamespacedCustomObject(
        "gateway.networking.k8s.io",
        "v1",
        namespace,
        "httproutes",
        name,
      ),
    );
  }

  // Creates or replaces the ConfigMap that stores non-secret env vars.
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

  // Creates or replaces the ConfigMap that stores mounted config files.
  private async upsertFileConfigMap(input: DeployImageInput): Promise<void> {
    const fileConfigMapName = input.names.fileConfigMapName;

    if (input.files.items.length === 0) {
      if (fileConfigMapName) {
        await this.deleteIfExists(() =>
          this.coreApi.deleteNamespacedConfigMap(
            fileConfigMapName,
            input.namespace,
          ),
        );
      }
      return;
    }

    if (!fileConfigMapName) {
      throw new Error(
        "File config was provided without a Kubernetes ConfigMap name",
      );
    }

    const configMap = buildConfigMapManifest({
      name: fileConfigMapName,
      labels: input.labels,
      data: input.files.data,
    });

    try {
      const existing = await this.coreApi.readNamespacedConfigMap(
        fileConfigMapName,
        input.namespace,
      );
      configMap.metadata = {
        ...configMap.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };

      await this.coreApi.replaceNamespacedConfigMap(
        fileConfigMapName,
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

  // Creates or replaces the Secret that stores secret env vars and secret files.
  private async upsertSecret(input: DeployImageInput): Promise<void> {
    const secretName = input.names.secretName;
    const secretData = {
      ...input.secrets,
    };

    if (Object.keys(secretData).length === 0) {
      if (secretName) {
        await this.deleteIfExists(() =>
          this.coreApi.deleteNamespacedSecret(secretName, input.namespace),
        );
      }
      return;
    }

    if (!secretName) {
      throw new Error(
        "Secret data was provided without a Kubernetes Secret name",
      );
    }

    const secret = buildSecretManifest({
      name: secretName,
      labels: input.labels,
      stringData: secretData,
    });

    try {
      const existing = await this.coreApi.readNamespacedSecret(
        secretName,
        input.namespace,
      );
      secret.metadata = {
        ...secret.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };

      await this.coreApi.replaceNamespacedSecret(
        secretName,
        input.namespace,
        secret,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespacedSecret(input.namespace, secret);
    }
  }

  // Creates or replaces the Secret that stores mounted secret files.
  private async upsertSecretFiles(input: DeployImageInput): Promise<void> {
    const secretFileSecretName = input.names.secretFileSecretName;

    if (input.secretFiles.items.length === 0) {
      if (secretFileSecretName) {
        await this.deleteIfExists(() =>
          this.coreApi.deleteNamespacedSecret(
            secretFileSecretName,
            input.namespace,
          ),
        );
      }
      return;
    }

    if (!secretFileSecretName) {
      throw new Error(
        "Secret files were provided without a Kubernetes Secret name",
      );
    }

    const secret = buildSecretManifest({
      name: secretFileSecretName,
      labels: input.labels,
      stringData: input.secretFiles.data,
    });

    try {
      const existing = await this.coreApi.readNamespacedSecret(
        secretFileSecretName,
        input.namespace,
      );
      secret.metadata = {
        ...secret.metadata,
        resourceVersion: existing.body.metadata?.resourceVersion,
      };

      await this.coreApi.replaceNamespacedSecret(
        secretFileSecretName,
        input.namespace,
        secret,
      );
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }

      await this.coreApi.createNamespacedSecret(input.namespace, secret);
    }
  }

  // Creates or replaces the Kubernetes Deployment that runs the container image.
  private async upsertDeployment(input: DeployImageInput): Promise<void> {
    const workloadLabels = buildApplicationPodLabels(
      input.labels,
      Boolean(input.routing),
    );
    const deployment = buildDeploymentManifest({
      name: input.names.deploymentName,
      image: input.image,
      port: input.port,
      replicas: input.replicas,
      labels: workloadLabels,
      configMapName: input.names.configMapName,
      secretName:
        Object.keys(input.secrets).length > 0
          ? input.names.secretName
          : undefined,
      configFileConfigMapName:
        input.files.items.length > 0
          ? input.names.fileConfigMapName
          : undefined,
      secretFileSecretName:
        input.secretFiles.items.length > 0
          ? input.names.secretFileSecretName
          : undefined,
      configFileVolume:
        input.files.items.length > 0
          ? {
              name: "config-files",
              mountPath: "/app/config",
              items: input.files.items,
            }
          : undefined,
      secretFileVolume:
        input.secretFiles.items.length > 0
          ? {
              name: "secret-files",
              mountPath: "/app/secrets",
              items: input.secretFiles.items,
            }
          : undefined,
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

      await this.appsApi.createNamespacedDeployment(
        input.namespace,
        deployment,
      );
    }
  }

  // Creates or replaces the ClusterIP Service that routes traffic to the pods.
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

  // Ignores 404 errors during cleanup, because missing resources are already gone.
  private async deleteIfExists(
    deleteResource: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await deleteResource();
    } catch (error) {
      if (!isKubernetesNotFound(error)) {
        throw error;
      }
    }
  }

  private async getPodLogsByLabels(
    namespace: string,
    labels: Record<string, string>,
    tailLines?: number,
    sinceSeconds?: number,
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
          throw new NotFoundException("A matching pod was missing its name");
        }

        const logs = await this.coreApi.readNamespacedPodLog(
          podName,
          namespace,
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          undefined,
          sinceSeconds,
          tailLines,
          true,
        );

        return {
          podName,
          logs: logs.body,
        };
      }),
    );
  }
}

export interface DeploymentPodSummary {
  name: string;
  namespace?: string;
  phase?: string;
  podIP?: string;
  hostIP?: string;
  nodeName?: string;
  startTime?: Date;
  labels?: Record<string, string>;
  conditions: Array<{
    type?: string;
    status?: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: Date;
  }>;
  containers: Array<{
    name: string;
    image?: string;
    ready?: boolean;
    restartCount: number;
    state?: unknown;
    lastState?: unknown;
  }>;
}

export interface DeploymentEventSummary {
  name?: string;
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  involvedObject?: {
    kind?: string;
    name?: string;
  };
  firstTimestamp?: Date;
  lastTimestamp?: Date;
  eventTime?: string;
}

function toDnsSafeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 45);
}

function toLabelSelector(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function mergePatchOptions(): { headers: { "Content-Type": string } } {
  return {
    headers: {
      "Content-Type": "application/merge-patch+json",
    },
  };
}

function toDeploymentPodSummary(pod: k8s.V1Pod): DeploymentPodSummary {
  return {
    name: pod.metadata?.name ?? "",
    namespace: pod.metadata?.namespace,
    phase: pod.status?.phase,
    podIP: pod.status?.podIP,
    hostIP: pod.status?.hostIP,
    nodeName: pod.spec?.nodeName,
    startTime: pod.status?.startTime,
    labels: pod.metadata?.labels,
    conditions:
      pod.status?.conditions?.map((condition) => ({
        type: condition.type,
        status: condition.status,
        reason: condition.reason,
        message: condition.message,
        lastTransitionTime: condition.lastTransitionTime,
      })) ?? [],
    containers:
      pod.status?.containerStatuses?.map((container) => ({
        name: container.name,
        image: container.image,
        ready: container.ready,
        restartCount: container.restartCount,
        state: container.state,
        lastState: container.lastState,
      })) ?? [],
  };
}

function toDeploymentEventSummary(
  event: k8s.CoreV1Event,
): DeploymentEventSummary {
  return {
    name: event.metadata?.name,
    type: event.type,
    reason: event.reason,
    message: event.message,
    count: event.count,
    involvedObject: {
      kind: event.involvedObject?.kind,
      name: event.involvedObject?.name,
    },
    firstTimestamp: event.firstTimestamp,
    lastTimestamp: event.lastTimestamp,
    eventTime: getEventTime(event),
  };
}

function getEventTime(event: k8s.CoreV1Event): string {
  return (
    event.lastTimestamp?.toISOString() ??
    event.firstTimestamp?.toISOString() ??
    event.metadata?.creationTimestamp?.toISOString() ??
    ""
  );
}

function isKubernetesNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("response" in error &&
      (error as { response?: { statusCode?: number } }).response?.statusCode ===
        404) ||
      ("statusCode" in error &&
        (error as { statusCode?: number }).statusCode === 404))
  );
}
