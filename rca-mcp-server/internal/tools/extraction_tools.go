package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
)

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

	health, _ := r.getHealthSamples(ctx, runArgs)
	status, _ := r.getDeploymentStatus(ctx, runArgs)
	pods, _ := r.getPods(ctx, runArgs)
	events, _ := r.getKubernetesEvents(ctx, runArgs)
	bundles = append(bundles, health, status, pods, events)

	if depth > 0 {
		if focus == "logs" || hasSignal(health, "restart_count_increased") || hasSignal(pods, "container_restarts_present") {
			logs, _ := r.getLogs(ctx, runArgs)
			bundles = append(bundles, logs)
		}
		if focus == "metrics" || hasSignal(status, "ready_replicas_below_desired") {
			metrics, _ := r.getMetrics(ctx, runArgs)
			bundles = append(bundles, metrics)
		}
		if focus == "traces" || hasSignalNamed(bundles, "metric_spike") {
			traces, _ := r.getTraces(ctx, runArgs)
			bundles = append(bundles, traces)
		}
		if focus == "changes" || focus == "overview" {
			changes, _ := r.getRecentChanges(ctx, runArgs)
			runtimeConfigs, _ := r.getRuntimeConfigs(ctx, runArgs)
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
