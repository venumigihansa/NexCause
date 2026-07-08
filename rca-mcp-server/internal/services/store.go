package services

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

type StoreService struct {
	base serviceBase
}

func (s *StoreService) GetHealthSamples(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	samples, err := s.base.deps.Store.ListHealthSamples(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceHealthSample, c.Scope, start, end, err), nil
	}
	return preprocess.HealthSamples(c.Scope, start, end, samples, c.Constraints.MaxSamples), nil
}

func (s *StoreService) GetRuntimeConfigs(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	configs, err := s.base.deps.Store.ListRuntimeConfigs(ctx, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceRuntime, c.Scope, start, end, err), nil
	}
	return preprocess.RuntimeConfigs(c.Scope, start, end, configs, c.Constraints.MaxSamples), nil
}

func (s *StoreService) GetRecentChanges(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	changes, err := s.base.deps.Store.ListRecentChanges(ctx, c.Scope.DeploymentID, start, end, c.Constraints.MaxSamples)
	if err != nil {
		return withError(evidence.SourceChanges, c.Scope, start, end, err), nil
	}
	return preprocess.RecentChanges(c.Scope, start, end, changes, c.Constraints.MaxSamples), nil
}
