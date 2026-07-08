package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

func (r *Registry) getDeploymentStatus(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	status, err := r.deps.Kubernetes.DeploymentStatus(ctx, c.Scope.Namespace, c.Scope.DeploymentName)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.DeploymentStatus(c.Scope, start, end, status), nil
}

func (r *Registry) getPods(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	pods, err := r.deps.Kubernetes.Pods(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Pods(c.Scope, start, end, pods, c.Constraints.MaxSamples), nil
}

func (r *Registry) getKubernetesEvents(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	c, start, end, err := r.scopedContext(ctx, args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if r.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	events, err := r.deps.Kubernetes.Events(ctx, c.Scope.Namespace, c.Scope.DeploymentName, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Events(c.Scope, start, end, events, c.Constraints.MaxSamples), nil
}
