import * as k8s from "@kubernetes/client-node";
import { KubernetesService } from "./kubernetes.service";

describe("KubernetesService application route lifecycle", () => {
  let config: Record<string, unknown>;
  const configService = {
    get: jest.fn((key: string) => config[key]),
  };
  const coreApi = {
    readNamespace: jest.fn(),
    createNamespace: jest.fn(),
    deleteNamespacedService: jest.fn(),
    deleteNamespacedConfigMap: jest.fn(),
    deleteNamespacedSecret: jest.fn(),
  };
  const appsApi = { deleteNamespacedDeployment: jest.fn() };
  const batchApi = {};
  const customObjectsApi = { deleteNamespacedCustomObject: jest.fn() };
  const networkingApi = {
    readNamespacedNetworkPolicy: jest.fn(),
    replaceNamespacedNetworkPolicy: jest.fn(),
    createNamespacedNetworkPolicy: jest.fn(),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    config = {};
    for (const api of [coreApi, appsApi, customObjectsApi, networkingApi]) {
      for (const mock of Object.values(api)) {
        (mock as jest.Mock).mockResolvedValue({});
      }
    }
    jest
      .spyOn(k8s.KubeConfig.prototype, "loadFromDefault")
      .mockImplementation(() => undefined);
    jest.spyOn(k8s.KubeConfig.prototype, "makeApiClient").mockImplementation(((
      api: unknown,
    ) => {
      if (api === k8s.CoreV1Api) return coreApi;
      if (api === k8s.AppsV1Api) return appsApi;
      if (api === k8s.BatchV1Api) return batchApi;
      if (api === k8s.CustomObjectsApi) return customObjectsApi;
      if (api === k8s.NetworkingV1Api) return networkingApi;
      throw new Error("Unexpected Kubernetes API client");
    }) as never);
  });

  it("deletes both routes before the workload resources", async () => {
    const service = new KubernetesService(configService as never);
    const names = service.buildResourceNames(
      "orders",
      "a1b2c3d4-1111-2222-3333-444444444444",
    );

    await service.deleteDeploymentResources("rca-w-tenant", names, true);

    expect(
      customObjectsApi.deleteNamespacedCustomObject,
    ).toHaveBeenNthCalledWith(
      1,
      "gateway.networking.k8s.io",
      "v1",
      "rca-w-tenant",
      "httproutes",
      "orders-a1b2c3d4-redirect",
    );
    expect(
      customObjectsApi.deleteNamespacedCustomObject,
    ).toHaveBeenNthCalledWith(
      2,
      "gateway.networking.k8s.io",
      "v1",
      "rca-w-tenant",
      "httproutes",
      "orders-a1b2c3d4-route",
    );
    expect(
      customObjectsApi.deleteNamespacedCustomObject.mock.invocationCallOrder[1],
    ).toBeLessThan(
      appsApi.deleteNamespacedDeployment.mock.invocationCallOrder[0],
    );
  });

  it("does not call the Gateway API for an internal deployment", async () => {
    const service = new KubernetesService(configService as never);
    const names = service.buildResourceNames(
      "orders",
      "a1b2c3d4-1111-2222-3333-444444444444",
    );

    await service.deleteDeploymentResources("rca-w-tenant", names);

    expect(
      customObjectsApi.deleteNamespacedCustomObject,
    ).not.toHaveBeenCalled();
  });

  it("does not reconcile tenant policies when isolation is disabled", async () => {
    const service = new KubernetesService(configService as never);

    await ensureNamespace(service, "rca-w-tenant");

    expect(networkingApi.readNamespacedNetworkPolicy).not.toHaveBeenCalled();
    expect(networkingApi.createNamespacedNetworkPolicy).not.toHaveBeenCalled();
  });

  it("creates all tenant policies when isolation is enabled", async () => {
    config = {
      tenantNetworkPolicyEnabled: true,
      applicationGatewayName: "rca-gateway",
      applicationGatewayNamespace: "rca-platform",
    };
    networkingApi.readNamespacedNetworkPolicy.mockRejectedValue({
      response: { statusCode: 404 },
    });
    const service = new KubernetesService(configService as never);

    await ensureNamespace(service, "rca-w-tenant");

    expect(networkingApi.createNamespacedNetworkPolicy).toHaveBeenCalledTimes(
      3,
    );
    expect(networkingApi.createNamespacedNetworkPolicy).toHaveBeenCalledWith(
      "rca-w-tenant",
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "default-deny-ingress" }),
      }),
    );
  });

  it("updates existing tenant policies with their resource versions", async () => {
    config = {
      tenantNetworkPolicyEnabled: true,
      applicationGatewayName: "rca-gateway",
      applicationGatewayNamespace: "rca-platform",
    };
    networkingApi.readNamespacedNetworkPolicy.mockResolvedValue({
      body: { metadata: { resourceVersion: "42" } },
    });
    const service = new KubernetesService(configService as never);

    await ensureNamespace(service, "rca-w-tenant");

    expect(networkingApi.replaceNamespacedNetworkPolicy).toHaveBeenCalledTimes(
      3,
    );
    expect(networkingApi.replaceNamespacedNetworkPolicy).toHaveBeenCalledWith(
      "default-deny-ingress",
      "rca-w-tenant",
      expect.objectContaining({
        metadata: expect.objectContaining({ resourceVersion: "42" }),
      }),
    );
    expect(networkingApi.createNamespacedNetworkPolicy).not.toHaveBeenCalled();
  });

  it("reports the namespace when tenant policy reconciliation fails", async () => {
    config = {
      tenantNetworkPolicyEnabled: true,
      applicationGatewayName: "rca-gateway",
      applicationGatewayNamespace: "rca-platform",
    };
    networkingApi.readNamespacedNetworkPolicy.mockRejectedValue(
      new Error("API unavailable"),
    );
    const service = new KubernetesService(configService as never);

    await expect(ensureNamespace(service, "rca-w-tenant")).rejects.toThrow(
      "Failed to reconcile tenant NetworkPolicies in namespace rca-w-tenant: API unavailable",
    );
  });
});

async function ensureNamespace(service: KubernetesService, namespace: string) {
  await (
    service as unknown as {
      ensureNamespace(
        namespace: string,
        labels: Record<string, string>,
      ): Promise<void>;
    }
  ).ensureNamespace(namespace, {
    "app.kubernetes.io/managed-by": "deployment-manager-service",
    "rca-platform/workspace-id": "workspace-id",
  });
}
