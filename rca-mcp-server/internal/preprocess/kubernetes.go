package preprocess

import (
	"fmt"
	"sort"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func DeploymentStatus(scope evidence.Scope, start time.Time, end time.Time, status adapters.K8sDeploymentStatus) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceKubernetes, scope, start, end)
	bundle.Summary = fmt.Sprintf("Deployment readiness is %d/%d ready replicas with %d unavailable replicas.", status.ReadyReplicas, status.DesiredReplicas, status.UnavailableReplicas)
	bundle.Samples = []any{status}
	bundle.Stats = map[string]float64{
		"desiredReplicas":     float64(status.DesiredReplicas),
		"readyReplicas":       float64(status.ReadyReplicas),
		"availableReplicas":   float64(status.AvailableReplicas),
		"unavailableReplicas": float64(status.UnavailableReplicas),
	}
	if status.DesiredReplicas > 0 && status.ReadyReplicas < status.DesiredReplicas {
		bundle.Signals = append(bundle.Signals, evidence.Signal{
			Name:     "ready_replicas_below_desired",
			Severity: "critical",
			Value:    fmt.Sprintf("%d/%d", status.ReadyReplicas, status.DesiredReplicas),
			Reason:   "Deployment has fewer ready replicas than desired.",
		})
	}
	if status.UnavailableReplicas > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{
			Name:     "unavailable_replicas",
			Severity: "warning",
			Value:    status.UnavailableReplicas,
			Reason:   "Deployment reports unavailable replicas.",
		})
	}
	return bundle
}

func Pods(scope evidence.Scope, start time.Time, end time.Time, pods []adapters.K8sPod, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceKubernetes, scope, start, end)
	totalRestarts := 0
	notReady := 0
	for _, pod := range pods {
		for _, container := range pod.Containers {
			totalRestarts += container.RestartCount
			if !container.Ready {
				notReady++
			}
		}
	}
	samples := trimAny(toAnySlice(pods), limit)
	bundle.Samples = samples.items
	bundle.Truncated = samples.truncated
	bundle.Summary = fmt.Sprintf("Found %d pod(s), %d not-ready container(s), and %d total restart(s).", len(pods), notReady, totalRestarts)
	bundle.Stats = map[string]float64{
		"podCount":             float64(len(pods)),
		"notReadyContainers":   float64(notReady),
		"totalRestartCount":    float64(totalRestarts),
	}
	if notReady > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "containers_not_ready", Severity: "warning", Value: notReady})
	}
	if totalRestarts > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "container_restarts_present", Severity: "warning", Value: totalRestarts})
	}
	return bundle
}

func Events(scope evidence.Scope, start time.Time, end time.Time, events []adapters.K8sEvent, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceKubernetes, scope, start, end)
	sort.SliceStable(events, func(i, j int) bool {
		return eventTime(events[i]).Before(eventTime(events[j]))
	})

	warningCount := 0
	groupCounts := map[string]int{}
	for _, event := range events {
		if event.Type == "Warning" {
			warningCount++
		}
		key := event.Type + ":" + event.Reason + ":" + event.InvolvedKind
		groupCounts[key] += maxInt(event.Count, 1)
	}

	samples := trimAny(toAnySlice(events), limit)
	bundle.Samples = samples.items
	bundle.Truncated = samples.truncated
	bundle.Summary = fmt.Sprintf("Found %d Kubernetes event(s), including %d warning event(s).", len(events), warningCount)
	bundle.Stats = map[string]float64{
		"eventCount":        float64(len(events)),
		"warningEventCount": float64(warningCount),
	}
	if warningCount > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{
			Name:       "kubernetes_warning_events",
			Severity:   "warning",
			Value:      warningCount,
			Attributes: map[string]any{"groups": groupCounts},
		})
	}
	return bundle
}

func eventTime(event adapters.K8sEvent) time.Time {
	if event.EventTime != nil {
		return *event.EventTime
	}
	if event.LastTimestamp != nil {
		return *event.LastTimestamp
	}
	if event.FirstTimestamp != nil {
		return *event.FirstTimestamp
	}
	return time.Time{}
}
