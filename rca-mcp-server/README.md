# RCA MCP Server

Go MCP evidence server for Phase 10. It exposes read-only scoped tools on `/mcp`, builds ephemeral RCA context from `runId` and `incidentId`, queries Kubernetes/Postgres/Prometheus/Tempo/logs, and returns normalized evidence bundles.

The server does not persist RCA context, raw telemetry, or MCP tool output.

## Tools

- `get_rca_context`
- `get_deployment_status`
- `get_pods`
- `get_kubernetes_events`
- `get_logs`
- `get_metrics`
- `get_traces`
- `get_health_samples`
- `get_runtime_configs`
- `get_recent_changes`

## Minimal MCP Call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_rca_context",
    "arguments": {
      "runId": "rca-run-id",
      "incidentId": "incident-id"
    }
  }
}
```
