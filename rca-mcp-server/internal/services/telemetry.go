package services

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

type LogService struct {
	base serviceBase
}

type MetricService struct {
	base serviceBase
}

type TraceService struct {
	base serviceBase
}

func (s *LogService) GetLogs(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	logs, err := s.base.deps.Logs.QueryLogs(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end, c.Constraints.MaxLogLines)
	if err != nil && s.base.deps.Kubernetes != nil {
		logs, err = s.base.deps.Kubernetes.Logs(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID, end.Sub(start), c.Constraints.MaxLogLines)
	}
	if err != nil {
		return withError(evidence.SourceLogs, c.Scope, start, end, err), nil
	}
	return preprocess.Logs(c.Scope, start, end, logs, c.Constraints.MaxLogLines), nil
}

func (s *MetricService) GetMetrics(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	series, err := s.base.deps.Metrics.QueryDeploymentMetrics(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end)
	if err != nil {
		return withError(evidence.SourceMetrics, c.Scope, start, end, err), nil
	}
	return preprocess.Metrics(c.Scope, start, end, series, c.Constraints.MaxSamples), nil
}

func (s *TraceService) GetTraces(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	traces, err := s.base.deps.Traces.QueryDeploymentTraces(ctx, c.Scope.ServiceName, start, end)
	if err != nil {
		return withError(evidence.SourceTraces, c.Scope, start, end, err), nil
	}
	return preprocess.Traces(c.Scope, start, end, traces, c.Constraints.MaxSpans), nil
}
