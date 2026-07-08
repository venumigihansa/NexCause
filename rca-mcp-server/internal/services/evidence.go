package services

import (
	"context"
	"fmt"

	"rca-mcp-server/internal/evidence"
)

type EvidenceService struct {
	services *Services
}

func (s *EvidenceService) ExtractEvidence(ctx context.Context, req ExtractRequest) (map[string]any, error) {
	c, err := s.services.Context.GetRCAContext(ctx, req.EvidenceRequest)
	if err != nil {
		return nil, err
	}
	focus := req.Focus
	if focus == "" {
		focus = "overview"
	}
	if !validFocus(focus) {
		return nil, fmt.Errorf("invalid focus %q", focus)
	}
	depth := req.Depth
	if depth < 0 {
		return nil, fmt.Errorf("depth must be greater than or equal to 0")
	}
	if depth > c.Constraints.MaxRecursionDepth {
		depth = c.Constraints.MaxRecursionDepth
	}

	bundles := []evidence.Bundle{}
	health, _ := s.services.Store.GetHealthSamples(ctx, req.EvidenceRequest)
	status, _ := s.services.Kubernetes.GetDeploymentStatus(ctx, req.EvidenceRequest)
	pods, _ := s.services.Kubernetes.GetPods(ctx, req.EvidenceRequest)
	events, _ := s.services.Kubernetes.GetEvents(ctx, req.EvidenceRequest)
	bundles = append(bundles, health, status, pods, events)

	if depth > 0 {
		if focus == "logs" || hasSignal(health, "restart_count_increased") || hasSignal(pods, "container_restarts_present") {
			logs, _ := s.services.Logs.GetLogs(ctx, req.EvidenceRequest)
			bundles = append(bundles, logs)
		}
		if focus == "metrics" || hasSignal(status, "ready_replicas_below_desired") {
			metrics, _ := s.services.Metrics.GetMetrics(ctx, req.EvidenceRequest)
			bundles = append(bundles, metrics)
		}
		if focus == "traces" || hasSignalNamed(bundles, "metric_spike") {
			traces, _ := s.services.Traces.GetTraces(ctx, req.EvidenceRequest)
			bundles = append(bundles, traces)
		}
		if focus == "changes" || focus == "overview" {
			changes, _ := s.services.Store.GetRecentChanges(ctx, req.EvidenceRequest)
			runtimeConfigs, _ := s.services.Store.GetRuntimeConfigs(ctx, req.EvidenceRequest)
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

func validFocus(focus string) bool {
	switch focus {
	case "overview", "logs", "metrics", "traces", "changes":
		return true
	default:
		return false
	}
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
