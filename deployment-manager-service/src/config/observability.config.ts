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
});
