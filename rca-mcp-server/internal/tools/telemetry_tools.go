package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

func (r *Registry) getLogs(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	logs, err := r.deps.Logs.QueryLogs(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end, c.Constraints.MaxLogLines)
	if err != nil && r.deps.Kubernetes != nil {
		logs, err = r.deps.Kubernetes.Logs(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID, end.Sub(start), c.Constraints.MaxLogLines)
	}
	if err != nil {
		return withError(evidence.SourceLogs, c.Scope, start, end, err), nil
	}
	return preprocess.Logs(c.Scope, start, end, logs, c.Constraints.MaxLogLines), nil
}

func (r *Registry) getMetrics(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	series, err := r.deps.Metrics.QueryDeploymentMetrics(ctx, c.Scope.Namespace, c.Scope.DeploymentName, start, end)
	if err != nil {
		return withError(evidence.SourceMetrics, c.Scope, start, end, err), nil
	}
	return preprocess.Metrics(c.Scope, start, end, series, c.Constraints.MaxSamples), nil
}

func (r *Registry) getTraces(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	traces, err := r.deps.Traces.QueryDeploymentTraces(ctx, c.Scope.ServiceName, start, end)
	if err != nil {
		return withError(evidence.SourceTraces, c.Scope, start, end, err), nil
	}
	return preprocess.Traces(c.Scope, start, end, traces, c.Constraints.MaxSpans), nil
}
