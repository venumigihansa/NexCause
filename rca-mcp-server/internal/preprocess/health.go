package preprocess

import (
	"fmt"
	"time"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/store"
)

func HealthSamples(scope evidence.Scope, start time.Time, end time.Time, samples []store.HealthSample, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceHealthSample, scope, start, end)
	trimmed := trimAny(toAnySlice(samples), limit)
	bundle.Samples = trimmed.items
	bundle.Truncated = trimmed.truncated

	if len(samples) == 0 {
		bundle.Summary = "No health samples were available in the incident window."
		return bundle
	}

	newest := samples[0]
	oldest := samples[len(samples)-1]
	restartDelta := newest.RestartCount - oldest.RestartCount
	readinessDegraded := newest.DesiredReplicas > 0 && newest.ReadyReplicas < newest.DesiredReplicas

	bundle.Summary = fmt.Sprintf("Health samples show latest status %s, readiness %d/%d, restart delta %d.", newest.Status, newest.ReadyReplicas, newest.DesiredReplicas, restartDelta)
	bundle.Stats = map[string]float64{
		"sampleCount":        float64(len(samples)),
		"latestReady":        float64(newest.ReadyReplicas),
		"latestDesired":      float64(newest.DesiredReplicas),
		"warningEventCount":  float64(newest.WarningEventCount),
		"restartDelta":       float64(restartDelta),
		"latestRestartCount": float64(newest.RestartCount),
	}
	if readinessDegraded {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "readiness_degraded", Severity: "critical", Value: fmt.Sprintf("%d/%d", newest.ReadyReplicas, newest.DesiredReplicas)})
	}
	if restartDelta > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "restart_count_increased", Severity: "warning", Value: restartDelta})
	}
	if newest.WarningEventCount > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "warning_events_present", Severity: "warning", Value: newest.WarningEventCount})
	}
	return bundle
}
