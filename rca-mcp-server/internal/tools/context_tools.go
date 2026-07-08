package tools

import (
	"context"

	rcacontext "rca-mcp-server/internal/context"
)

func (r *Registry) getRCAContext(ctx context.Context, args map[string]any) (rcacontext.RCAContext, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return rcacontext.RCAContext{}, err
	}
	return r.deps.Services.Context.GetRCAContext(ctx, req)
}
