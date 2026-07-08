package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
)

func (r *Registry) getHealthSamples(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Store.GetHealthSamples(ctx, req)
}

func (r *Registry) getRuntimeConfigs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Store.GetRuntimeConfigs(ctx, req)
}

func (r *Registry) getRecentChanges(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Store.GetRecentChanges(ctx, req)
}
