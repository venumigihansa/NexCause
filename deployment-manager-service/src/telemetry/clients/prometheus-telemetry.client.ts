import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface MetricSeries {
  name: string;
  labels: Record<string, string>;
  values: MetricPoint[];
}

interface QueryRangeResult {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

@Injectable()
export class PrometheusTelemetryClient {
  constructor(private readonly configService: ConfigService) {}

  async queryDeploymentMetrics(input: {
    namespace: string;
    deploymentName: string;
    deploymentId: string;
    start: Date;
    end: Date;
    stepSeconds: number;
  }): Promise<MetricSeries[]> {
    const queries = this.buildQueries(input);

    return Promise.all(
      queries.map(async ({ name, query }) => ({
        name,
        ...(await this.queryRange(
          query,
          input.start,
          input.end,
          input.stepSeconds,
        )),
      })),
    );
  }

  buildQueries(input: {
    namespace: string;
    deploymentName: string;
    deploymentId: string;
  }): Array<{ name: string; query: string }> {
    const podRegex = `${input.deploymentName}-.*`;

    return [
      {
        name: "cpu_usage_seconds_rate",
        query: `sum(rate(container_cpu_usage_seconds_total{namespace=${quote(input.namespace)},pod=~${quote(podRegex)},container!="POD",container!=""}[5m]))`,
      },
      {
        name: "memory_working_set_bytes",
        query: `sum(container_memory_working_set_bytes{namespace=${quote(input.namespace)},pod=~${quote(podRegex)},container!="POD",container!=""})`,
      },
      {
        name: "container_restarts_total",
        query: `sum(kube_pod_container_status_restarts_total{namespace=${quote(input.namespace)},pod=~${quote(podRegex)}})`,
      },
      {
        name: "http_5xx_rate",
        query: `sum(rate(http_server_request_duration_seconds_count{deployment_id=${quote(input.deploymentId)},http_response_status_code=~"5.."}[5m])) or sum(rate(http_server_requests_total{deployment_id=${quote(input.deploymentId)},status=~"5.."}[5m]))`,
      },
      {
        name: "http_duration_p95_seconds",
        query: `histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{deployment_id=${quote(input.deploymentId)}}[5m])) by (le))`,
      },
    ];
  }

  private async queryRange(
    query: string,
    start: Date,
    end: Date,
    stepSeconds: number,
  ): Promise<{ labels: Record<string, string>; values: MetricPoint[] }> {
    const baseUrl = this.baseUrl();
    const url = new URL("/api/v1/query_range", baseUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("start", String(Math.floor(start.getTime() / 1000)));
    url.searchParams.set("end", String(Math.floor(end.getTime() / 1000)));
    url.searchParams.set("step", String(stepSeconds));

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Prometheus returned ${response.status}: ${body}`);
    }

    const parsed = JSON.parse(body) as {
      data?: { result?: QueryRangeResult[] };
    };
    const result = parsed.data?.result?.[0];

    if (!result) {
      return { labels: {}, values: [] };
    }

    return {
      labels: result.metric ?? {},
      values: result.values
        .map(([timestamp, value]) => ({
          timestamp: new Date(timestamp * 1000).toISOString(),
          value: Number(value),
        }))
        .filter((point) => Number.isFinite(point.value)),
    };
  }

  private baseUrl(): string {
    const value = this.configService.get<string>("prometheusUrl") ?? "";
    if (!value) {
      throw new Error("PROMETHEUS_URL is not configured");
    }
    return value;
  }

  private timeoutMs(): number {
    const seconds =
      this.configService.get<number>("telemetryQueryTimeoutSeconds") ?? 15;
    return Math.max(1, seconds) * 1000;
  }
}

function quote(value: string): string {
  return JSON.stringify(value);
}
