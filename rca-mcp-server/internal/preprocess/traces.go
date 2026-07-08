package preprocess

import (
	"fmt"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func Traces(scope evidence.Scope, start time.Time, end time.Time, traces []adapters.TraceSummary, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceTraces, scope, start, end)
	slowCount := 0
	failedCount := 0
	maxDuration := 0.0
	for _, trace := range traces {
		if trace.DurationMs > maxDuration {
			maxDuration = trace.DurationMs
		}
		if trace.DurationMs >= 1000 {
			slowCount++
		}
		if trace.Status == "error" {
			failedCount++
		}
	}

	trimmed := trimAny(toAnySlice(traces), limit)
	bundle.Samples = trimmed.items
	bundle.Truncated = trimmed.truncated
	bundle.Stats = map[string]float64{
		"traceCount":     float64(len(traces)),
		"slowTraceCount": float64(slowCount),
		"failedCount":    float64(failedCount),
		"maxDurationMs":  maxDuration,
	}
	bundle.Summary = fmt.Sprintf("Processed %d trace summary record(s), with %d slow trace(s).", len(traces), slowCount)
	if slowCount > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "slow_traces_present", Severity: "warning", Value: slowCount})
	}
	if failedCount > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "failed_traces_present", Severity: "warning", Value: failedCount})
	}
	return bundle
}
