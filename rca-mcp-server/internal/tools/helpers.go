package tools

import (
	"fmt"

	"rca-mcp-server/internal/services"
)

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

func evidenceRequest(args map[string]any) (services.EvidenceRequest, error) {
	runID, incidentID, err := requiredRunIncident(args)
	if err != nil {
		return services.EvidenceRequest{}, err
	}
	return services.EvidenceRequest{RunID: runID, IncidentID: incidentID}, nil
}
