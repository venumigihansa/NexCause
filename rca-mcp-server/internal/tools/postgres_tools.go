package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

func (r *Registry) getHealthSamples(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	samples, err := r.deps.Store.ListHealthSamples(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceHealthSample, c.Scope, start, end, err), nil
	}
	return preprocess.HealthSamples(c.Scope, start, end, samples, c.Constraints.MaxSamples), nil
}

func (r *Registry) getRuntimeConfigs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	configs, err := r.deps.Store.ListRuntimeConfigs(ctx, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceRuntime, c.Scope, start, end, err), nil
	}
	return preprocess.RuntimeConfigs(c.Scope, start, end, configs, c.Constraints.MaxSamples), nil
}

func (r *Registry) getRecentChanges(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	changes, err := r.deps.Store.ListRecentChanges(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceChanges, c.Scope, start, end, err), nil
	}
	return preprocess.RecentChanges(c.Scope, start, end, changes, c.Constraints.MaxSamples), nil
}
