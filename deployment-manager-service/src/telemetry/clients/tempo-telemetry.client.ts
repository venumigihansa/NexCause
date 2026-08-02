import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface TelemetryTraceSummary {
  traceId: string;
  rootService?: string;
  rootOperation?: string;
  durationMs?: number;
  status?: string;
  attributes: Record<string, string>;
}

@Injectable()
export class TempoTelemetryClient {
  constructor(private readonly configService: ConfigService) {}

  async queryDeploymentTraces(input: {
    appName: string;
    deploymentId: string;
    start: Date;
    end: Date;
    limit: number;
  }): Promise<TelemetryTraceSummary[]> {
    const url = new URL("/api/search", this.baseUrl());
    url.searchParams.set(
      "tags",
      `service.name=${input.appName} deployment.id=${input.deploymentId}`,
    );
    url.searchParams.set(
      "start",
      String(Math.floor(input.start.getTime() / 1000)),
    );
    url.searchParams.set("end", String(Math.floor(input.end.getTime() / 1000)));
    url.searchParams.set("limit", String(input.limit));

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Tempo returned ${response.status}: ${body}`);
    }

    const parsed = JSON.parse(body) as {
      traces?: Array<{
        traceID?: string;
        traceId?: string;
        rootServiceName?: string;
        rootTraceName?: string;
        durationMs?: number;
        status?: string;
        attributes?: Record<string, string>;
      }>;
    };

    return (parsed.traces ?? []).map((trace) => ({
      traceId: trace.traceID ?? trace.traceId ?? "",
      rootService: trace.rootServiceName,
      rootOperation: trace.rootTraceName,
      durationMs: trace.durationMs,
      status: trace.status,
      attributes: trace.attributes ?? {},
    }));
  }

  private baseUrl(): string {
    const value = this.configService.get<string>("tempoUrl") ?? "";
    if (!value) {
      throw new Error("TEMPO_URL is not configured");
    }
    return value;
  }

  private timeoutMs(): number {
    const seconds =
      this.configService.get<number>("telemetryQueryTimeoutSeconds") ?? 15;
    return Math.max(1, seconds) * 1000;
  }
}
