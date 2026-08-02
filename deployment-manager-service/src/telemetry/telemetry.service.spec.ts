import { NotFoundException } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";

describe("TelemetryService", () => {
  it("rejects a deployment that does not belong to the supplied app", async () => {
    const fixture = serviceFixture();
    fixture.prisma.deployment.findUnique.mockResolvedValue({
      ...deploymentRecord,
      appId: "other-app",
      app: appRecord,
    });

    await expect(
      fixture.service.getMetrics("app-id", "deployment-id", {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.prometheus.queryDeploymentMetrics).not.toHaveBeenCalled();
  });

  it("queries Prometheus only after resolving the app and deployment pair", async () => {
    const fixture = serviceFixture();
    fixture.prometheus.queryDeploymentMetrics.mockResolvedValue([
      {
        name: "cpu_usage_seconds_rate",
        labels: {},
        values: [{ timestamp: "2026-08-02T00:00:00.000Z", value: 1 }],
      },
    ]);

    const result = (await fixture.service.getMetrics(
      "app-id",
      "deployment-id",
      { sinceMinutes: 15, stepSeconds: 60 },
    )) as { appId: string; deploymentId: string; series: unknown[] };

    expect(result.appId).toBe("app-id");
    expect(result.deploymentId).toBe("deployment-id");
    expect(result.series).toHaveLength(1);
    expect(fixture.prometheus.queryDeploymentMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "rca-w-tenant",
        deploymentName: "orders-a1b2c3d4",
        deploymentId: "deployment-id",
        stepSeconds: 60,
      }),
    );
  });

  it("returns source-level errors when a telemetry backend fails", async () => {
    const fixture = serviceFixture();
    fixture.prometheus.queryDeploymentMetrics.mockRejectedValue(
      new Error("Prometheus is unavailable"),
    );

    const result = (await fixture.service.getMetrics(
      "app-id",
      "deployment-id",
      {},
    )) as {
      sourceStatus: { prometheus: string };
      errors: Array<{ source: string; message: string }>;
      series: unknown[];
    };

    expect(result.sourceStatus.prometheus).toBe("error");
    expect(result.series).toEqual([]);
    expect(result.errors).toEqual([
      { source: "prometheus", message: "Prometheus is unavailable" },
    ]);
  });

  it("returns Kubernetes telemetry and stored health samples together", async () => {
    const fixture = serviceFixture();
    fixture.kubernetes.getDeploymentStatus.mockResolvedValue({
      desiredReplicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
      unavailableReplicas: 0,
      conditions: [],
    });
    fixture.kubernetes.listDeploymentPods.mockResolvedValue([
      { name: "pod-a" },
    ]);
    fixture.kubernetes.listDeploymentEvents.mockResolvedValue([
      { type: "Warning", reason: "BackOff" },
    ]);
    fixture.prisma.deploymentHealthSample.findMany.mockResolvedValue([
      { id: "sample-id", status: "running" },
    ]);

    const result = (await fixture.service.getKubernetes(
      "app-id",
      "deployment-id",
      {},
    )) as {
      sourceStatus: { kubernetes: string; healthSamples: string };
      healthSamples: unknown[];
    };

    expect(result.sourceStatus).toEqual({
      kubernetes: "available",
      healthSamples: "available",
    });
    expect(result.healthSamples).toHaveLength(1);
  });
});

const appRecord = {
  id: "app-id",
  name: "orders",
  displayName: "Orders",
};

const deploymentRecord = {
  id: "deployment-id",
  workspaceId: "workspace-id",
  appId: "app-id",
  buildId: null,
  namespace: "rca-w-tenant",
  image: "nginx:1.27",
  replicas: 1,
  desiredReplicas: 1,
  lastNonZeroReplicas: 1,
  port: 8080,
  status: "running",
  kubernetesDeployment: "orders-a1b2c3d4",
  kubernetesService: "orders-a1b2c3d4-svc",
  kubernetesConfigMap: "orders-a1b2c3d4-env",
  kubernetesFileConfigMap: null,
  kubernetesSecret: null,
  kubernetesSecretFiles: null,
  publicHostname: "orders-a1b2c3d4.apps.rca.local",
  stoppedAt: null,
  lastRestartedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-08-02T00:00:00.000Z"),
  updatedAt: new Date("2026-08-02T00:00:00.000Z"),
};

function serviceFixture() {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        prometheusUrl: "http://prometheus",
        lokiUrl: "http://loki:3100",
        tempoUrl: "http://tempo:3200",
      };

      return values[key];
    }),
  };
  const prisma = {
    deployment: {
      findUnique: jest.fn().mockResolvedValue({
        ...deploymentRecord,
        app: appRecord,
      }),
    },
    deploymentHealthSample: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const tenantContext = {
    requireWorkspaceId: jest.fn().mockReturnValue("workspace-id"),
  };
  const kubernetes = {
    buildManagedLabels: jest.fn().mockReturnValue({
      "rca-platform/workspace-id": "workspace-id",
      "rca-platform/app-id": "app-id",
      "rca-platform/deployment-id": "deployment-id",
    }),
    getDeploymentStatus: jest.fn(),
    listDeploymentPods: jest.fn(),
    listDeploymentEvents: jest.fn(),
  };
  const prometheus = { queryDeploymentMetrics: jest.fn() };
  const loki = { queryDeploymentLogs: jest.fn() };
  const tempo = { queryDeploymentTraces: jest.fn() };

  return {
    service: new TelemetryService(
      config as never,
      prisma as never,
      tenantContext as never,
      kubernetes as never,
      prometheus as never,
      loki as never,
      tempo as never,
    ),
    prisma,
    kubernetes,
    prometheus,
    loki,
    tempo,
  };
}
