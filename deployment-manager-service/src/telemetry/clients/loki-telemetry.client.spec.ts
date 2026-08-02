import { LokiTelemetryClient } from "./loki-telemetry.client";

describe("LokiTelemetryClient", () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        lokiUrl: "http://loki:3100",
        telemetryQueryTimeoutSeconds: 15,
      };

      return values[key];
    }),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("builds a namespace and deployment scoped LogQL query", () => {
    const client = new LokiTelemetryClient(config as never);

    expect(
      client.buildQuery({
        namespace: "rca-w-tenant",
        deploymentName: "orders-a1b2c3d4",
      }),
    ).toBe('{service_namespace="rca-w-tenant"} |~ "orders-a1b2c3d4"');
  });

  it("redacts secrets and filters by level", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              result: [
                {
                  stream: { k8s_pod_name: "orders-pod" },
                  values: [
                    [
                      "1785628800000000000",
                      "error password=hunter2 token=abc123 failed request",
                    ],
                    ["1785628801000000000", "normal line"],
                  ],
                },
              ],
            },
          }),
        ),
    } as Response);
    const client = new LokiTelemetryClient(config as never);

    const logs = await client.queryDeploymentLogs({
      namespace: "rca-w-tenant",
      deploymentName: "orders-a1b2c3d4",
      start: new Date("2026-08-02T00:00:00.000Z"),
      end: new Date("2026-08-02T00:01:00.000Z"),
      limit: 100,
      level: "error",
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].line).toContain("password=[REDACTED]");
    expect(logs[0].line).toContain("token=[REDACTED]");
    expect(logs[0].level).toBe("error");
  });
});
