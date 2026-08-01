# Runtime configuration

All RCA Platform services are configured at runtime through environment variables. Example files contain local placeholders only and must not be used to store production credentials. `DATABASE_URL`, API keys, bearer tokens, registry credentials, and private keys are secrets.

## Shared and deployment manager

| Variable | Service | Required | Default | Class | Behavior when absent |
|---|---|---:|---|---|---|
| `DATABASE_URL` | All | Yes | None | Secret | Deployment manager and MCP fail startup; agent validation fails. |
| `PORT` | Deployment manager | No | `3000` | Configuration | Uses the default HTTP port. |
| `DEFAULT_KUBERNETES_NAMESPACE` | Deployment manager | No | `apps` | Configuration | New managed applications use `apps`. |
| `REGISTRY_URL` | Deployment manager | No | None | Configuration | Registry-specific behavior uses the local registry settings. Credentials must be supplied separately. |
| `LOCAL_REGISTRY_HOST` | Deployment manager | No | `localhost:5001` | Configuration | Uses the default host-visible registry. |
| `LOCAL_REGISTRY_CLUSTER` | Deployment manager | No | `kind-registry:5000` | Configuration | Uses the default cluster-visible registry. |
| `BUILDPACK_BUILDER_IMAGE` | Deployment manager | No | `gcr.io/buildpacks/builder` | Configuration | Uses the default builder image. |
| `BUILDPACK_RUNNER_IMAGE` | Deployment manager | No | `ghcr.io/venumigihansa/nexcause-buildpack-runner:0.1.2` | Configuration | Uses the released buildpack runner image. |
| `OBSERVABILITY_ENABLED` | Deployment manager | No | `true` | Configuration | Observability polling remains enabled. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Deployment manager | No | in-cluster collector URL | Configuration | Exports to the default collector address. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Deployment manager | No | `http/protobuf` | Configuration | Uses OTLP over HTTP/protobuf. |
| `HEALTH_SAMPLE_INTERVAL_SECONDS` | Deployment manager | No | `60` | Configuration | Samples every 60 seconds. |
| `HEALTH_SAMPLE_RETENTION_MINUTES` | Deployment manager | No | `60` | Configuration | Retains samples for 60 minutes. |
| `INCIDENT_DETECTION_ENABLED` | Deployment manager | No | `true` | Configuration | Incident detection remains enabled. |
| `INCIDENT_DETECTION_INTERVAL_SECONDS` | Deployment manager | No | `60` | Configuration | Detects incidents every 60 seconds. |
| `AUTO_RCA_ENABLED` | Deployment manager | No | `true` | Configuration | Automatic RCA remains enabled. |
| `RCA_EVIDENCE_LOOKBACK_MINUTES` | Deployment manager | No | `10` | Configuration | Uses a 10-minute lookback. |
| `RCA_EVIDENCE_LOOKAHEAD_MINUTES` | Deployment manager | No | `2` | Configuration | Uses a 2-minute lookahead. |
| `RCA_MCP_SERVER_URL` | Deployment manager | No | in-cluster MCP URL | Configuration | Uses the default Kubernetes service URL. |
| `RCA_AGENT_SERVICE_URL` | Deployment manager | No | in-cluster agent URL | Configuration | Uses the default Kubernetes service URL. |
| `RCA_AGENT_ENABLED` | Deployment manager | No | `true` | Configuration | Agent integration remains enabled. |
| `RCA_AGENT_TRIGGER_MODE` | Deployment manager | No | `async` | Configuration | RCA work is triggered asynchronously. |

## RCA agent

| Variable | Required | Default | Class | Behavior when absent |
|---|---:|---|---|---|
| `PORT` | No | `8080` | Configuration | Uses the default HTTP port. |
| `RCA_MCP_SERVER_URL` | No | in-cluster MCP URL | Configuration | Uses the default Kubernetes service URL. |
| `RCA_AGENT_POLL_ENABLED` | No | `true` | Configuration | Background polling remains enabled. |
| `RCA_AGENT_POLL_INTERVAL_SECONDS` | No | `10` | Configuration | Polls every 10 seconds. |
| `RCA_MAX_FOLLOWUP_ROUNDS` | No | `2` | Configuration | Uses two follow-up rounds. |
| `RCA_MAX_VERIFIER_RETRIES` | No | `1` | Configuration | Uses one verifier retry. |
| `RCA_LLM_PROVIDER` | No | `gemini` | Configuration | Uses Gemini. |
| `RCA_LLM_MODEL` | No | `gemini-1.5-flash` | Configuration | Uses the default Gemini model. |
| `RCA_LLM_API_KEY` | Required for LLM calls | None | Secret | Service starts, but LLM-backed work cannot succeed. |
| `LANGGRAPH_CHECKPOINT_DB_URL` | No | None | Secret | Optional checkpoint storage is disabled. |

## MCP server

| Variable | Required | Default | Class | Behavior when absent |
|---|---:|---|---|---|
| `PORT` | No | `8080` | Configuration | Uses the default HTTP port. |
| `DEFAULT_LOOKBACK_MINUTES` | No | `10` | Configuration | Uses a 10-minute lookback. |
| `DEFAULT_LOOKAHEAD_MINUTES` | No | `2` | Configuration | Uses a 2-minute lookahead. |
| `MAX_RECURSION_DEPTH` | No | `3` | Configuration | Limits evidence recursion to three levels. |
| `MAX_LOG_LINES` | No | `500` | Configuration | Limits returned log lines. |
| `MAX_SAMPLES` | No | `120` | Configuration | Limits metric samples. |
| `MAX_SPANS` | No | `100` | Configuration | Limits trace spans. |
| `PROMETHEUS_URL` | No | None | Configuration | Prometheus evidence is unavailable. |
| `TEMPO_URL` | No | None | Configuration | Trace evidence is unavailable. |
| `LOG_BACKEND_URL` | No | None | Configuration | Central log evidence is unavailable. |
| `KUBERNETES_IN_CLUSTER` | No | `true` | Configuration | Uses in-cluster credentials. |
| `KUBERNETES_API_URL` | No | Kubernetes service URL | Configuration | Uses the default API endpoint. |
| `KUBERNETES_BEARER_TOKEN` | Required out of cluster when authenticated | None | Secret | Kubernetes evidence is disabled if the adapter cannot initialize. |
| `KUBERNETES_CA_FILE` | No | service-account CA path | Configuration | Uses the default service-account CA. |
| `POD_NAMESPACE` | No | None | Configuration | Kubernetes queries are not restricted to one configured namespace. |
| `HTTP_TIMEOUT_SECONDS` | No | `15` | Configuration | Backend requests time out after 15 seconds. |

## Image naming

Released images use the public `ghcr.io/venumigihansa/nexcause-*` repositories. CI publishes semantic-version tags and immutable `sha-<short-sha>` tags. Production deployments must not use `latest`.
