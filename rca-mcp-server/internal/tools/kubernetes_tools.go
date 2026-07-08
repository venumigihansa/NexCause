package tools

import (
	"context"

	"rca-mcp-server/internal/evidence"
)

func (r *Registry) getDeploymentStatus(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Kubernetes.GetDeploymentStatus(ctx, req)
}

func (r *Registry) getPods(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Kubernetes.GetPods(ctx, req)
}

func (r *Registry) getKubernetesEvents(ctx context.Context, args map[string]any) (evidence.Bundle, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return evidence.Bundle{}, err
	}
	return r.deps.Services.Kubernetes.GetEvents(ctx, req)
}
