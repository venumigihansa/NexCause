package tools

import (
	"context"

	rcacontext "rca-mcp-server/internal/context"
)

func (r *Registry) getRCAContext(ctx context.Context, args map[string]any) (rcacontext.RCAContext, error) {
	runID, incidentID, err := requiredRunIncident(args)
	if err != nil {
		return rcacontext.RCAContext{}, err
	}
	return r.deps.ContextBuilder.Build(ctx, runID, incidentID)
}
