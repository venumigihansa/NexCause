import * as k8s from "@kubernetes/client-node";
import { KubernetesService } from "./kubernetes.service";

describe("KubernetesService application route lifecycle", () => {
  const coreApi = {
    deleteNamespacedService: jest.fn(),
    deleteNamespacedConfigMap: jest.fn(),
    deleteNamespacedSecret: jest.fn(),
  };
  const appsApi = { deleteNamespacedDeployment: jest.fn() };
  const batchApi = {};
  const customObjectsApi = { deleteNamespacedCustomObject: jest.fn() };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    for (const api of [coreApi, appsApi, customObjectsApi]) {
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
      throw new Error("Unexpected Kubernetes API client");
    }) as never);
  });

  it("deletes both routes before the workload resources", async () => {
    const service = new KubernetesService();
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
    const service = new KubernetesService();
    const names = service.buildResourceNames(
      "orders",
      "a1b2c3d4-1111-2222-3333-444444444444",
    );

    await service.deleteDeploymentResources("rca-w-tenant", names);

    expect(
      customObjectsApi.deleteNamespacedCustomObject,
    ).not.toHaveBeenCalled();
  });
});
