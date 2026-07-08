package tools

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/config"
	rcacontext "rca-mcp-server/internal/context"
	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
	"rca-mcp-server/internal/store"
)

type Dependencies struct {
	Config         config.Config
	ContextBuilder *rcacontext.Builder
	Store          store.MetadataStore
	Kubernetes     *adapters.KubernetesAdapter
	Metrics        *adapters.PrometheusAdapter
	Traces         *adapters.TempoAdapter
	Logs           *adapters.LogBackendAdapter
	Logger         *slog.Logger
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
		return r.contextFromArgs(ctx, args)
	case "get_deployment_status":
		return r.deploymentStatus(ctx, args)
	case "get_pods":
		return r.pods(ctx, args)
	case "get_kubernetes_events":
		return r.events(ctx, args)
	case "get_logs":
		return r.logs(ctx, args)
	case "get_metrics":
		return r.metrics(ctx, args)
	case "get_traces":
		return r.traces(ctx, args)
	case "get_health_samples":
		return r.healthSamples(ctx, args)
	case "get_runtime_configs":
		return r.runtimeConfigs(ctx, args)
	case "get_recent_changes":
		return r.recentChanges(ctx, args)
	case "extract_evidence":
		return r.extractEvidence(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool %q", name)
	}
}

func (r *Registry) contextFromArgs(ctx context.Context, args map[string]any) (rcacontext.RCAContext, error) {
	runID, incidentID, err := requiredRunIncident(args)
	if err != nil {
		return rcacontext.RCAContext{}, err
	}
	return r.deps.ContextBuilder.Build(ctx, runID, incidentID)
}

func (r *Registry) deploymentStatus(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	status, err := r.deps.Kubernetes.DeploymentStatus(ctx, c.Scope.Namespace, c.Scope.DeploymentName)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.DeploymentStatus(c.Scope, start, end, status), nil
}

func (r *Registry) pods(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	pods, err := r.deps.Kubernetes.Pods(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Pods(c.Scope, start, end, pods, c.Constraints.MaxSamples), nil
}

func (r *Registry) events(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	events, err := r.deps.Kubernetes.Events(ctx, c.Scope.Namespace, c.Scope.DeploymentName, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Events(c.Scope, start, end, events, c.Constraints.MaxSamples), nil
}

func (r *Registry) logs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	logs, err := r.deps.Logs.QueryLogs(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end, c.Constraints.MaxLogLines)
	if err != nil && r.deps.Kubernetes != nil {
		logs, err = r.deps.Kubernetes.Logs(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID, end.Sub(start), c.Constraints.MaxLogLines)
	}
	if err != nil {
		return withError(evidence.SourceLogs, c.Scope, start, end, err), nil
	}
	return preprocess.Logs(c.Scope, start, end, logs, c.Constraints.MaxLogLines), nil
}

func (r *Registry) metrics(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	series, err := r.deps.Metrics.QueryDeploymentMetrics(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end)
	if err != nil {
		return withError(evidence.SourceMetrics, c.Scope, start, end, err), nil
	}
	return preprocess.Metrics(c.Scope, start, end, series, c.Constraints.MaxSamples), nil
}

func (r *Registry) traces(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	traces, err := r.deps.Traces.QueryDeploymentTraces(ctx, c.Scope.ServiceName, start, end)
	if err != nil {
		return withError(evidence.SourceTraces, c.Scope, start, end, err), nil
	}
	return preprocess.Traces(c.Scope, start, end, traces, c.Constraints.MaxSpans), nil
}

func (r *Registry) healthSamples(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	samples, err := r.deps.Store.ListHealthSamples(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceHealthSample, c.Scope, start, end, err), nil
	}
	return preprocess.HealthSamples(c.Scope, start, end, samples, c.Constraints.MaxSamples), nil
}

func (r *Registry) runtimeConfigs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	configs, err := r.deps.Store.ListRuntimeConfigs(ctx, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceRuntime, c.Scope, start, end, err), nil
	}
	return preprocess.RuntimeConfigs(c.Scope, start, end, configs, c.Constraints.MaxSamples), nil
}

func (r *Registry) recentChanges(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	changes, err := r.deps.Store.ListRecentChanges(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceChanges, c.Scope, start, end, err), nil
	}
	return preprocess.RecentChanges(c.Scope, start, end, changes, c.Constraints.MaxSamples), nil
}

