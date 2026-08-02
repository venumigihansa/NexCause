import { DeploymentsService } from "./deployments.service";

describe("DeploymentsService application exposure", () => {
  it("keeps deployments internal when expose is omitted", async () => {
    const fixture = serviceFixture({});

    const result = await fixture.service.create("app-id", {
      image: "nginx:1.27",
      port: 8080,
    });

    expect(fixture.kubernetes.deployImage).toHaveBeenCalledWith(
      expect.objectContaining({ routing: undefined }),
    );
    expect(fixture.prisma.deployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicHostname: undefined }),
      }),
    );
    expect(result.publicUrl).toBeNull();
  });

  it("creates routing input and returns a public URL when expose is true", async () => {
    const fixture = serviceFixture({
      applicationRoutingEnabled: true,
      applicationGatewayName: "rca-gateway",
      applicationGatewayNamespace: "rca-platform",
      applicationWildcardHostname: "*.apps.rca.local",
      gatewayAccessNamespaceLabelKey: "rca-platform.io/gateway-access",
      gatewayAccessNamespaceLabelValue: "true",
    });

    const result = await fixture.service.create("app-id", {
      image: "nginx:1.27",
      port: 8080,
      expose: true,
    });

    expect(fixture.kubernetes.deployImage).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: expect.objectContaining({
          hostname: expect.stringMatching(
            /^orders-[a-f0-9]{8}\.apps\.rca\.local$/,
          ),
          gatewayName: "rca-gateway",
          gatewayNamespace: "rca-platform",
        }),
      }),
    );
    expect(result.publicUrl).toMatch(
      /^https:\/\/orders-[a-f0-9]{8}\.apps\.rca\.local$/,
    );
  });

  it("rejects public exposure when application routing is disabled", async () => {
    const fixture = serviceFixture({});

    await expect(
      fixture.service.create("app-id", {
        image: "nginx:1.27",
        port: 8080,
        expose: true,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fixture.prisma.deployment.create).not.toHaveBeenCalled();
  });
});

function serviceFixture(config: Record<string, unknown>) {
  const apps = {
    findOneOrThrow: jest.fn().mockResolvedValue({
      id: "app-id",
      name: "orders",
      defaultPort: 8080,
    }),
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  };
  const names = {
    deploymentName: "orders-a1b2c3d4",
    serviceName: "orders-a1b2c3d4-svc",
    configMapName: "orders-a1b2c3d4-env",
    fileConfigMapName: "orders-a1b2c3d4-files",
    secretName: "orders-a1b2c3d4-secret",
    secretFileSecretName: "orders-a1b2c3d4-secret-files",
    httpRouteName: "orders-a1b2c3d4-route",
    httpRedirectRouteName: "orders-a1b2c3d4-redirect",
  };
  const kubernetes = {
    buildResourceNames: jest.fn().mockReturnValue(names),
    buildManagedLabels: jest.fn().mockReturnValue({
      "rca-platform/deployment-id": "deployment-id",
    }),
    deployImage: jest.fn().mockResolvedValue(undefined),
  };
  const observability = {
    buildTelemetryEnv: jest.fn().mockReturnValue({}),
  };
  const prisma = {
    workspace: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ kubernetesNamespace: "rca-w-tenant" }),
    },
    deployment: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          workspaceId: "workspace-id",
          runtimeConfigs: [],
        }),
      ),
      update: jest.fn(),
    },
  };
  const tenantContext = {
    requireWorkspaceId: jest.fn().mockReturnValue("workspace-id"),
  };
  const authorization = { requirePermissions: jest.fn() };

  return {
    service: new DeploymentsService(
      apps as never,
      configService as never,
      kubernetes as never,
      observability as never,
      prisma as never,
      tenantContext as never,
      authorization as never,
    ),
    kubernetes,
    prisma,
  };
}
