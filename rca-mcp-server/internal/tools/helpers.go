package tools

import (
	"context"
	"fmt"
	"time"

	rcacontext "rca-mcp-server/internal/context"
	"rca-mcp-server/internal/evidence"
)

func (r *Registry) scopedContext(ctx context.Context, args map[string]any) (rcacontext.RCAContext, time.Time, time.Time, error) {
	c, err := r.getRCAContext(ctx, args)
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	start, end, err := c.WindowTimes()
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	return c, start, end, nil
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