func (r *Registry) extractEvidence(ctx context.Context, args map[string]any) (map[string]any, error) {
	c, _, _, err := r.scopedContext(ctx, args)
	if err != nil {
		return nil, err
	}
	focus := stringArg(args, "focus", "overview")
	depth := intArg(args, "depth", 0)
	if depth > c.Constraints.MaxRecursionDepth {
		depth = c.Constraints.MaxRecursionDepth
	}

	runArgs := map[string]any{"runId": c.Run.ID, "incidentId": c.Incident.ID}
	bundles := []evidence.Bundle{}

	health, _ := r.healthSamples(ctx, runArgs)
	status, _ := r.deploymentStatus(ctx, runArgs)
	pods, _ := r.pods(ctx, runArgs)
	events, _ := r.events(ctx, runArgs)
	bundles = append(bundles, health, status, pods, events)

	if depth > 0 {
		if focus == "logs" || hasSignal(health, "restart_count_increased") || hasSignal(pods, "container_restarts_present") {
			logs, _ := r.logs(ctx, runArgs)
			bundles = append(bundles, logs)
		}
		if focus == "metrics" || hasSignal(status, "ready_replicas_below_desired") {
			metrics, _ := r.metrics(ctx, runArgs)
			bundles = append(bundles, metrics)
		}
		if focus == "traces" || hasSignalNamed(bundles, "metric_spike") {
			traces, _ := r.traces(ctx, runArgs)
			bundles = append(bundles, traces)
		}
		if focus == "changes" || focus == "overview" {
			changes, _ := r.recentChanges(ctx, runArgs)
			runtimeConfigs, _ := r.runtimeConfigs(ctx, runArgs)
			bundles = append(bundles, changes, runtimeConfigs)
		}
	}

	return map[string]any{
		"context":     c,
		"focus":       focus,
		"depth":       depth,
		"bundles":     bundles,
		"summary":     summarizeBundles(bundles),
		"persistence": "none",
	}, nil
}

func (r *Registry) scopedContext(ctx context.Context, args map[string]any) (rcacontext.RCAContext, time.Time, time.Time, error) {
	c, err := r.contextFromArgs(ctx, args)
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	start, end, err := c.WindowTimes()
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	return c, start, end, nil
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

func requiredRunIncident(args map[string]any) (string, string, error) {
	runID := stringArg(args, "runId", "")
	incidentID := stringArg(args, "incidentId", "")
	if runID == "" || incidentID == "" {
		return "", "", fmt.Errorf("runId and incidentId are required")
	}
	return runID, incidentID, nil
}

func stringArg(args map[string]any, key string, fallback string) string {
	value, ok := args[key].(string)
	if !ok || value == "" {
		return fallback
	}
	return value
}

func intArg(args map[string]any, key string, fallback int) int {
	value, ok := args[key].(float64)
	if !ok {
		return fallback
	}
	return int(value)
}

func withError(source evidence.Source, scope evidence.Scope, start time.Time, end time.Time, err error) evidence.Bundle {
	bundle := evidence.NewBundle(source, scope, start, end)
	bundle.Summary = "Evidence collection failed."
	bundle.Errors = append(bundle.Errors, evidence.CollectionError{Source: string(source), Message: err.Error()})
	return bundle
}

func unavailable(source evidence.Source, scope evidence.Scope, start time.Time, end time.Time, message string) evidence.Bundle {
	bundle := evidence.NewBundle(source, scope, start, end)
	bundle.Summary = message
	bundle.Errors = append(bundle.Errors, evidence.CollectionError{Source: string(source), Message: message})
	return bundle
}

func hasSignal(bundle evidence.Bundle, name string) bool {
	for _, signal := range bundle.Signals {
		if signal.Name == name {
			return true
		}
	}
	return false
}

func hasSignalNamed(bundles []evidence.Bundle, name string) bool {
	for _, bundle := range bundles {
		if hasSignal(bundle, name) {
			return true
		}
	}
	return false
}

func summarizeBundles(bundles []evidence.Bundle) []string {
	summaries := []string{}
	for _, bundle := range bundles {
		summaries = append(summaries, string(bundle.Source)+": "+bundle.Summary)
	}
	return summaries
}
