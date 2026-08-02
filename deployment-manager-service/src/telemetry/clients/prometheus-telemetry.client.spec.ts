import { PrometheusTelemetryClient } from "./prometheus-telemetry.client";

describe("PrometheusTelemetryClient", () => {
  it("builds backend-owned deployment-scoped metric queries", () => {
    const client = new PrometheusTelemetryClient({ get: jest.fn() } as never);

    const queries = client.buildQueries({
      namespace: "rca-w-tenant",
      deploymentName: "orders-a1b2c3d4",
      deploymentId: "deployment-id",
    });

    expect(queries.map((query) => query.name)).toEqual([
      "cpu_usage_seconds_rate",
      "memory_working_set_bytes",
      "container_restarts_total",
      "http_5xx_rate",
      "http_duration_p95_seconds",
    ]);
    expect(queries[0].query).toContain('namespace="rca-w-tenant"');
    expect(queries[0].query).toContain('pod=~"orders-a1b2c3d4-.*"');
    expect(queries[3].query).toContain('deployment_id="deployment-id"');
    expect(queries[4].query).toContain('deployment_id="deployment-id"');
  });
});
