package tools

import (
	"context"
	"fmt"
	"log/slog"

	"rca-mcp-server/internal/services"
)

type Dependencies struct {
	Services *services.Services
	Logger   *slog.Logger
}

type Registry struct {
	deps Dependencies
}

type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

func NewRegistry(deps Dependencies) *Registry {
	return &Registry{deps: deps}
}

func (r *Registry) ListTools() []ToolDefinition {
	return []ToolDefinition{
		tool("get_rca_context", "Build ephemeral RCA context from runId and incidentId.", []string{"runId", "incidentId"}),
		tool("get_deployment_status", "Read Kubernetes deployment replica/condition status for the scoped deployment.", []string{"runId", "incidentId"}),
		tool("get_pods", "Read and preprocess scoped pod status and restart data.", []string{"runId", "incidentId"}),
		tool("get_kubernetes_events", "Read and preprocess scoped Kubernetes events.", []string{"runId", "incidentId"}),
		tool("get_logs", "Read and preprocess scoped logs from configured log backend or Kubernetes pod logs.", []string{"runId", "incidentId"}),
		tool("get_metrics", "Read and preprocess scoped Prometheus metrics.", []string{"runId", "incidentId"}),
		tool("get_traces", "Read and preprocess scoped Tempo traces.", []string{"runId", "incidentId"}),
		tool("get_health_samples", "Read and preprocess stored deployment health samples.", []string{"runId", "incidentId"}),
		tool("get_runtime_configs", "Read and sanitize scoped runtime config metadata.", []string{"runId", "incidentId"}),
		tool("get_recent_changes", "Read recent deployment/runtime changes for the scoped window.", []string{"runId", "incidentId"}),
		tool("extract_evidence", "Run focused recursive evidence extraction over scoped telemetry.", []string{"runId", "incidentId"}),
	}
}

func (r *Registry) Call(ctx context.Context, name string, args map[string]any) (any, error) {
	switch name {
	case "get_rca_context":
		return r.getRCAContext(ctx, args)
	case "get_deployment_status":
		return r.getDeploymentStatus(ctx, args)
	case "get_pods":
		return r.getPods(ctx, args)
	case "get_kubernetes_events":
		return r.getKubernetesEvents(ctx, args)
	case "get_logs":
		return r.getLogs(ctx, args)
	case "get_metrics":
		return r.getMetrics(ctx, args)
	case "get_traces":
		return r.getTraces(ctx, args)
	case "get_health_samples":
		return r.getHealthSamples(ctx, args)
	case "get_runtime_configs":
		return r.getRuntimeConfigs(ctx, args)
	case "get_recent_changes":
		return r.getRecentChanges(ctx, args)
	case "extract_evidence":
		return r.extractEvidence(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool %q", name)
	}
}

func tool(name string, description string, required []string) ToolDefinition {
	return ToolDefinition{
		Name:        name,
		Description: description,
		InputSchema: map[string]any{
			"type":     "object",
			"required": required,
			"properties": map[string]any{
				"runId":      map[string]any{"type": "string"},
				"incidentId": map[string]any{"type": "string"},
				"focus":      map[string]any{"type": "string"},
				"depth":      map[string]any{"type": "integer", "minimum": 0},
			},
		},
	}
}
