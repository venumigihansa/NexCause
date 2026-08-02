export default () => ({
  observabilityEnabled: process.env.OBSERVABILITY_ENABLED !== "false",
  otelExporterOtlpEndpoint:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    "http://otel-collector-opentelemetry-collector.observability.svc.cluster.local:4318",
  otelExporterOtlpProtocol:
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL ?? "http/protobuf",
  healthSampleIntervalSeconds: Number(
    process.env.HEALTH_SAMPLE_INTERVAL_SECONDS ?? 60,
  ),
  healthSampleRetentionMinutes: Number(
    process.env.HEALTH_SAMPLE_RETENTION_MINUTES ?? 60,
  ),
  prometheusUrl: process.env.PROMETHEUS_URL ?? "",
  lokiUrl: process.env.LOKI_URL ?? "",
  tempoUrl: process.env.TEMPO_URL ?? "",
  telemetryQueryTimeoutSeconds: Number(
    process.env.TELEMETRY_QUERY_TIMEOUT_SECONDS ?? 15,
  ),
  telemetryMaxLookbackMinutes: Number(
    process.env.TELEMETRY_MAX_LOOKBACK_MINUTES ?? 360,
  ),
  telemetryMaxLogLines: Number(process.env.TELEMETRY_MAX_LOG_LINES ?? 500),
  telemetryMaxTraces: Number(process.env.TELEMETRY_MAX_TRACES ?? 200),
});
