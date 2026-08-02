import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type LogLevel = "error" | "warning" | "info";

export interface TelemetryLogRow {
  timestamp: string;
  podName: string;
  line: string;
  level: LogLevel;
  labels: Record<string, string>;
}

interface LokiStreamResult {
  stream: Record<string, string>;
  values: Array<[string, string]>;
}

const SECRET_PATTERNS = [
  /((?:password|secret|token|api[_-]?key)=)\S+/gi,
  /(authorization:\s*bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
];

@Injectable()
export class LokiTelemetryClient {
  constructor(private readonly configService: ConfigService) {}

  async queryDeploymentLogs(input: {
    namespace: string;
    deploymentName: string;
    start: Date;
    end: Date;
    limit: number;
    level?: LogLevel;
  }): Promise<TelemetryLogRow[]> {
    const url = new URL("/loki/api/v1/query_range", this.baseUrl());
    url.searchParams.set("query", this.buildQuery(input));
    url.searchParams.set("start", String(input.start.getTime() * 1_000_000));
    url.searchParams.set("end", String(input.end.getTime() * 1_000_000));
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("direction", "backward");

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Loki returned ${response.status}: ${body}`);
    }

    const parsed = JSON.parse(body) as {
      data?: { result?: LokiStreamResult[] };
    };
    const rows = (parsed.data?.result ?? []).flatMap((result) =>
      result.values.map(([nanoseconds, line]) => {
        const redacted = redact(line);
        return {
          timestamp: new Date(Number(nanoseconds) / 1_000_000).toISOString(),
          podName: podName(result.stream, input.deploymentName),
          line: redacted,
          level: classify(redacted),
          labels: result.stream,
        };
      }),
    );

    return rows
      .filter((row) => !input.level || row.level === input.level)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-input.limit);
  }

  buildQuery(input: { namespace: string; deploymentName: string }): string {
    return `{service_namespace=${quote(input.namespace)}} |~ ${quote(input.deploymentName)}`;
  }

  private baseUrl(): string {
    const value = this.configService.get<string>("lokiUrl") ?? "";
    if (!value) {
      throw new Error("LOKI_URL is not configured");
    }
    return value;
  }

  private timeoutMs(): number {
    const seconds =
      this.configService.get<number>("telemetryQueryTimeoutSeconds") ?? 15;
    return Math.max(1, seconds) * 1000;
  }
}

function redact(line: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "$1[REDACTED]"),
    line,
  );
}

function classify(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("exception") ||
    lower.includes("failed") ||
    lower.includes("panic")
  ) {
    return "error";
  }
  if (lower.includes("warn")) {
    return "warning";
  }
  return "info";
}

function podName(labels: Record<string, string>, fallback: string): string {
  return labels.k8s_pod_name ?? labels.pod ?? labels.service_name ?? fallback;
}

function quote(value: string): string {
  return JSON.stringify(value);
}
