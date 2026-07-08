package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
)

func (r *Registry) getLogs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Logs.GetLogs(ctx, req)
}

func (r *Registry) getMetrics(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Metrics.GetMetrics(ctx, req)
}

func (r *Registry) getTraces(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Traces.GetTraces(ctx, req)
}
