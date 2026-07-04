# Local Observability Stack

These files are Helm values for the local Kind observability stack used by the
deployment manager during Phase 8.

The stack is:

- OpenTelemetry Collector: receives OTLP telemetry from deployed apps.
- Prometheus: stores metrics scraped from the collector and Kubernetes.
- Tempo: stores traces exported by the collector.

Install order:

```bash
kubectl create namespace observability

helm install tempo grafana/tempo \
  -n observability \
  -f k8s/observability/tempo-values.yaml

helm install prometheus prometheus-community/prometheus \
  -n observability \
  -f k8s/observability/prometheus-simple-values.yaml

helm install otel-collector open-telemetry/opentelemetry-collector \
  -n observability \
  -f k8s/observability/otel-collector-values.yaml
```

If the namespace already exists, skip the `kubectl create namespace` command.

The in-cluster OTLP endpoint for app containers is:

```text
http://otel-collector-opentelemetry-collector.observability.svc.cluster.local:4318
```

Use port `4318` for OTLP HTTP and port `4317` for OTLP gRPC.
