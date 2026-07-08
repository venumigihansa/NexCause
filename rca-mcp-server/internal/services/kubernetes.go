package services

import (
	"context"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/preprocess"
)

type KubernetesService struct {
	base serviceBase
}

func (s *KubernetesService) GetDeploymentStatus(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if s.base.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	status, err := s.base.deps.Kubernetes.DeploymentStatus(ctx, c.Scope.Namespace, c.Scope.DeploymentName)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.DeploymentStatus(c.Scope, start, end, status), nil
}

func (s *KubernetesService) GetPods(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if s.base.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	pods, err := s.base.deps.Kubernetes.Pods(ctx, c.Scope.Namespace, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Pods(c.Scope, start, end, pods, c.Constraints.MaxSamples), nil
}

func (s *KubernetesService) GetEvents(ctx context.Context, req EvidenceRequest) (evidence.Bundle, error) {
	c, start, end, err := s.base.scopedContext(ctx, req)
	if err != nil {
		return evidence.Bundle{}, err
	}
	if s.base.deps.Kubernetes == nil {
		return unavailable(evidence.SourceKubernetes, c.Scope, start, end, "kubernetes adapter is not configured"), nil
	}
	events, err := s.base.deps.Kubernetes.Events(ctx, c.Scope.Namespace, c.Scope.DeploymentName, c.Scope.AppID, c.Scope.DeploymentID)
	if err != nil {
		return withError(evidence.SourceKubernetes, c.Scope, start, end, err), nil
	}
	return preprocess.Events(c.Scope, start, end, events, c.Constraints.MaxSamples), nil
}
